# nuckyAI Prediction Model — Scope Document

**Status:** Planning (not started)  
**Owner:** nucky.gg / lol-dashboard  
**Last updated:** 2026-07-03

---

## 1. Goal

Train a machine-learning layer on ~2 years of tier-1 professional match data so nuckyAI can:

- Make **high-confidence** matchup and series predictions (not LLM guesses)
- Analyze **draft compositions** with patch-aware champion/player trends
- Surface **team style vs style** historical patterns (engage vs poke, scaling vs tempo, etc.)
- **Continuously improve** as new OE games ingest and the model retrains

The LLM (nucky persona) remains the **explainer**; the model supplies a structured **prediction packet** with probabilities, drivers, and failure modes. Numbers in chat must come from the packet — never from training memory.

---

## 2. Non-Goals (v1)

- In-game live win-probability (belongs to Live Match Hub + Cito live feeds)
- Academy / tier-2 leagues (tier-1 only: LCK, LPL, LEC, LCS + MSI/Worlds/First Stand)
- Replacing Oracle's Elixir as the stats source of truth for raw box scores
- Running heavy inference inside Supabase Edge Functions (Deno)

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

### 4.2 Team composition trends

- Win rate / objective control by comp archetype (front-to-back, pick, split, poke, wombo)
- Champion synergy pairs and ban efficiency per team
- Side preference (blue/red) and draft phase patterns

### 4.3 Matchup & style history

- Head-to-head series outcomes (decay-weighted)
- Style clash signals: tempo vs scaling, early objective rate vs late-game teamfight win rate
- Historical draft leverage when Team A faces Team B (or structurally similar comps)

### 4.4 Series outcome (primary target)

