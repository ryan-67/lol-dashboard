# CitoAPI Scope & Integration Strategy for nucky.gg + nuckyAI

Last updated: 2026-06-25  
Plan context: CitoAPI Pro (`$50/mo`, 250k requests, LoL endpoints + webhooks support)  
Primary objective: make nucky.gg a **contextual analytics platform** (not raw-stat mirror), with nuckyAI as an on-demand analyst and live hub as a real-time layer.

---

## Executive Direction

### Bottom line

Use a **hybrid architecture**:

- **Keep OE as long-range historical backbone** (2014–2026 and onward snapshots).
- **Use CitoAPI as freshness + depth layer** for:
  - faster updates (schedule/results/live status)
  - richer per-game analytics not reliably present in OE
  - event/timeline data needed for advanced charts and nuckyAI reasoning
- Do **not** hard-replace OE immediately. Move to Cito-primary incrementally after coverage and quality gates pass.

This is the most robust long-term path for product quality, UX consistency, and risk management.

---

## 1) OE Refresh vs Cito Refresh — Long-Term Decision

## Current pain with OE-only

1. Data freshness depends on OE CSV update cadence.
2. Live features and static dashboard can drift out-of-sync (live says X, dashboard still says old state).
3. Some advanced stats are unavailable or inconsistent by region/split.

## Cito-driven refresh advantages

1. **Near-real-time lifecycle coverage**
   - upcoming → live → completed transitions are available directly via API.
2. **More complete event and postgame structures**
   - timeline/gold/objective/plates/distribution endpoints unlock richer analytics.
3. **Better UX consistency**
   - live hub and dashboard can share the same upstream state model.

## Why not full OE replacement immediately

1. OE has deep historical continuity (2014+), while API plans may have practical lookback constraints.
2. Provider-level gaps or schema changes can happen; single-provider lock-in increases risk.
3. Migration complexity (ID mapping, provenance, recalculation parity, backfill strategy).

## Recommended architecture choice

### Near term (recommended now)
- **OE = historical truth layer**
- **Cito = freshness + enrichment layer**
- Unified analytics views should read from a **normalized warehouse model** with source provenance.

### Mid term
- Evaluate Cito as primary for new seasons/splits once:
  - endpoint coverage validated across LCK/LPL/LEC/LCS + internationals
  - metric parity checks pass
  - automated QA and drift alerts are stable

### Long term
- Maintain dual-source resilience (OE fallback snapshots + Cito online sync), even if Cito becomes primary.

---

## 2) Dashboard Data Expansion Scope (Analytics-First)

Goal: expand meaningful interpretation, trend modeling, and matchup intelligence (not raw tables).

## Key data families Cito can unlock

### A) Timeline and momentum data
- Endpoints:
  - `GET /lol/games/{gameId}/gold`
  - `GET /lol/games/{gameId}/timeline`
  - `GET /lol/games/{gameId}/postgame`
- Product upgrades:
  - true gold-diff curve (replace approximated GD@15 proxy visuals)
  - momentum swing score (lead volatility + comeback pressure)
  - game state phase segmentation (early/mid/late control shifts)

### B) Objective and map control detail
- Endpoints:
  - `GET /lol/games/{gameId}/objectives`
  - `GET /lol/games/{gameId}/plates`
  - `GET /lol/games/{gameId}/vision`
  - `GET /lol/games/{gameId}/jungle-share`
  - `GET /lol/teams/{slug}/objectives`
- Product upgrades:
  - objective conversion efficiency (objective secured after advantage)
  - objective steal pressure profiles
  - plate tempo by lane/phase
  - vision efficiency (vision gained per objective window)
  - jungle pressure theft profile (invade success and role impact)

### C) Draft and composition analytics
- Endpoints:
  - `GET /lol/analytics/drafts/{matchId}`
  - `GET /lol/matches/{matchId}/games`
  - `GET /lol/games/{gameId}/builds`
  - `GET /lol/champions/meta`
  - `GET /lol/champions/{championId}/matchups`
- Product upgrades:
  - draft leverage score (counter-value and comp coherence)
  - draft plan archetype labeling (front-to-back, pick, split threat, etc.)
  - side-based draft preference maps by team
  - patch meta drift visualization over time

### D) Form, trends, and predictive framing
- Endpoints:
  - `GET /lol/analytics/teams/{slug}/trend`
  - `GET /lol/analytics/players/{playerId}/trend`
  - `GET /lol/players/{playerId}/form`
  - `GET /lol/analytics/teams/{slug}/win-conditions`
  - `GET /lol/rankings`
