# nuckyAI ML pipeline (Phase 1 + 2)

Implements the Feature Mart (Phase 1) and Series Outcome Model v1 (Phase 2) from
[`docs/nuckyAI_model.md`](../../docs/nuckyAI_model.md). Offline, local-only —
no Supabase Storage upload yet (Phase 3 scope).

## Setup

```bash
pip install -r scripts/requirements-ml.txt
```

Requires the Oracle's Elixir CSVs in `lol/*.csv` (same files `scripts/ingest_csv.py`
uses, from the same Google Drive folder). Optional: `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` in `.env` to pull the Cito gold-timeline supplement
(best-effort — the pipeline runs fine without it).

**As of 2026-07-09 this pipeline is no longer a manual, separately-maintained data
source.** `.github/workflows/refresh-data.yml` — the same Action that keeps the live
nucky.gg dashboard current every 2 hours — now runs this entire pipeline and commits
the regenerated `supabase/functions/agent-chat/ml/*.json` artifacts automatically
whenever new OE data lands on Drive (see `docs/nuckyAI_model.md` §8.9). `lol/` on a CI
runner is backed by `scripts/ensure_oe_history.py`, which backfills full multi-year OE
history on a cache miss since the dashboard refresh's scheduled runs only fetch the
current year. Running the steps below manually is still fully supported for local
iteration/debugging — you just don't *need* to anymore to keep the model current.

## Pipeline

```bash
# 1. Build the feature mart (one row per series x team-perspective)
python scripts/ml/build_feature_mart.py

# 2. Train + walk-forward-validate the series win-probability model
python scripts/ml/train_series_model.py

# 3. Draft/comp artifacts (Phase 3b)
python scripts/ml/train_draft_model.py

# 4. Trend / condition recognition (GD@15 buckets, objectives, champ lift)
python scripts/ml/build_trend_insights.py

# 5. Team playstyle + player win conditions + strengths/weaknesses
python scripts/ml/build_team_profiles.py

# 6. Champion matchup matrix (same-role + counter-pick) -> champ_matchups.json
python scripts/ml/build_champion_matchups.py

# 7. Role-normalized player power ratings -> player_ratings.json (+ md preview)
python scripts/ml/build_player_ratings.py

# 8. Component 4: empirical archetype validation -> archetype_validation.json
python scripts/ml/validate_champion_archetypes.py

# 9. Formal walk-forward accuracy scorecard -> accuracy_scorecard.json
python scripts/ml/build_accuracy_scorecard.py

# 10. Export + deploy JSON to supabase/functions/agent-chat/ml/
python scripts/ml/export_artifacts.py
```

