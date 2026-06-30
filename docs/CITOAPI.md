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

Goal: a lolesports-flavored live match center (think Real / FotMob for LoL esports):
live scores + stats now, community discussion layer later. Not a raw scoreboard clone.

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

## 4a) Live Match Hub — v1 Prototype (IMPLEMENTED 2026-06-30)

Status: shipped behind the new **Live** top-nav tab. Built during MSI 2026 to
validate the live pipeline. The architecture is "edge proxy + client polling".

### Architecture (decided)

```
Browser (SPA)
  └─ src/lib/live/citoLiveClient.ts   ── fetch ──▶  Supabase Edge Function
                                                     supabase/functions/cito-live
                                                       └─ injects CITO_API_KEY (server-side)
                                                       └─ allowlisted resources only
                                                       └─ short Cache-Control per resource
                                                          └─ CitoAPI
```

- The Cito key is **server-side only** (`.env`, GitHub Actions, and
  `supabase secrets set CITO_API_KEY=...`). The browser never sees it.
- Client polls: hub list every 15s, match room every 10s.
- All UI renders from a normalized model (`src/lib/live/types.ts`); raw Cito
  shapes are mapped in `src/lib/live/liveAdapters.ts`. Swapping providers or
  adjusting to a new live shape only touches the adapter.

### Endpoints used (real shapes captured 2026-06-30)

Samples saved to `docs/cito/live-samples.json` + `docs/cito/live-samples2.json`
(run `tsx scripts/cito/probe-live.ts` / `probe-live2.ts` to refresh during a live game).

| Resource (edge param) | Cito path | Notes |
|---|---|---|
| `live` | `/lol/live` | `{ data: [LiveItem], lastKnown: [...], retryAfterSeconds }`. `data` empty when nothing live; `lastKnown` is stale cache. LiveItem (when live): `matchId, currentGameId, state, score:{blue,red}, statsAvailable, blueTeam/redTeam {slug,kills,gold,towers,dragons,barons}, gameTime`. |
| `schedule-today` / `schedule-upcoming` | `/lol/schedule/today` `/lol/schedule/upcoming` | `{ data: [event] }`. event: `matchId, leagueName, leagueSlug, tournamentName, blockName, team1/team2 {slug,name,code,logoUrl,score}, strategy:"Bo5", startTime, state:"unstarted|inProgress|completed"`. |
| `match` | `/lol/matches/{id}` | `{ matchId, team1/team2 {slug,name,shortName,logoUrl,score}, strategy, state, gameCount, vodUrl }`. |
| `match-games` | `/lol/matches/{id}/games` | `[{ gameId, gameNumber, blueTeam/redTeam {slug,name,shortName,logoUrl,kills,gold,towers,dragons,barons,heralds,inhibitors,bans}, winnerSlug, winningSide, duration, patch, firstObjectives }]`. |
| `match-player-stats` | `/lol/matches/{id}/player-stats` | `{ data:[{ gameId, gameNumber, teams:{blue,red}, players:[...] }] }`. `players` populated post-sync. |
| `match-drafts` | `/lol/analytics/drafts/{id}` | `{ gameId, gameNumber, blueTeam, redTeam, blueBans, redBans, bluePicks, redPicks, dataAvailability:{hasDraft} }`. |
| `match-series` | `/lol/live/{id}/series` | Series-level live state (often `not_active_or_not_ready` outside a live window). |
| `game-window` | `/lol/live/{gameId}/window` | Riot live feed window (per-player gold/cs/kda). `not_ready` until the game is actually live. |
| `game-stats` | `/lol/live/{gameId}/stats` | Live per-player stats (the scoreboard feed). `not_ready` until live; stored fallback `/lol/games/{gameId}/stats` after completion. |
| `game-gold` | `/lol/games/{gameId}/gold` | `[{ timestamp(ms), blueGold, redGold, goldDiff }]`. |

> Live `window`/`stats` per-player field names could NOT be observed (no game was
> live during the build). The adapter (`adaptPlayerStats`) reads a defensive set
> of aliases (`summonerName|playerName|name`, `championName|champion`,
> `cs|creepScore|minionsKilled`, `gold|totalGold`, `items`, plus `gd15`,
> `csd15`, `xpd15`, `platesTaken`, `damageToChampions/Turrets/Objectives`, etc.).
> **TODO: confirm exact live field names during a real game and tighten the adapter.**

### What v1 ships
- **Live** top-nav tab (right of nuckyAI) → `/live`.
- League filter tabs: **ALL / LCK / LPL / LEC / LCS**. ALL = tier-1 regions +
  internationals (First Stand, MSI, Worlds); region tabs show only that region;
  internationals appear under ALL only. Minor leagues are excluded.
  (See `src/lib/live/leagues.ts`.)
- Hub list: live + confirmed upcoming rows with date/time; **live rows carry an
  animated blinking red marker** (`.live-badge-dot`, respects reduced-motion).
- Each row links to a match room `/live/:matchId`.
- Match room:
  - team logos + names, series score X–Y, current game # + status badge
  - in-game stats bar: kills, team gold (+diff), towers, dragons, barons, clock
  - draft (picks/bans per side, bans visibly struck through)
  - live scoreboard per team (champ icon, level, name, KDA, CS, gold, GD@15, items)
  - **click a player name → expandable detailed stats** (KDA, CS & CS/min, gold &
    G/min, GD/CSD/XPD@15, plates taken, damage to champions/turrets/objectives, vision)
  - games list (per-game results)
  - discussion teaser (v2 placeholder)
- Data-source-neutral copy throughout (never names Cito/OE; "Data unavailable",
  "stats will appear once the feed is published", etc.).

