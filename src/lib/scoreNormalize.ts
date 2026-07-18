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
 * Anchored to the observed model band (not a raw ×100, which crushed mid-pack
 * scores like ShowMaker 0.064 into a misleading 6.4).
 *
 * With defaults: Chovy ~0.53 → ~97, ShowMaker ~0.064 → ~39, bottom ~0.
 */
export function powerScoreTo100(
  powerScore: number,
  opts?: { floor?: number; ceiling?: number },
): number {
  const floor = opts?.floor ?? -0.25
  const ceiling = opts?.ceiling ?? 0.55
  const span = Math.max(ceiling - floor, 1e-6)
  return clampScore100(((powerScore - floor) / span) * 100)
}

/** Team Elo power rating → 0–100 (anchored to typical tier-1 Elo band). */
export function eloTo100(rating: number, opts?: { floor?: number; ceiling?: number }): number {
  const floor = opts?.floor ?? 1200
  const ceiling = opts?.ceiling ?? 1850
  const span = Math.max(ceiling - floor, 1)
  return clampScore100(((rating - floor) / span) * 100)
}

/** Weekly form / OP z composites already near 0–1 → 0–100. */
export function unitIntervalTo100(score: number): number {
  return clampScore100(score * 100)
}

/**
 * Map unbounded OP z-scores (roughly [-2, 2]) onto 0–100 with 50 = role average.
 */
export function opScoreTo100(opScore: number): number {
  return clampScore100(50 + opScore * 25)
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
