/**
 * Display helpers — map model scores onto a shared 0–100 scale for rankings + overview.
 *
 * Player powerScore from player_ratings.json is roughly in [-0.25, 0.55].
 * Team Elo from region_strength.json is typically ~1200–1850.
 * Overview weekly performance (computeGameScore) is already 0–1 → ×100.
 */

export function clampScore100(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

/**
 * Role-normalized power score → 0–100.
 * Ceiling is above any realistic weekly/model reading so 100 is reserved for
 * a theoretically perfect stretch — leaders land in the high 70s–80s, not 100.
 * Small samples are pulled toward 50 so a 10-game spike cannot top the board.
 */
export function powerScoreTo100(
  powerScore: number,
  opts?: { floor?: number; ceiling?: number; effGames?: number },
): number {
  const floor = opts?.floor ?? -0.3
  const ceiling = opts?.ceiling ?? 0.85
  const span = Math.max(ceiling - floor, 1e-6)
  const raw = clampScore100(((powerScore - floor) / span) * 100)
  return shrinkTowardFifty(raw, opts?.effGames, 20)
}

/** Team Elo power rating → 0–100. 1850 maps ~81, 2000 would be 100. */
export function eloTo100(rating: number, opts?: { floor?: number; ceiling?: number }): number {
  const floor = opts?.floor ?? 1200
  const ceiling = opts?.ceiling ?? 2000
  const span = Math.max(ceiling - floor, 1)
  return clampScore100(((rating - floor) / span) * 100)
}

/** Weekly 0–1 form (vs role cohort) → 0–100 with a 96 cap. */
export function formUnitTo100(score01: number, games = 8): number {
  const raw = clampScore100(score01 * 88 + 8)
  return Math.min(96, shrinkTowardFifty(raw, games, 4))
}

function shrinkTowardFifty(score: number, games: number | undefined, fullAt: number): number {
  if (games == null || games >= fullAt) return score
  const w = Math.max(0.35, games / fullAt)
  return clampScore100(50 + (score - 50) * w)
}

/** Weekly form / OP z composites already near 0–1 → 0–100. */
export function unitIntervalTo100(score: number): number {
  return clampScore100(score * 100)
}

/**
 * Map unbounded OP z-scores (roughly [-2, 2]) onto 0–100 with 50 = role average.
 */
export function opScoreTo100(opScore: number): number {
  return Math.min(96, clampScore100(50 + opScore * 22))
}

/** Ordinal suffix for ranks/percentiles (1st, 2nd, 3rd, 4th, … 21st, 22nd). */
export function ordinalSuffix(n: number): string {
  const v = Math.abs(Math.round(n)) % 100
  if (v >= 11 && v <= 13) return 'th'
  switch (v % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}