### File map
- `src/lib/live/types.ts` — normalized model
- `src/lib/live/leagues.ts` — filter + league classification
- `src/lib/live/citoLiveClient.ts` — edge-proxy fetch + **mock mode**
- `src/lib/live/liveAdapters.ts` — Cito → normalized mappers
- `src/lib/live/loadLive.ts` — `fetchLiveHub()`, `fetchMatchRoom(matchId)`
- `src/components/live/*` — UI (list, badge, team logo, stats bar, draft, scoreboard, tabs)
- `src/pages/Live.tsx`, `src/pages/LiveMatchRoom.tsx`
- `supabase/functions/cito-live/index.ts` — server-side proxy
- `public/data/live-mock/*.json` — offline test fixtures

### Testing without a live match (answers the "how to test?" question)
1. **Mock mode (primary).** Append `?mock=1` to any live URL
   (`/live?mock=1`, `/live/lol-match-mock-msi-001?mock=1`) or set
   `VITE_LIVE_MOCK=1` in `.env`, or `localStorage['nucky-live-mock']='1'`.
   All requests are served from `public/data/live-mock/*.json` — a full synthetic
   live MSI match (T1 vs KC, Game 2, scoreboard + draft + expandable player stats)
   plus upcoming rows for every league filter. The entire UI is exercisable offline.
2. **Real probe (when a game is live).** `tsx scripts/cito/probe-live.ts` captures
   the real `/lol/live` + per-game shapes so the adapter can be confirmed/tightened.
3. **Stored games.** Completed games still return `match-games`, drafts, and gold,
   so the room renders real team/series data even between live windows.

### Deploy checklist (for the live path, not needed for mock testing)
- [ ] `supabase functions deploy cito-live`
- [ ] `supabase secrets set CITO_API_KEY=...`
- [ ] verify `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the frontend build env
- [ ] during a live MSI/LCK game: confirm `game-stats` player field names and
      tighten `adaptPlayerStats` if needed

### Bug-fix pass — 2026-06-30 (gold timeline + schedule accuracy)

Three issues reported after the v1 prototype, with fixes:

1. **Per-game Gold Timeline redesigned to a diverging, two-team chart.**
   `src/components/series/SeriesGameInsights.tsx` no longer plots a single
   one-team perspective line. The y-axis is now symmetric (`[-absMax, absMax]`)
   so 0 sits at center and *both* directions measure the magnitude of a team's
   gold lead (y-axis labels show absolute values, e.g. `1.6k` top and bottom).
   The line is split into two sign-clamped series (`aLead` / `bLead`) with a
   zero point inserted at every lead change, so the visible color is the leading
   team's brand color at every minute. A legend (team logo + color swatch +
   "{TEAM} lead") and a custom tooltip ("{TEAM} +X,XXX gold") were added.

2. **Gold timeline "Data unavailable" — root cause + fix.** The resolver order
   is already CitoAPI → gol.gg → Oracle's Elixir (`goldTimelineResolve.ts`), and
   only falls to "Data unavailable" when *all* sources miss. The real problem:
   the gol.gg fallback asset `public/data/gol_game_cache.json` (built by
   `scripts/enrich_gol_advanced_stats.py`) was **gitignored and never committed**,
   so production always 404'd it and the fallback was dead — any game missing
   from the Cito `cito_game_gold` table dropped straight to unavailable. Fix:
   added `!public/data/gol_game_cache.json` to `.gitignore` and committed the
   populated cache so the gol.gg gold timelines actually ship.
   - Refresh when new games are played:
     `python scripts/enrich_gol_advanced_stats.py --year 2026`
   - TODO: an on-demand server-side gol.gg proxy for games newer than the last
     cache build (browser-side is blocked by CORS).

3. **Live hub "no upcoming matches" — schedule now sourced from the static
   CitoAPI cache.** Previously `fetchLiveHub()` only read the `cito-live` edge
   function; with no `VITE_SUPABASE_URL` / un-deployed function it returned
   nothing, so even confirmed MSI matches were absent. Fix: `fetchLiveHub()` now
   merges `public/data/cito_schedule_cache.json`
   (`src/lib/live/loadScheduleCache.ts`, built by `scripts/cito/sync-schedule.ts`
   from CitoAPI) as the always-available primary upcoming source; the edge
   function (when available) overrides cache rows with richer data (logos,
   bestOf) and supplies the live overlay. The upcoming horizon cap was removed —
   the hub now shows *all* confirmed future matches (live first, then by start
   time). Refresh: `npm run sync:cito-schedule`.
   - TODO: cross-check the CitoAPI schedule against the official Riot
     (lolesports.com) persisted schedule inside `sync-schedule.ts` to fill team
     names/logos for matches Cito still lists as TBD and catch any Cito gaps.

### TODO / next (v2)
- [ ] Confirm live `window`/`stats` player field names against a real game.
- [ ] Webhooks (paid plan: `lol.score.updated`, `lol.live_game.updated`) to replace
      polling for cleaner updates and lower request volume.
- [ ] Momentum / win-path annotations + live gold-diff chart in the room.
- [ ] **Discussion layer** (Real-style): comments, reactions/stickers, player
      ratings. Read = public; post = logged-in. See `nuckyLive_scope.txt` §3–§6
      for the schema (`match_comments`, `match_ratings`, `match_player_tags`) — the
      hub/room shell built here is the surface those bolt onto.
- [ ] nuckyAI "live analyst" mode inside the room.
- [ ] Persist live snapshots to Supabase (optional cron) for history + cheaper reads.

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
