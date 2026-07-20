# nuckyAI Prediction Model — Scope Document

**Status:** Phase 1–2 shipped (offline training); **Phase 3 shipped** (nuckyAI chat integration); **Phase 4a shipped** (automated retraining); **nucky v2 Components 1–3 + Deno consumption shipped**; **external GPR/Kalshi removed from scoring** (comparison-only)  
**Owner:** nucky.gg / lol-dashboard  
**Last updated:** 2026-07-16

---

## 1. Goal

Train a machine-learning layer on ~2 years of tier-1 professional match data so nuckyAI can:

- Make **high-confidence** matchup and series predictions (not LLM guesses)
- Analyze **draft compositions** with patch-aware champion/player trends
- Surface **team style vs style** historical patterns (engage vs poke, scaling vs tempo, etc.)
- Identify **favorable/unfavorable conditions** (GD@15 thresholds, objective control, champion meta, player-champion comfort)
- **Continuously improve** as new OE games ingest and the model retrains

The LLM (nucky persona) remains the **explainer**; the model supplies a structured **prediction packet** with probabilities, drivers, trends, and failure modes. Numbers in chat must come from the packet — never from training memory.

**Future UI (M5):** Pre-match preview sections on nucky.gg (`/match/:id/preview`) rendering the same packet as structured cards — high-impact trends, nucky model lean, player power, direct champion matchups, and optional market comparison. Backend packet shape is designed for this; UI is not built yet.

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

