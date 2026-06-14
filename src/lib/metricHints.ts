export const PERFORMANCE_SCORE_HINT =
  'Per-game composite score: role-specific stats (KDA, GD@15, CS@15, DPM, KP, vision, etc.) are normalized against the same-role cohort, weighted by role, then averaged across games in the past 7 days. Player of the Week is the highest weekly average. Scale: 0/100.'

export const TEAM_SCORE_HINT =
  'Weekly impressiveness score: normalized winrate (42%), GD@15 (18%), KDA (14%), objective control (12%), and opponent split winrate / strength of schedule (10%), plus a bonus for upset wins (+1.5 each). Highest score wins Hottest Team. Scale: 0/100 (upset wins can push slightly above 100).'

export const OP_SCORE_HINT =
  'Role-weighted z-scores for meta (presence, bans), results (winrate, KDA), and in-game stats (GD@15, DPM, KP, vision, etc.) within each role. Low sample sizes are confidence-adjusted so one-off spikes rank lower. Scale: ±3 (0 = role average; ~1+ is a strong week).'