- **Label:** did Team A win the Bo3/Bo5?
- **Features:** form, roster strength, H2H, patch meta fit, draft pool depth, objective profiles, days rest, playoffs flag
- **Output:** `P(Team A wins)` + calibrated confidence interval

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  OFFLINE TRAINING (Python)                                  │
│  scripts/ml/                                                │
│    build_feature_mart.py   → feature_mart.parquet           │
│    train_series_model.py   → series_model.lgb               │
│    train_draft_model.py    → draft_edges.json               │
│    export_artifacts.py     → upload to Supabase Storage     │
└───────────────────────────┬─────────────────────────────────┘
                            │ nightly + post-OE-ingest
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  ARTIFACT STORE — Supabase Storage ml/v1/                   │
│    team_ratings.json      (patch × league Elo/Glicko-style) │
│    champ_meta.json        (pick/win/ban rates by patch)     │
│    player_champ_ratings.json                                │
│    feature_schema.json                                      │
│    series_model.lgb OR coefficients.json (logistic v0)      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  INFERENCE (v1: precomputed tables + light scoring)         │
│  supabase/functions/agent-chat/helpers/predictionPacket.ts  │
│  Loads JSON artifacts; no ML runtime in Deno v1             │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  nuckyAI synthesis                                          │
│  Injects [PREDICTION_PACKET] — LLM explains drivers only      │
└─────────────────────────────────────────────────────────────┘
```

**v2 (optional):** dedicated Python inference API (Modal / Railway) if tabular v1 plateaus.

---

## 6. Feature Mart (Phase 1)

**Grain:** one row per **series** (not per game).

| Category | Example features |
|----------|------------------|
| Form | Win rate last 5/10/20 series; avg GD@15; objective control rate |
| Roster | Per-role player rating; sub penalty; games played together |
| H2H | Decay-weighted win rate vs opponent |
| Draft/meta | Champ pool depth; patch pick win rates; ban target efficiency |
| Context | League, playoffs, patch bucket, international event flag, rest days |
| Volatility | Std dev GD@15; throw rate when ahead at 20m |

**Validation:** walk-forward by calendar week — never random-split (leaks future form).

**Storage:** `feature_mart.parquet` locally; optional `ml_series_features` Supabase table for debugging.

---

## 7. Models (Phase 2)

### 7.1 Series outcome model (P0)

- **Algorithm:** LightGBM (v1) or logistic regression (interpretable baseline)
- **Metrics:** log-loss, Brier score, calibration curve
- **Ship gate:** beat naive “pick higher winrate team” baseline on holdout weeks

### 7.2 Draft leverage model (P1)

- Patch-bucketed champion win rates + co-pick synergy matrix
- Draft edge score fed into prediction packet

### 7.3 Lane matchup model (P2)

- Expected GD@15 per role from player history on patch
- Feeds matchup breakdown, not standalone series pick

---

## 8. nuckyAI Integration (Phase 3)

New helper: `predictionPacket.ts`

Triggered when intent is prediction, pre-match analysis, or explicit matchup breakdown.

```typescript
interface PredictionPacket {
  teamA: string;
  teamB: string;
  patchBucket: string;
  winProbA: number;       // 0–1
  confidence: number;       // 0–1 — below 0.6 → refuse to predict
  drivers: string[];        // top 3 model features in plain language
  risks: string[];          // failure modes
  draftEdges?: { champ: string; edge: number }[];
}
```

**Confidence rules (aligned with nuckyAI policy):**

- `confidence < 0.6` or insufficient patch sample → “i couldn't determine an accurate answer for that”
- LLM must not invent numbers outside `[PREDICTION_PACKET]`

**Future UI:** `/match/:id/preview` or “analyze this matchup” button — same backend packet, structured render.

---

## 9. Continuous Learning (Phase 4)

**Trigger:** OE ingest completes (existing CI) → rebuild feature mart → retrain → validate → publish artifacts if metrics OK.

**Monitoring:**

- `ml_prediction_log` table: predicted vs actual series outcomes
- Weekly drift report: accuracy by league, patch, confidence bucket
- Rollback if holdout log-loss regresses &gt; X% vs prior version

---

## 10. Milestones

| Milestone | Deliverable | Unblocks |
|-----------|-------------|----------|
| **M0** | OE → RAG → Cito → Tavily fallback chain | Factual Q&A coverage |
| **M1** | Feature mart + walk-forward validation harness | Measurable ML baseline |
| **M2** | Series outcome model (offline) | Competent matchup answers |
| **M2.5** | `predictionPacket.ts` + Deno-side tree scorer in agent-chat | Wire model into nuckyAI chat |
| **M3** | Draft leverage + patch buckets | Draft analysis quality |
| **M4** | Automated retrain pipeline | Continuous improvement |
| **M5** | Pre-match analysis UI | User-facing predictions |

**M0 shipped:** 2026-07-03 (`agent-chat` Cito tier + Tavily 2-source verify).

**M1 + M2 shipped (offline):** 2026-07-06 (`scripts/ml/` — see
[scripts/ml/README.md](../scripts/ml/README.md) for pipeline details). Walk-forward
holdout (20 weeks, 960 series-perspective rows): XGBoost log-loss 0.616 / Brier
0.212 / accuracy 66.0% vs. naive "own recent series win-rate" baseline log-loss
0.698 / Brier 0.244 / accuracy 59.5% — **beats the M2 ship gate.** (An earlier
pass had a same-day head-to-head leak — the two perspective rows of a series
could see each other's own outcome — that inflated accuracy to ~75%; fixed by
computing both perspectives from identical pre-series state before updating
history. 66% is the trustworthy number.) Top SHAP drivers are smooth and
sensible: 20-game earned-gold-per-minute diff, top-lane gold-share diff,
gold-spent-diff%, late-game gold@25 diff, 20-series win rate, ADC CS@20 diff,
and decayed head-to-head win rate. `predictionPacket.ts` (M2.5) is not built
yet — the raw tree-JSON model + feature schema + per-team current-form
snapshot are exported to `data/ml/artifacts/` and ready for a Deno-side scorer
to consume.

**Known follow-up (found during M1, not yet fixed):** `scripts/ingest_csv.py`'s
`TARGET_LEAGUES` filter only matches the literal league code `"LCS"`, but NA's
top flight was tagged `"LTA"` / `"LTA N"` in Oracle's Elixir for the entire
2025 season (reverted to `"LCS"` for 2026). That means the **dashboard/recap
data currently has zero 2025 NA regional-season coverage.** The ML pipeline
works around this with its own region grouping (`scripts/ml/oe_leagues.py`),
but the dashboard ingest itself still needs the same fix.

---

## 11. Open Decisions

1. **International events:** separate MSI/Worlds buckets vs blend regional form?
2. **Minimum sample:** games required per patch bucket before trusting patch-specific weights?
3. **Accuracy bar for M5 UI:** e.g. ≥55% series accuracy at ≥60% confidence on walk-forward holdout?
4. **Inference hosting:** stay on JSON artifacts (v1) vs external API (v2)?

---

## 12. Related Files

| Area | Path |
|------|------|
| nuckyAI pipeline | `supabase/functions/agent-chat/` |
| OE ingest | `scripts/ingest_csv.py`, `src/lib/loadOEStore.ts` |
| Cito sync | `scripts/cito/` |
| Cito + nuckyAI scope | `docs/CITOAPI.md` §3 |
| Agent README | `supabase/functions/agent-chat/README.md` |

---

## 13. Success Criteria

- nuckyAI answers tier-1 factual questions via OE/RAG/Cito/Tavily without hallucinating
- Walk-forward series model beats naive baseline on 8+ holdout weeks
- Prediction packet used for ≥80% of explicit “who wins” / pre-match prompts when confidence ≥ 0.6
- Model artifacts retrain automatically after each OE ingest without manual steps
