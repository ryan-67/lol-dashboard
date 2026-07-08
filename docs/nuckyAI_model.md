# nuckyAI Prediction Model — Scope Document

**Status:** Phase 1–2 shipped (offline training); **Phase 3 shipped** (nuckyAI chat integration); **Phase 3.5 shipped** (SOS/GPR grounding + smoke-test fixes)  
**Owner:** nucky.gg / lol-dashboard  
**Last updated:** 2026-07-08

---

## 1. Goal

Train a machine-learning layer on ~2 years of tier-1 professional match data so nuckyAI can:

- Make **high-confidence** matchup and series predictions (not LLM guesses)
- Analyze **draft compositions** with patch-aware champion/player trends
- Surface **team style vs style** historical patterns (engage vs poke, scaling vs tempo, etc.)
- Identify **favorable/unfavorable conditions** (GD@15 thresholds, objective control, champion meta, player-champion comfort)
- **Continuously improve** as new OE games ingest and the model retrains

The LLM (nucky persona) remains the **explainer**; the model supplies a structured **prediction packet** with probabilities, drivers, trends, and failure modes. Numbers in chat must come from the packet — never from training memory.

**Future UI (M5):** Pre-match preview sections on nucky.gg (`/match/:id/preview`) rendering the same packet as structured cards — high-impact trends, model lean, Kalshi edge. Backend packet shape is designed for this; UI is not built yet.

---

## 2. Non-Goals (v1)

- In-game live win-probability (belongs to Live Match Hub + Cito live feeds)
- Academy / tier-2 leagues (tier-1 only: LCK, LPL, LEC, LCS + MSI/Worlds/First Stand)
- Replacing Oracle's Elixir as the stats source of truth for raw box scores
- Full XGBoost tree runtime in Deno (v1 uses exported **logistic linear approximation**; raw tree JSON kept for v2)

---

## 3. Data Sources

| Source | Role | Window |
|--------|------|--------|
| **Oracle's Elixir** (`oe_slices`, player game logs) | Primary training data — per-game/player/team stats, drafts, patches | Rolling **24 months** |
| **CitoAPI** | Supplemental objectives, trends, draft analytics where OE is thin | Same window |
| **Patch metadata** | Major.minor buckets; champion balance context | Per game `patch` field |
| **Roster continuity** | Weight samples by lineup overlap | Derived from OE + Cito transfers |

**Recency weighting:** every training row gets  
`weight = exp(-λ × days_ago)` with λ tuned on validation (target half-life ~45 days).

**Patch bucketing:** train calibration per `major.minor` patch; blend with global model when patch sample size &lt; threshold (e.g. &lt; 200 games).

---

## 4. What the Model Should Learn

### 4.1 Player × Champion performance