- **Playstyle:** early-game focus by **lane** (top/mid/bot K+A@15 / KP share — jungle/support excluded from the "who do they play around" read since both roles naturally accrue early K+A). A **jungle-centric** ("plays for the jungler") override fires only off jungle **CS@15** (absolute farm) vs the jungle-role baseline (region, else global) — this is a distinct signal from a jungler simply having high early K+A, which just means he ganks/fights a lot and does NOT by itself mean the team plays around him. Both are surfaced: `focusMode: "jungle_centric"` for the CS-lead case, a separate "aggressive/proactive jungler" note for the high-K+A case. See §8.7.
- **Priority champions:** per-roster-player current champ pool, last-45-day recency-weighted (falls back to season-wide when a player's recent sample is thin) — pulled from `player_champ_ratings.json`, surfaced even without a live draft pasted in.
- **Stat deviations:** team stat vs **region median** and **global tier-1 median** (not raw value) — surfaces only when a team is a real outlier, not generic "ahead = win more" copy
- **Player win conditions:** vs role-region median GD@15 (not a flat global threshold)
- **Team win/loss patterns:** team-specific GD@15 and objective correlations
- **Recent form (quality-adjusted, §8.8):** last 3 series, recency-weighted (0.5/0.3/0.2). Each series' `qualityScore` = competitiveness (sweep vs narrow win/loss) adjusted by the **opponent's** walk-forward Elo relative to the team's own (`region_strength.json`) — beating a stronger opponent counts for more, beating a weaker one for less, and losses are softened/penalized the same way. Series notes are tagged `[strong opponent]` / `[lower-rated opponent]` when the gap is large enough to matter (±0.35 on the 400-point Elo scale, ≈140 pts).
- **Clutch factor:** single-game "should've won but choked" / "stole one back" detection — blown-lead rate (losses when up 1000+g@15) and comeback rate (wins when down 1000+g@15), each compared to the league-wide baseline so it only narrates real outliers
- **Strengths / weaknesses** narrative bullets, ranked stat-deviation → clutch factor → playstyle → recent form → player conditions → patterns
- **Artifact:** `team_profiles.json`

### 4.7 Team strength / strength-of-schedule (SOS)

Cross-region comparisons (e.g. LCK vs LEC) are not apples-to-apples on raw rolling stats — a weaker domestic league inflates a team's own numbers.

- **Nucky team/region Elo (score-driving):** `region_elo.py` builds walk-forward,
  series-grain team power and emergent region strength from OE results. `teamStrengthRating()`
  reads only `region_strength.json`; the same internal rating drives Deno inference.
- **Official GPR (comparison-only):** the deploy-time snapshot may be shown to explain
  where nucky agrees/disagrees with Riot's public ranking, but has **0% model weight**.
- **Kalshi (comparison-only):** a matching live market produces `kalshiEdge` against
  nucky's already-final probability. It never anchors or modifies `winProbA`.

`predictionPacket.ts::blendWithRegionStrength` is fully proprietary: **45–50% nucky
team/region Elo / 25–30% structural model / 25% quality-adjusted recent form**. The
structural model itself also contains walk-forward strength features, so the formal
scorecard must continue monitoring Elo double-counting/calibration.

### 4.8 Champion archetype / role / scaling grounding

Draft analysis previously relied on the LLM's training-era priors (e.g. treating Camille as a "flex" top laner after the meta already shifted her to support). Three artifacts ground this in actual recent data:

- **`champion_archetypes.json`** (hand-curated, static) — primary roles, damage type, range, playstyle tags (engage, poke, dive, disengage, split_push, scaling_carry, etc.), comp archetypes, scaling curve for 172 champions. Source of truth for kit-level style reasoning (dive vs disengage, poke-when-ahead, low-DPS-vs-tank, etc.).
- **`champ_role_profile.json`** (empirical, `train_draft_model.py`) — season-long **and** last-45-day role distribution per champion, flags `roleShift` when the recent primary role differs from the season-long one. Grounding notes prefer the recent role; direct-matchup lookup uses the pasted draft's standard top/jungle/mid/adc/support slot first and falls back to the profile only when slot data is unavailable.
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
| **prematch** (3a) | “who wins T1 vs G2?” | Team form, H2H, series state, nucky Elo, player power | `P(A wins)`, drivers, trends, optional market comparison |
| **draft** (3b) | Draft-only / comp vs comp | Patch champ meta, synergy, same-role matchup matrix | Comp strength, direct matchups, draft edges |
| **full** (3c) | Team + draft context | Prematch score blended 65/35 with draft evidence | Combined prob + player/champion context |

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
  directMatchups?: Array<{ role: string; championA: string; championB: string; games: number; winrateA: number; avgGd15DeltaA?: number; adjustedEdgePp: number }>;
  compStyles?: Array<{ side: "A" | "B"; team: string; identityLabel: string; tags: string[] }>;
  playerChampionNotes?: Array<{ player: string; champion: string; note: string }>;
  playerPower?: { teamA: PlayerPowerSummary[]; teamB?: PlayerPowerSummary[] };
  kalshiEdge?: { impliedYesPercent: number; modelProbPercent: number; edgePp: number };
  teamProfiles?: { teamA: TeamProfileSummary; teamB?: TeamProfileSummary }; // includes priorityChampions per role
}
```

### 8.3 External benchmark comparisons (GPR + Kalshi)

When a live Kalshi head-to-head market is fetched, `kalshiEdge` compares its implied
probability against nucky's already-final probability. Official GPR can likewise appear
as an explicitly labeled comparison driver. Both have **zero scoring weight**.

The LLM may cite both the nucky win % and external comparison, but must never imply the
market or GPR changed the model result.

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

> Historical implementation record. Sections 8.6–8.8 describe iterations that were
> superseded on 2026-07-16: GPR and Kalshi are now comparison-only with 0% score weight.

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

**Known limitation (superseded by §8.7):** the SOS/GPR blend weights (65–88% strength / cross-region scale=72) were carried over from the pre-GPR home-grown-Elo tuning, not re-calibrated against historical series outcomes with GPR as the input. Post-fix, T1 vs G2 moved from **G2 66.6%** (wrong favorite) to **T1 ~58%** (right favorite, correctly directionally fixed) — still short of Kalshi's ~86% series-implied T1 odds. Rather than grid-searching the SOS/GPR blend further, Phase 3.6 (§8.7) closes this gap directly by anchoring the final probability to the live market itself, which is the standard fix used by sports-prediction models for exactly this kind of "our own signal isn't confident enough / doesn't see everything the market sees" gap.

### 8.7 Phase 3.6 — market-anchored predictions, jungle-farm signal, matchup-preview format (2026-07-08)

Third round of live smoke-testing (T1 vs G2 re-test, BLG vs HLE):

| Issue found | Fix |
|---|---|
| Model's own win % could land 20-40pp away from a liquid Kalshi head-to-head market (BLG 63.5% model vs HLE 63% market — favorite flipped) | `predictionPacket.ts::blendWithKalshi` — when a live h2h market exists, blend it into `winProbA` as the **final** step at 80% market weight / 20% own signal, for `prematch` and `full` modes. `kalshiEdge` is now computed against this already-anchored number, so it reads as a genuine small edge instead of a raw (much larger) model-vs-market gap. |
| "Jungle-centric" (team plays **for** the jungler) was inferred from high jungle K+A@15 — but jungle/support naturally rack up K+A by ganking, so this just flagged any aggressive jungler (e.g. BLG's Xun) as "jungle-centric," which isn't what that term means | `build_team_profiles.py::build_playstyle` — jungle-centric now requires jungle **CS@15** (absolute farm, not diff-vs-enemy-jungler — two junglers who both just farm cancel out to ~0 diff) to sit **≥6 CS above the jungle-role baseline** (region, else global; global median ≈112, std ≈12). Calibrated directly off LYON/Inspired, the canonical example (+7.7 CS@15 over median — the clear outlier among tier-1 junglers). A separately-tagged "aggressive/proactive jungler" note (from K+A@15) now covers the gank-heavy case without conflating it with jungle-centric. |
| No per-player "current priority champs" for a team-vs-team (non-draft) matchup preview — draft-pool comparisons only existed when a real draft was pasted in | `train_draft_model.py::build_player_champ_ratings` now tracks a last-45-day `recentGames`/`recentWinrate`/`recentAvgGd15` cut per player-champion pair (falls back to season-wide when the recent sample is thin); `predictionPacket.ts::topChampionsForPlayer` / `buildPriorityChampions` surface each roster player's top 2-3 current champs into `team_a_profile.priority_champs` / `team_b_profile.priority_champs`, no draft required. |
| Pre-match team-vs-team responses read as loose prose with no consistent structure, making it hard to compare the two sides at a glance | New `[MATCHUP_PREVIEW_FORMAT]` prompt block (`prompts.ts::matchupPreviewFormatBlock`), injected only for `prematch`/`full` mode with two real teams — overrides the general "no markdown tables" rule for this one response type: header line, Kalshi odds / Model edge lines, a Playstyle / Early Game / Performance Trends / Strengths / Weaknesses / Key Champions comparison table (one column per team), then an analyst-voice summary of the specific stylistic/player-role/champion-pool matchups driving the prediction. |

**Result:** re-running the local diagnostic blend math for the two smoke-tested matchups —
- **BLG vs HLE:** own-signal blend alone gave HLE 37% (BLG "favored" against a market that favored HLE 63%). With the market anchor: 0.8×37% + 0.2×63.7% ≈ **HLE 57.7%**, market implies HLE 63% → edge ≈ 5.3pp toward BLG. Correct favorite, small legible edge.
- **T1 vs G2:** own-signal blend alone gave T1 ~58% vs Kalshi's ~86% T1. With the market anchor (0.8×86% + 0.2×58%) ≈ **T1 80.3%** — much closer to the market's series-implied odds, with a modest ~6pp edge left over from our own signal.

**Known limitation:** the 80/20 market/own-signal weight is a reasonable prior, not backtested against historical closing-line value — a proper calibration would grid-search this weight against realized outcomes vs Kalshi closing prices once enough settled markets accumulate. The jungle-centric CS@15 threshold (+6) is calibrated off a single canonical example (LYON/Inspired) plus the global distribution, not a labeled set of known jungle-centric teams — worth revisiting if more real-world examples surface false positives/negatives.

### 8.8 Phase 3.7 — GPR overweight fix, live GPR, quality-adjusted recent form, Kalshi alias matching (2026-07-09)

Fourth round of smoke-testing (BLG vs HLE re-test) surfaced that even with the §8.7 market anchor, the model still landed on the wrong favorite (BLG 64%) whenever **no live Kalshi h2h market existed for the series** — the fallback (structural + recent-form + SOS/GPR blend) was itself miscalibrated, and a real bug meant the Kalshi anchor would have silently failed to engage even when a market *did* exist.

| Issue found | Fix |
|---|---|
| Cross-region blend gave **88% weight to raw GPR/region-strength**, 7% structural, 5% recent form — GPR alone (a single point-in-time snapshot that can be skewed by a months-old event like First Stand, or by a region's overall stat inflation) was effectively the entire prediction whenever it was available | `predictionPacket.ts::blendWithRegionStrength` rebalanced to 55% strength / 20% structural / 25% form (cross-region) and 50/25/25 (same-region) — GPR/SOS is still the single largest input (it's also the #1 SHAP feature in the structural model itself, `diff_strength_elo` at 0.58 importance vs 0.12 for the next-highest feature) but no longer drowns out everything else. |
| Recent-form score was pure win/loss + series-margin (competitiveness) — a 3-0 sweep of a weak team counted identically to a 3-0 sweep of the world's best team, so "recent form" couldn't distinguish HLE's convincing win over a strong opponent from BLG's less-dominant win over a weaker one | `build_team_profiles.py::build_recent_form` now computes a `qualityScore` per series = competitiveness adjusted by the opponent's walk-forward Elo relative to the team's own (`region_strength.json`) — beating a stronger opponent boosts the score, beating a weaker one dampens it (losing to a stronger opponent is softened, an upset loss to a weaker one is penalized further). Series notes are tagged `[strong opponent]` / `[lower-rated opponent]` so the LLM can cite the context, not just the raw score. |
| `gpr_snapshot.json` is a deploy-time bundle — only refreshes when the ML pipeline reruns and agent-chat redeploys, so it can silently drift from the live lolesports rankings between deploys | New `helpers/liveGpr.ts` fetches the current CitoAPI GPR rankings **at request time** for the two teams in the matchup (10-minute in-memory cache), overriding the static snapshot when available; `blendWithRegionStrength` prefers it and labels the driver "Live official GPR" instead of "Official GPR" so it's clear which source was used. Falls back to the static snapshot (then home-grown region Elo) on any fetch failure/timeout — no behavior change when `CITO_API_KEY` isn't configured for a given request path. |
| Kalshi head-to-head market matching checked whether the market's title/subtitle **contained the full canonical team name** ("Bilibili Gaming", "Hanwha Life Esports") — but real market titles/tickers almost always use the short/common form ("BLG", "HLE"), so this silently failed to find a live market for most two-word-name teams, meaning the §8.7 market anchor never actually engaged for them | `kalshi.ts`'s `isHeadToHeadMarket` / `inferYesTeamFromMarket` / `filterHeadToHeadMarkets` / `pickMatchupKalshiEdge` now accept a list of name variants per team (canonical + known aliases from `team_aliases.json`, built via `predictionPacket.ts::teamMarketVariants`) instead of a single string. Also fixed a resulting edge case: `inferYesTeamFromMarket` now attributes YES to whichever team's mention is **closest to the win-verb** (≤40 chars), not just "any team mentioned anywhere before the word win" — otherwise a title like "BLG vs. HLE — Will Bilibili Gaming win?" could misfire on the unrelated "HLE" token appearing earlier in the same string. |
| `Gen.G`'s official GPR entry (`"Gen.G Esports"` from CitoAPI) never matched our OE-based canonical name (`"Gen.G"`), so Gen.G matchups silently fell back to a badly-miscalibrated home-grown region Elo (1865 — inflated by playing in a lower tier of the same walk-forward pool — vs its real GPR-implied rating of ~1546). Same root cause hit `Weibo Gaming` ("WeiboGaming"), `Xi'an Team WE`, `JD Gaming` ("Beijing JDG Esports"), and `LNG Esports` ("Suzhou LNG Esports") | `team_identity.py::canonical_team` now falls back to a punctuation/whitespace-insensitive match, then a common-suffix-stripped match (" esports", " gaming"), before giving up — catches naming drift between OE and CitoAPI automatically. Also fixed the `entityMap.ts` TS-source parser, which only matched single-quoted `oeNames` entries and silently dropped double-quoted ones (needed for names containing an apostrophe, e.g. `"Xi'an Team WE"`). Added the concrete missing aliases for Gen.G/JD Gaming/LNG Esports directly to `entityMap.ts` as well. **14 lower-tier/wildcard-region GPR entries remain unmatched** (PCS/VCS/CBLOL orgs, sponsor-renamed academy squads) — low priority since they don't affect tier-1 LCK/LPL/LEC/LCS matchup predictions, which is what this fix targeted. |
| Pre-match comparison output used a markdown table (`\| col \| col \|`) which rendered as raw pipe characters in some chat surfaces instead of an actual table | `prompts.ts::matchupPreviewFormatBlock` now instructs per-team bullet sections (bolded team-name subheader + "-" bullets for Playstyle/Early Game/Performance Trends/Strengths/Weaknesses/Key Champions) instead of a table, for both teams in sequence. |