- Product upgrades:
  - rolling form confidence index
  - win-condition alignment model (team identity vs actual wins)
  - “style mismatch” warnings in matchup pages
  - predictive confidence bands (explicit uncertainty, not hard picks)

### E) Ecosystem context (optional but high value)
- Endpoints:
  - `GET /lol/transfers*`
  - `GET /lol/teams/{slug}/roster/history`
  - `GET /lol/trending`
- Product upgrades:
  - roster continuity impact signals
  - player movement context overlays in performance trend charts
  - narrative + market sentiment context cards

---

## 3) nuckyAI Enhancement Scope with Cito

nuckyAI should become a stronger evidence-grounded analyst with lower dependency on generic web search.

## Current state
- nuckyAI currently uses OE + RAG + Tavily.
- Some questions require external web context due to missing structured stats/events.

## Cito-powered nuckyAI improvements

### A) Better answer grounding
- Replace many web fallback lookups with deterministic API tool calls:
  - recent form/trends
  - player/team matchup stats
  - game timelines/objective control
  - draft and build context

### B) Better explanation quality
- AI can answer in “because” format with concrete factors:
  - “Team X wins when dragon control > threshold and lane gold volatility remains low”
  - “Player Y’s current patch form is up, but clutch variance remains unstable”

### C) Better prediction workflows
- Build structured “prediction packet” per query:
  - form delta
  - draft leverage expectation
  - objective control edge
  - volatility/risk score
- AI outputs should include:
  - confidence range
  - top drivers
  - failure modes (what must go wrong for the prediction to fail)

### D) Reduce low-signal web dependence
- Tavily becomes a context supplement (news/narrative/roster announcements), not primary numeric source.
- Prefer source ranking:
  1. Cito deterministic endpoints
  2. OE historical aggregates
  3. RAG verified docs
  4. Web snippets (only when needed)

---

## 4) Live Match Hub Scope with Cito

Goal: real-time analytics companion, not scoreboard clone.

## Core live architecture

### Input
- Poll or webhook-driven events from:
  - `GET /lol/live`
  - `GET /lol/live/{matchId}/series`
  - `GET /lol/live/{gameId}/events`
  - `GET /lol/live/{gameId}/window`
  - `GET /lol/live/{gameId}/stats`
  - `GET /lol/live/{gameId}/visual-state`

### Processing
- Stream processor computes:
  - momentum shifts
  - objective swing significance
  - game-state inflection windows
  - win-condition trajectory flags

### Output UX
- Live timeline with “why this matters” annotations.
- Team win-path tracker (conditions currently met vs unmet).
- nuckyAI “live analyst mode” for in-game Q&A.

---

## 5) Feature Ideas by Product Surface

## Overview tabs
- “What changed this week” from trend deltas and patch impact.
- standout cards with contextual reasons (not just top stat rows).
- region/league style fingerprints (tempo/control variance).

## Team pages
- map-control identity radar (vision/objectives/tempo metrics).
- gold swing resilience chart.
- win-condition dependency profile + fragility score.

## Player pages
- form stability vs volatility over 10/20/50 windows.
- role-specific impact decomposition.
- champion pool flexibility + counter exposure.

## Champion pages
- patch-specific power phase graph (early/mid/late effectiveness).
- matchup context by team/player usage archetypes.
- risk-reward profile for drafting under current meta.

## Matchup pages
- style clash engine (macro tempo, objective conversion, draft bias).
- lane pressure and jungle interaction predictions.
- scenario trees (“if Team A controls first two drakes…”).

## Tournament + series pages
- bracket path difficulty index.
- adaptation score across series games.
- draft evolution narrative (game-to-game strategic pivot detection).

## Betting-adjacent insights (without presenting as guaranteed picks)
- confidence-weighted prediction cards.
- edge indicators with explicit uncertainty.
- anti-overfit warnings (small sample, patch reset, roster instability).

---

## 6) Data Platform Blueprint

## Recommended source-of-truth model

### Bronze (raw source captures)
- `oe_raw_*` (CSV-derived snapshots)
- `cito_raw_*` (endpoint payload archives)

### Silver (normalized entities)
- leagues, tournaments, matches, games, teams, players
- timelines, objectives, plates, builds, distributions
- source metadata and freshness stamps

### Gold (analytics marts for UI + nuckyAI tools)
- team_form_mart
- player_form_mart
- draft_leverage_mart
- momentum_mart
- objective_control_mart
- prediction_feature_mart

