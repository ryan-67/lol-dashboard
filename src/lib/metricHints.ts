export const PERFORMANCE_SCORE_HINT =
  'Role-relative game form (0–100). Same display band as nucky power rankings — weekly box-score composite vs role peers in the hub window.'

export const TEAM_SCORE_HINT =
  'Weekly team heat (0–100): winrate, early gold, KDA, objectives, strength of schedule, and upset wins — normalized to the same out-of-100 scale as power boards.'

export const OP_SCORE_HINT =
  'Champion OP score (0–100). Draft meta + role radar z-scores, confidence-adjusted by sample size; 50 ≈ role-average week.'

/**
 * Explains filter/window form scores vs nucky model "current power" ratings when both
 * appear on the same surface (Overview standouts vs rankings, Predictions analysis, etc.).
 */
export const MODEL_VS_FILTER_SCORE_HINT =
  'Two different score families appear here. Hub / standout / table stats under LEAGUE·YEAR·SPLIT (or last week/month on Overview) measure form inside that filter window. nucky model power rankings use the trained current-strength ratings (team Elo + player power) that update when the model retrain pipeline runs — not the same number as a weekly standout score.'

export const MODEL_POWER_RANKINGS_SUBTITLE =
  'nucky model current power — walk-forward ratings from the prediction pipeline (not the LEAGUE/YEAR/SPLIT form window).'