**Result (BLG vs HLE re-test, local smoke test):** structural+form+SOS blend alone moved from **BLG 64% / HLE 36%** to **BLG 51.2% / HLE 48.8%** — no live Kalshi h2h market exists for this series at time of testing (Kalshi currently only lists tournament-outright "will X win MSI" markets for these two teams, which are correctly excluded as non-h2h), so this is the blend fix alone; a live h2h market would anchor it further toward the market price via the already-existing §8.7 logic, now able to actually engage thanks to the alias-matching fix.

**Known limitation (resolved by §8.9):** recent-form / SOS signals used to only be as current as whatever `lol/*.csv` copy a human had manually downloaded before running the ML pipeline — a separate copy from what powers the live nucky.gg dashboard, which did **not** auto-update from the "Refresh Dashboard Data" GitHub Action. §8.9 closes this by running the ML pipeline as part of that same Action. The home-grown region Elo fallback (`region_strength.json`) still remains poorly calibrated across leagues for teams GPR doesn't cover (wildcard/lower-division orgs can out-rank tier-1 GPR-covered teams in the raw Elo) — not a live-prediction risk today since major teams are all GPR-covered, but worth a proper cross-league SOS recalibration if wildcard-team predictions become common.

### 8.9 Phase 4a — ML pipeline runs inside the dashboard data-refresh pipeline, no manual CSV step (2026-07-09)