## Critical support tables
- `game_linkage` (oe_gameid ↔ cito_game_id mapping confidence)
- `data_provenance` (metric, source, loaded_at, trust grade)
- `metric_quality_audit` (null rates, drift checks, outlier alerts)

---

## 7) Endpoint-to-Capability Mapping (Priority)

## P0 (immediate value)
- `GET /lol/games/{gameId}/postgame`
- `GET /lol/games/{gameId}/gold`
- `GET /lol/games/{gameId}/objectives`
- `GET /lol/games/{gameId}/plates`
- `GET /lol/games/{gameId}/vision`
- `GET /lol/games/{gameId}/jungle-share`
- `GET /lol/schedule/results`
- `GET /lol/tournaments/live`

## P1 (analytics depth)
- `GET /lol/analytics/teams/{slug}/trend`
- `GET /lol/analytics/players/{playerId}/trend`
- `GET /lol/analytics/drafts/{matchId}`
- `GET /lol/analytics/teams/{slug}/win-conditions`
- `GET /lol/players/{playerId}/form`
- `GET /lol/champions/meta`

## P2 (narrative/context expansion)
- `GET /lol/transfers*`
- `GET /lol/teams/{slug}/roster/history`
- `GET /lol/rankings`
- `GET /lol/trending`

## P3 (live hub advanced)
- `GET /lol/live/{gameId}/events`
- `GET /lol/live/{gameId}/window`
- `GET /lol/live/{gameId}/stats`
- `GET /lol/live/{gameId}/visual-state`
- `GET /lol/live/{matchId}/series`

---

## 8) Migration Roadmap (Recommended)

## Phase 0 — Validation (1–2 weeks)
- Verify endpoint payload quality on real LCK/LPL/LEC/LCS sample.
- Build `game_linkage` mapping prototype.
- Define metric parity tests vs OE for existing dashboard metrics.

## Phase 1 — Enrichment without disruption (2–4 weeks)
- Add Cito postgame ingestion for completed games.
- Replace known weak visuals first (team gold graph, objective charts).
- Keep OE ingestion unchanged; combine in normalized marts.

## Phase 2 — nuckyAI deterministic upgrade (2–4 weeks)
- Add Cito-backed tools for trend/objective/timeline/draft questions.
- Re-rank evidence hierarchy to prefer API deterministic data over web snippets.
- Add confidence and uncertainty framing in prediction responses.

## Phase 3 — Live hub launch (3–6 weeks)
- Stand up live ingestion path and stream processor.
- Build “what changed and why” live timeline UX.
- Integrate live-aware nuckyAI mode.

## Phase 4 — Cito-primary evaluation gate
- If quality + coverage targets pass for 2+ consecutive splits:
  - make Cito primary for new data refresh cycles
  - keep OE as historical archive + safety fallback

---

## 9) Risks, Constraints, and Mitigations

1. **Provider drift / schema changes**
   - Mitigation: contract tests + fallback parsers + source versioning.
2. **Dual-source conflicts**
   - Mitigation: provenance labels + deterministic conflict rules by metric type.
3. **Coverage gaps by league/period**
   - Mitigation: keep OE historical continuity; fill with Cito where available.
4. **Cost spikes from uncontrolled polling/backfills**
   - Mitigation: webhook-first where possible, cache aggressively, one-time backfill windows.
5. **Prediction misuse risk**
   - Mitigation: display confidence ranges, assumptions, and uncertainty language.

---

## 10) Success Metrics (What “good” looks like)

## Data freshness
- median completed-game availability latency < target threshold vs OE baseline.

## Product quality
- reduction in “missing data” states for advanced charts.
- increase in engagement on analytics views (trend/objective/draft cards).

## nuckyAI quality
- lower hallucination rate on stat-heavy queries.
- higher deterministic citation share (API/warehouse vs web snippets).

## Live hub readiness
- stable event ingestion and low lag during high-profile matches.

---

## 11) Implementation Decision

For nucky.gg’s goals (analytics-first, context-heavy, prediction-capable), **CitoAPI Pro should be adopted as strategic infrastructure**, but as part of a **hybrid migration**:

- OE remains crucial for deep historical continuity.
- Cito drives freshness, richer game telemetry, live capability, and stronger nuckyAI grounding.
- Long-term robustness comes from normalized multi-source architecture, not single-source replacement.

---

## Appendix A — Existing recap budget policy (keep)

Current recap generation policy remains valid:

- One-time bulk LLM summaries for 2026 Spring playoffs.
- Ongoing summaries for newly completed series.

Cito integration can improve trigger timing and context quality (especially via completed-match lifecycle hooks) without forcing unbounded LLM spend.