- Patch-bucketed win rate, GD@15, DPM, damage share per player-champion pair
- “Comfort” depth: games played, trend vs career baseline on that champ
- Role-normalized performance deltas (is this ADC's Jinx above role average on this patch?)
- **Artifact:** `player_champ_ratings.json` — used in full-mode packets and future preview UI

### 4.2 Team composition trends

- Win rate / objective control by comp archetype (front-to-back, pick, split, poke, wombo)
- Champion synergy pairs and ban efficiency per team
- Side preference (blue/red) and draft phase patterns
- **Artifacts:** `champ_meta.json`, `draft_synergy.json`

### 4.3 Matchup & style history

- Head-to-head series outcomes (decay-weighted)
- Style clash signals: tempo vs scaling, early objective rate vs late-game teamfight win rate
- Historical draft leverage when Team A faces Team B (or structurally similar comps)
- **Artifact:** `h2h_lookup.json`, `team_inference_state.json`

### 4.4 Trend / condition recognition

Threshold-based win-rate correlations exported for narrative + preview UI:

- GD@15 / GD@20 buckets vs win rate (global + per-patch)
- First dragon / herald / tower vs win rate
- Champion presence lift vs baseline on patch
- **Artifact:** `trend_insights.json`

Example insight: *“Teams ahead 1500+ gold at 15m win ~68% vs ~50% baseline.”*

### 4.5 Series outcome (primary target)

- **Label:** did Team A win the Bo3/Bo5?
- **Features:** form, roster strength, H2H, patch meta fit, draft pool depth, objective profiles, days rest, playoffs flag
- **Output:** `P(Team A wins)` + calibrated confidence interval

### 4.6 Team-specific profiles

Per-team analysis exported for chat and future preview UI:

- **Playstyle:** early-game focus by **lane** (top/mid/bot K+A@15 / KP share — jungle/support excluded from the "who do they play around" read since both roles naturally accrue early K+A; a jungle-centric override fires only when a team's early K+A is unnaturally skewed to the jungler alone), tempo (aggressive/scaling/balanced)
- **Stat deviations:** team stat vs **region median** and **global tier-1 median** (not raw value) — surfaces only when a team is a real outlier, not generic "ahead = win more" copy
- **Player win conditions:** vs role-region median GD@15 (not a flat global threshold)
- **Team win/loss patterns:** team-specific GD@15 and objective correlations
- **Clutch factor:** single-game "should've won but choked" / "stole one back" detection — blown-lead rate (losses when up 1000+g@15) and comeback rate (wins when down 1000+g@15), each compared to the league-wide baseline so it only narrates real outliers
- **Strengths / weaknesses** narrative bullets, ranked stat-deviation → clutch factor → playstyle → recent form → player conditions → patterns
- **Artifact:** `team_profiles.json`

### 4.7 Team strength / strength-of-schedule (SOS)

Cross-region comparisons (e.g. LCK vs LEC) are not apples-to-apples on raw rolling stats — a weaker domestic league inflates a team's own numbers. Two layers:

- **Official GPR (primary):** `gpr_snapshot.json`, mirrored live from lolesports' own Global Power Rankings via CitoAPI (`cito_supplement.write_gpr_snapshot`) — already encodes Riot's own context-of-play / recent-performance / in-game-execution / strength-of-opponent methodology, refreshed on every pipeline run. Used as the primary team-strength signal wherever both teams are covered (~50 tracked orgs).
- **Home-grown region Elo (fallback):** `region_elo.py` walk-forward Elo (domestic + international results) in `region_strength.json`. Used only for teams GPR doesn't cover (wildcard/academy squads at MSI/Worlds).

`predictionPacket.ts::blendWithRegionStrength` blends **65–88% strength / 7–20% structural model / 5–15% recent form** (weighted more toward strength when the matchup is cross-region) — see `docs/nuckyAI_model.md §8.6` for current calibration status.

### 4.8 Champion archetype / role / scaling grounding

Draft analysis previously relied on the LLM's training-era priors (e.g. treating Camille as a "flex" top laner after the meta already shifted her to support). Three artifacts ground this in actual recent data:

- **`champion_archetypes.json`** (hand-curated, static) — primary roles, damage type, range, playstyle tags (engage, poke, dive, disengage, split_push, scaling_carry, etc.), comp archetypes, scaling curve for 172 champions. Source of truth for kit-level style reasoning (dive vs disengage, poke-when-ahead, low-DPS-vs-tank, etc.).
- **`champ_role_profile.json`** (empirical, `train_draft_model.py`) — season-long **and** last-45-day role distribution per champion, flags `roleShift` when the recent primary role differs from the season-long one. `predictionPacket.ts::championGroundingFacts` always prefers the recent role.
- **`champ_scaling.json`** (empirical, `train_draft_model.py`) — GD@15/CSD@15 vs role median (lane-bully / weak-side flags) and DPM-by-duration (role-relative percentile lateGameScaler / frontLoaded flags), supplementary evidence alongside the hand-curated `scalingCurve`.

Draft edges (`DraftEdge.roleNote` / `styleNote` / `archetypeTags`) and per-side `compStyles` (aggregate archetype identity, e.g. "engage/dive comp") are injected into `[PREDICTION_PACKET]`; `draftTextSynthesisBlock()` / `PREDICTION_RULES` in `prompts.ts` instruct the LLM to reason about **style-matchup interactions** (dive vs disengage, poke vs gold state, low-DPS vs frontline tank) rather than just individual champion power level.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  OFFLINE TRAINING (Python)                                  │
│  scripts/ml/                                                │
│    build_feature_mart.py      → feature_mart.parquet        │
│    train_series_model.py      → series_model.json           │
│    train_draft_model.py       → champ_meta, synergy, player │
│    build_trend_insights.py    → trend_insights.json         │
│    export_artifacts.py        → deploy to agent-chat/ml/    │
└───────────────────────────┬─────────────────────────────────┘
                            │ nightly + post-OE-ingest
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  ARTIFACT STORE — supabase/functions/agent-chat/ml/         │
│    inference_bundle.json    (logistic linear scorer, v1)    │
│    series_model.json        (full XGBoost trees, v2)        │
│    team_form_snapshot.json  (current rolling form)          │
│    team_inference_state.json, h2h_lookup.json               │
│    champ_meta.json, draft_synergy.json                      │
│    player_champ_ratings.json, trend_insights.json           │
│    champ_role_profile.json, champ_scaling.json               │
│    champion_archetypes.json (hand-curated, static)           │
│    region_strength.json (fallback), gpr_snapshot.json (primary)│
│    feature_schema.json, model_metadata.json                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  INFERENCE (Deno edge function)                             │
│  helpers/predictionPacket.ts + linearScorer.ts                │
│  Three modes: prematch | draft | full                         │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  nuckyAI synthesis                                          │
│  Injects [PREDICTION_PACKET] — LLM explains drivers only    │
└─────────────────────────────────────────────────────────────┘
```

**v2 (optional):** native XGBoost tree traversal in Deno or external Python inference API if linear v1 plateaus.

---

## 6. Feature Mart (Phase 1) — SHIPPED

**Grain:** one row per **series** (not per game).

Walk-forward validation by calendar week. Top SHAP drivers (post leak-fix): earned GPM diff, top gold-share diff, GSPD diff, deaths diff, gold@25 diff, series win rate, ADC CS@20 diff, H2H win rate.

See [scripts/ml/README.md](../scripts/ml/README.md) for pipeline details.

---

## 7. Models (Phase 2) — SHIPPED

| Model | Status | Holdout metrics |
|-------|--------|-----------------|
| Series outcome (XGBoost) | Shipped | log-loss 0.616, Brier 0.212, accuracy 66.0% vs naive 59.5% |
| Draft leverage | Shipped (Phase 3b) | champ meta + synergy + comp scoring |
| Trend insights | Shipped (Phase 3) | threshold buckets from OE |

---

## 8. nuckyAI Integration (Phase 3) — SHIPPED

### 8.1 Inference modes

| Mode | Trigger | Inputs | Output |
|------|---------|--------|--------|
| **prematch** (3a) | “who wins T1 vs G2?” | Team form snapshots, H2H, series state, optional Kalshi | `P(A wins)`, drivers, trends, Kalshi edge |
| **draft** (3b) | Draft-only / comp vs comp | Patch champ meta, synergy matrix | Comp strength scores, draft edges |
| **full** (3c) | Team + draft context | Prematch score blended 65/35 with draft comp | Combined prob + player-champion notes |

### 8.2 Helper: `predictionPacket.ts`

Wired in `pipeline/toolDecider.ts` (parallel to Kalshi). Synthesis injects `[PREDICTION_PACKET]`; prompts enforce `[PREDICTION_RULES]`.

```typescript
interface PredictionPacket {
  mode: "prematch" | "draft" | "full";
  teamA: string;
  teamB: string;
  patchBucket: string;
  winProbA: number;       // 0–1
  winProbB: number;
  confidence: number;     // 0–1 — below 0.6 → refuse strong pick
  drivers: string[];      // top model features in plain language
  risks: string[];      // failure modes
  trends: Array<{ label: string; favorable: boolean; lift?: number }>;
  draftEdges?: { champion: string; edge: number; side?: "A" | "B"; roleNote?: string; styleNote?: string; archetypeTags?: string[] }[];
  compStyles?: Array<{ side: "A" | "B"; team: string; identityLabel: string; tags: string[] }>;
  playerChampionNotes?: Array<{ player: string; champion: string; note: string }>;
  kalshiEdge?: { impliedYesPercent: number; modelProbPercent: number; edgePp: number };
}
```

### 8.3 Kalshi edge (3a)

When Kalshi markets are fetched for the same question, the packet includes implied yes % vs model prob and edge in percentage points. LLM cites both from the packet only.

### 8.4 Confidence rules

- `confidence < 0.6` → nucky should not give a strong “lock” pick; explain uncertainty
- LLM must not invent numbers outside `[PREDICTION_PACKET]`
- Missing teams / no snapshot coverage → `[NO_PREDICTION_PACKET]` refusal path

### 8.5 Future preview UI contract

The packet fields `trends`, `drivers`, `draftEdges`, and `kalshiEdge` map directly to preview cards:

1. **Model lean** — win prob + confidence bar  
2. **Key trends** — favorable/unfavorable conditions from `trend_insights.json`  
3. **Draft leverage** — champ edges + synergy (when draft known)  
4. **Market edge** — Kalshi vs model (when available)

Same `buildPredictionPacket()` call; UI renders JSON instead of LLM synthesis.

### 8.6 Phase 3.5 — SOS/GPR grounding + smoke-test fixes (2026-07-07/08)

Fixes from two rounds of live smoke-testing against MSI 2026 matchups:

| Issue found | Fix |
|---|---|
| Model conflated T1's 21% **tournament-outright** Kalshi odds with its ~86% **series** odds vs G2 | `kalshi.ts` now filters to head-to-head series markets only; `PREDICTION_RULES` forbids citing outright lines as series odds |
| Generic "wins more when ahead at GD@15" insights | `build_team_profiles.py::build_stat_deviations` — insights now require a meaningful deviation vs region/global median, not just directional correlation |
| Early-game focus wrongly inferred from jungle/support's naturally-high K+A | `build_playstyle` now reads top/mid/bot K+A/KP share to find the **lane** a team plays around; jungle-centric override only fires when K+A is unnaturally skewed to the jungler alone |
| Cross-region prediction (T1 vs G2) backwards — weaker-region (LEC) stats read as equal to stronger-region (LCK) stats, so G2 was favored | `region_elo.py` walk-forward Elo → **now superseded by** `gpr_snapshot.json` (official lolesports GPR via CitoAPI) as the primary strength signal, blended 65–88% into cross-region matchups |
| Team-name substring hallucination — "viktor" in a pasted draft matched alias "kt" → hallucinated a KT Rolster matchup | `hasWholeWord()` word-boundary matching replaces `.includes()` in `extractTeamsFromMessage` / `extractSingleTeamFromMessage` |
| Champion role read from stale training-era priors (Camille called an "interesting flex" top pick when meta had shifted her to support) | `champ_role_profile.json` (season vs last-45-day role distribution) — draft edges always cite the **recent** role when it differs from the season-long one |
| Draft analysis stat-dumped GD@15/winrate without explaining *why* two comps interact | `champion_archetypes.json` + `champ_scaling.json` feed archetype tags / lane-strength / scaling notes into `DraftEdge` and aggregate `compStyles`; `prompts.ts` adds explicit style-matchup reasoning rules (dive vs disengage, poke-when-ahead, low-DPS vs tank frontline, scaling-carry vs forced fights, split-push vs grouped 5v5s) |
| Confidence pinned at ~92% on nearly every matchup | `linearScorer.ts::estimateConfidence` — `coverage` term now clamps to 1.0 (was silently exceeding it and saturating the cap); max confidence lowered 0.92 → 0.85 |
| No detection of "should've won but choked" / stolen comebacks | `build_team_profiles.py::build_clutch_factor` — per-team blown-lead rate (loss rate when up 1000+g@15) and comeback rate (win rate when down 1000+g@15), each compared to the league-wide baseline; only narrated when a team is a real outlier (≥10pp deviation) |

**Known limitation:** the SOS/GPR blend weights (65–88% strength / cross-region scale=72) were carried over from the pre-GPR home-grown-Elo tuning, not re-calibrated against historical series outcomes with GPR as the input. Post-fix, T1 vs G2 moved from **G2 66.6%** (wrong favorite) to **T1 ~58%** (right favorite, correctly directionally fixed) — still short of Kalshi's ~86% series-implied T1 odds. Closing that last gap would need a proper backtest (grid-search blend weight/scale against historical series log-loss with GPR/Elo as a feature) rather than hand-tuning to one matchup — flagged as a follow-up, not done in this pass.

---

## 9. Continuous Learning (Phase 4)

**Trigger:** OE ingest completes → rebuild feature mart → retrain → validate → `export_artifacts.py` → commit updated `agent-chat/ml/` JSON.

**Monitoring:**

- `ml_prediction_log` table (future): predicted vs actual series outcomes
- Weekly drift report: accuracy by league, patch, confidence bucket
- Rollback if holdout log-loss regresses &gt; X% vs prior version

---

## 10. Milestones

| Milestone | Deliverable | Status |
|-----------|-------------|--------|
| **M0** | OE → RAG → Cito → Tavily fallback chain | Shipped 2026-07-03 |
| **M1** | Feature mart + walk-forward validation | Shipped 2026-07-06 |
| **M2** | Series outcome model (offline) | Shipped 2026-07-06 |
| **M2.5** | `predictionPacket.ts` + Deno scorer | **Shipped 2026-07-06** |
| **M3** | Draft leverage + trend insights | **Shipped 2026-07-06** |
| **M3.5** | SOS/GPR grounding, champion archetype/role/scaling, clutch factor | **Shipped 2026-07-08** |
| **M4** | Automated retrain pipeline | Not started |
| **M5** | Pre-match analysis UI | Not started (packet-ready) |

**Known follow-up:** `scripts/ingest_csv.py` drops 2025 NA (`LTA`/`LTA N` tags). ML pipeline handles via `oe_leagues.py`; dashboard ingest still needs fix.

---

## 11. Open Decisions

1. **International events:** separate MSI/Worlds buckets vs blend regional form?
2. **Minimum sample:** games required per patch bucket before trusting patch-specific weights?
3. **Accuracy bar for M5 UI:** e.g. ≥55% series accuracy at ≥60% confidence on walk-forward holdout?
4. **Inference hosting:** linear bundle (v1) vs native tree scorer (v2)?

---

## 12. Related Files

| Area | Path |
|------|------|
| nuckyAI pipeline | `supabase/functions/agent-chat/` |
| ML artifacts (deployed) | `supabase/functions/agent-chat/ml/` |
| Prediction helper | `supabase/functions/agent-chat/helpers/predictionPacket.ts` |
| ML training | `scripts/ml/` |
| OE ingest | `scripts/ingest_csv.py`, `src/lib/loadOEStore.ts` |
| Cito sync | `scripts/cito/` |
| Agent README | `supabase/functions/agent-chat/README.md` |

---

## 13. Success Criteria

- nuckyAI answers tier-1 factual questions via OE/RAG/Cito/Tavily without hallucinating
- Walk-forward series model beats naive baseline on 8+ holdout weeks ✅
- Prediction packet used for explicit “who wins” / pre-match prompts when confidence ≥ 0.6
- Model artifacts retrain automatically after each OE ingest without manual steps (Phase 4)
- Preview UI can consume the same packet without backend changes (Phase 5)