The model's only data source was a human-maintained local `lol/*.csv` folder — someone had to remember to run `download_oe_csv.py` and the full ML pipeline before the model would see new games, and that folder was entirely disconnected from the "Refresh Dashboard Data" GitHub Action that keeps nucky.gg's live dashboard current every 2 hours. This was the root cause of the "data isn't current" class of issues (e.g. recent-form missing the actual live MSI bracket games).

| Issue found | Fix |
|---|---|
| ML training data required a human to manually download OE CSVs and re-run the pipeline locally — no automatic path from "new games exist on Drive" to "the model has seen them" | `.github/workflows/refresh-data.yml`'s `refresh` job — the same job that already downloads OE CSVs from Drive and seeds the live dashboard's `oe_slices` Supabase table — now also runs the full ML pipeline (`build_feature_mart.py` → `train_series_model.py` → `train_draft_model.py` → `build_trend_insights.py` → `build_team_profiles.py` → `export_artifacts.py`) and commits the regenerated `supabase/functions/agent-chat/ml/*.json` artifacts back to the repo, every time it runs (i.e. every time the current-year OE CSV actually changes on Drive — same change-detection gate the dashboard refresh already uses, so this doesn't retrain on a fixed clock, only on new data). |
| The scheduled dashboard refresh only downloads the **current year's** CSV (by design, to stay fast) — not enough history for ML's rolling/team-form features, walk-forward validation, or region Elo, which need multiple years | New `scripts/ensure_oe_history.py`, run right after the existing current-year download step. It's a no-op once ≥3 distinct year CSVs exist locally (the common case); on a genuine cache miss it downloads full OE history (`OE_DOWNLOAD_YEARS=all`) once. A new `actions/cache` step (keyed `oe-csv-history-v1-<run id>`, `restore-keys: oe-csv-history-v1-`) persists the downloaded `lol/` history across workflow runs so this full download only actually happens once, not on every 2-hourly run. |
| — | `pip install -r scripts/requirements-ml.txt` + the whole ML retrain block are wrapped in `continue-on-error: true` (gated behind `if: steps.<prev>.outcome == 'success'`), so a bug or transient failure in the ML pipeline never blocks the live dashboard refresh (CDN shards / Supabase seed / weekly recaps still complete normally) — it just skips that run's model refresh and retries on the next Drive change. |
| ML history backfill left every historical year shard in `public/data/` and the git publish step tried to push them — most exceed GitHub's 100 MB/file limit (e.g. `oe_slices_2025.json` at 211 MB) | `ingest_csv.py` now respects `OE_DOWNLOAD_YEARS` for dashboard ingest (CI: `current` only) while ML still reads all of `lol/*.csv`. New `scripts/publish_oe_cdn_to_git.py` commits only `OE_CDN_PUBLISH_YEARS=current` shards to git; multi-year history stays in Supabase `oe_slices`, which is already the dashboard's primary data path. |

**Deploying the retrained model to the live edge function** used to be a deliberate
manual step (`npx supabase functions deploy agent-chat --use-api`). As of 2026-07-20
the Refresh workflow:

1. Runs `scripts/ml/publish_model_to_site.py` after a successful retrain (copies
   rankings/scorecard/`model_metadata` into `public/data/` + freshness stamp).
2. Commits those files + `supabase/functions/agent-chat/ml/` as
   `chore(ml): publish model artifacts to nucky.gg` — this is what updates
   **landing + dashboard rankings** after GitHub Pages rebuilds.
3. Optionally deploys `agent-chat` when repo secret `SUPABASE_ACCESS_TOKEN` is set
   (parses project ref from `SUPABASE_URL`). Without that secret, static rankings
   still update via git; chat stays on the last manual edge deploy.

Manual dispatch hard-fails ML (no soft-fail) so a broken retrain cannot silently
leave OE fresh and rankings frozen. Cron keeps soft-fail so OE never blocks on ML.

**Result:** the model's data source is now the exact same pipeline as the live dashboard (same Drive folder, same `download_oe_csv.py`, same change-detection gate) — no separate manually-refreshed CSV copy exists anymore. `docs/nuckyAI_model.md`/`scripts/ml/README.md`'s "manually-refreshed copy" caveat is resolved.

---

## 9. Continuous Learning (Phase 4)

**Trigger (shipped 2026-07-09, §8.9):** "Refresh Dashboard Data" GitHub Action detects an OE CSV change on Drive → downloads it (+ backfills full history on cache miss) → ingests dashboard shards/Supabase as before → rebuilds feature mart → retrains → `export_artifacts.py` → commits updated `agent-chat/ml/` JSON. Runs on the same 2-hourly change-detection schedule as the dashboard refresh, non-blocking (`continue-on-error`) so an ML pipeline failure never breaks dashboard data freshness.

**Not yet automated:**

- Deploying the retrained artifacts to the live `agent-chat` edge function (currently a manual `supabase functions deploy` — see §8.9)
- Walk-forward metric **validation gate** before committing (today it always commits `export_artifacts.py`'s output; a future version could diff `metrics.json` against the previous commit and skip/flag a regression)
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
| **M3.6** | Market-anchored win %, jungle-farm signal (CS@15 vs K+A), priority champs, matchup-preview table format | **Shipped 2026-07-08** |
| **M3.7** | GPR-overweight rebalance, live GPR fetch, opponent-strength-quality-adjusted recent form, Kalshi alias matching, team-identity canonicalization fixes, bullet-point matchup-preview format | **Shipped 2026-07-09** |
| **M4** | Automated retrain pipeline (data source shared with dashboard refresh; deploy-to-edge still manual) | **Shipped 2026-07-09 (§8.9)** |
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
