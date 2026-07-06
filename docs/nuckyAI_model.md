# nuckyAI Prediction Model — Scope Document

**Status:** Phase 1–2 shipped (offline training); **Phase 3 shipped** (nuckyAI chat integration)  
**Owner:** nucky.gg / lol-dashboard  
**Last updated:** 2026-07-06

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

- **Playstyle:** early-game focus by role (K+A@15), tempo (aggressive/scaling/balanced)
- **Player win conditions:** e.g. “T1 wins more when Peyz is ahead at 15m”
- **Team win/loss patterns:** team-specific GD@15 and objective correlations
- **Strengths / weaknesses** narrative bullets
- **Artifact:** `team_profiles.json`

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
  draftEdges?: { champion: string; edge: number; side?: "A" | "B" }[];
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