> Note: `build_feature_mart.py` (step 1) imports `build_player_ratings.build_roster_box_z`
> to attach a walk-forward `roster_box_z` player-quality feature to the mart — that's the
> Component 3 signal the trained series model actually consumes. `champ_matchups.json` and
> `player_ratings.json` (steps 6–7) are inference/nuckyAI artifacts, not series-model
> features (the matchup matrix needs a known draft, so it's not a pre-series feature).

### Running it locally (CI does this automatically now, see §8.9)

If you want to iterate on the model locally (test a fix, inspect features, etc.) rather
than wait for the next automated CI retrain, re-run the **full ML pipeline** so rolling
form, recent series, and region Elo include the latest games:

```bash
cd D:/Projects/lol-dashboard
pip install -r scripts/requirements-ml.txt   # once per venv

python scripts/ml/build_feature_mart.py      # rebuild mart (+ roster_box_z) + region_strength.json
python scripts/ml/train_series_model.py    # retrain + SHAP prune (optional but recommended)
python scripts/ml/build_team_profiles.py   # playstyle, SOS-adjusted insights
python scripts/ml/train_draft_model.py     # if draft artifacts needed
python scripts/ml/build_trend_insights.py  # optional trend buckets
python scripts/ml/build_champion_matchups.py  # champ_matchups.json (inference artifact)
python scripts/ml/build_player_ratings.py     # player_ratings.json + md preview
python scripts/ml/validate_champion_archetypes.py  # Component 4 validation report
python scripts/ml/build_accuracy_scorecard.py      # Phase 1 walk-forward scorecard
python scripts/ml/export_artifacts.py      # deploy to supabase/functions/agent-chat/ml/

npx supabase functions deploy agent-chat     # push new JSON to edge
```

Quick sanity check before deploy:

```bash
python scripts/ml/score_matchup.py --team-a T1 --team-b "G2 Esports"

# Eyeball the model's implied power ranking (GPR + region Elo + quality-adjusted recent
# form, sorted) against your own read of the scene — plus current holdout accuracy/log-loss.
python scripts/ml/print_power_rankings.py --league LCK
```

Outputs land in `data/ml/` (gitignored — regenerate locally or in CI) and
`supabase/functions/agent-chat/ml/` (committed — Deno edge function loads these):

- `feature_mart.parquet` — training data, ~940 features, one row per (series, team perspective)
- `team_form_snapshot.parquet` — current "as of now" rolling form per team, for live inference
- `models/series_model.json` — trained XGBoost/LightGBM booster (winner picked automatically)
- `models/feature_schema.json` — final (SHAP-pruned) feature list
- `models/metrics.json` — walk-forward log-loss/Brier/accuracy vs naive baseline, calibration curve
- `artifacts/` — full artifact set re-packaged locally
- `supabase/functions/agent-chat/ml/` — deployed subset for `predictionPacket.ts`

## Phase 3 (nuckyAI integration)

After the pipeline above, `helpers/predictionPacket.ts` loads artifacts and builds
`[PREDICTION_PACKET]` blocks for three modes:

| Mode | Use case |
|------|----------|
| `prematch` | Team vs team, no draft (+ optional Kalshi edge) |
| `draft` | Comp vs comp from `[DRAFT_EXTRACTED]` |
| `full` | Team + draft blended (65/35 prematch/draft) |

Wired in `pipeline/toolDecider.ts`; synthesis prompts enforce `[PREDICTION_RULES]`.
See [`docs/nuckyAI_model.md`](../../docs/nuckyAI_model.md) §8.

## Design notes

- **Data source:** raw `lol/*.csv` (Oracle's Elixir), not the pre-aggregated
  `oe_slices` Supabase table — the CSVs have the full per-game/per-player box
  score (every `@10/15/20/25` diff, damage, vision, objectives) that the
  aggregated slices don't retain.
- **League continuity:** NA's OE league code changed `LCS` → `LTA`/`LTA N`
  for the 2025 season then back to `LCS` for 2026. `oe_leagues.py` groups
  these under one canonical `LCS` region so 2025 NA data isn't silently
  dropped like it currently is in `scripts/ingest_csv.py`'s `TARGET_LEAGUES`
  filter — **that's a real dashboard data gap worth fixing separately.**
- **Team identity:** reuses `src/lib/entities/entityMap.ts`'s `TEAM_ENTITIES`
  rebrand table (parsed directly, no duplicated JSON) so ratings/H2H survive
  renames like DWG KIA → Dplus Kia.
- **Series grouping:** a Python port of `src/lib/seriesGrouping.ts`'s Bo3/Bo5
  algorithm, so the ML grain matches what the dashboard/recap pages call one
  series.
- **Walk-forward safety:** every rolling/H2H/roster feature is computed with
  `shift(1)` or a single chronological pass, so a series' features never see
  its own games or anything after it. Validation is by ISO calendar week
  (expanding window), never a random split.
- **Recency weighting:** `sample_weight = exp(-ln(2)/45 * days_ago)`, ~45 day half-life.
- **CitoAPI's role:** OE is the base truth layer. Cito only fills gaps — a
  historical gold-timeline "throw" signal (joined via `cito_game_linkage`,
  safe for training since it's tied to a specific past game) and, separately,
  current global power rankings (snapshot-only, no history — exposed via
  `cito_supplement.fetch_current_power_ranks()` for future live/Phase-3 use
  only, never joined into historical training rows to avoid leakage).
- **Feature pruning:** the model is first trained on the full ~940-feature
  set, then SHAP mean(|value|) drops near-zero-importance features (~25% in
  practice), and a pruned model is retrained + re-validated.
- **Region / SOS weighting:** `region_elo.py` maintains walk-forward team +
  region Elo from domestic + international results. Cross-region prematch
  inference blends **65% SOS strength / 15% recent form / 20% structural**
  (`predictionPacket.ts`) so LEC rolling stats are not treated as equal to LCK.
  Team profiles surface **median-deviation** insights (vs regional + global
  tier-1 baselines) instead of generic “ahead at 15 = win” copy.

## Known limitations (documented, not blocking)

- Minor-region/wildcard teams appearing at MSI/Worlds get their own (short)
  history rather than being backfilled with their home-region season form.
- Team rebrand map only covers orgs already in `entityMap.ts`; anything
  missing there falls back to treating the OE name literally.
- Deno v1 uses a **scaled logistic linear approximation** of the XGBoost model
  (`inference_bundle.json`), not full tree traversal — good enough for chat;
  raw `series_model.json` is kept for a future native scorer.
