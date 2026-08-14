export const PERFORMANCE_SCORE_HINT =
  'Role-relative game form (0–100) inside the hub window — used for Player of the Week standouts, not the model power boards below.'

export const TEAM_SCORE_HINT =
  'Mean prediction-model game score (0–100) for the team’s unique games in the hub window — same per-game performance score as Player of the Week, averaged across the roster.'

export const OP_SCORE_HINT =
  'Champion OP score (0–100). Draft meta + role radar z-scores, confidence-adjusted by sample size; 50 ≈ role-average form.'

/**
 * Explains filter/window form scores vs nucky model "current power" ratings when both
 * appear on the same surface (Overview standouts vs rankings, Predictions analysis, etc.).
 */
export const MODEL_VS_FILTER_SCORE_HINT =
  'Two different score families appear here. Hub / standout / table stats under LEAGUE·YEAR·SPLIT (or last week/month on Overview) measure form inside that filter window. nucky model power rankings use the trained current-strength ratings (team Elo + player power) that update when the model retrain pipeline runs — not the same number as a weekly standout score.'

export const MODEL_POWER_RANKINGS_SUBTITLE =
  'nucky model current strength — walk-forward player ratings from the prediction pipeline, not last-7-day hub form. Typical leaders sit in the 70s–80s.'

export const TEAM_POWER_RANKINGS_SUBTITLE =
  'nucky model current strength — Component 1 Elo (0.8×team + 0.2×region). Typical LCK/LPL leaders sit in the high 70s–80s; 100 would require Elo ~2000.'

export const CHAMPION_POWER_RANKINGS_SUBTITLE =
  'Current-meta OP (recency-weighted draft stats) — not Champion of the Week. Presence is pick% + ban% of games, capped at 100%.'
