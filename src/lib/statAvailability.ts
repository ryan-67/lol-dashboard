import type { Player, PlayerGameLog } from '../hooks/useDashboardData'

/** Stats that may be absent on some games or leagues — require coverage checks. */
export type PartialCoverageMetricKey = 'gd15' | 'csd15' | 'xpd15' | 'turretPlates' | 'soloKills'

export const PARTIAL_COVERAGE_METRICS: PartialCoverageMetricKey[] = [
  'gd15',
  'csd15',
  'xpd15',
  'turretPlates',
  'soloKills',
]

export const PARTIAL_COVERAGE_THRESHOLD = 0.5

const GAME_OPTIONAL_KEYS: Partial<Record<PartialCoverageMetricKey, keyof PlayerGameLog>> = {
  gd15: 'gd15',
  csd15: 'csd15',
  xpd15: 'xpd15',
  turretPlates: 'turretPlates',
  soloKills: 'soloKills',
}

export function isSoloKillsTracked(cohort: Player[]): boolean {
  return cohort.some((p) => (p.gameLog ?? []).some((g) => (g.soloKills ?? 0) > 0))
}

/** True when this game row actually has the stat (not omitted from ingest). */
export function isGameStatPresent(
  game: PlayerGameLog,
  key: string,
  cohort: Player[] = [],
): boolean {
  if (!PARTIAL_COVERAGE_METRICS.includes(key as PartialCoverageMetricKey)) return true
  if (key === 'soloKills') {
    if (!isSoloKillsTracked(cohort)) return false
    return typeof game.soloKills === 'number' && !Number.isNaN(game.soloKills)
  }

  const field = GAME_OPTIONAL_KEYS[key as PartialCoverageMetricKey]
  if (!field) return true

  const value = game[field]
  return typeof value === 'number' && !Number.isNaN(value)
}

export function statCoverageFraction(player: Player, key: PartialCoverageMetricKey, cohort: Player[] = []): number {
  const log = player.gameLog ?? []
  if (!log.length) return 0
  const present = log.filter((g) => isGameStatPresent(g, key, cohort)).length
  return present / log.length
}

/** Aggregate/radar: include partial stat only when present on ≥50% of games. */
export function isStatEligibleForPlayer(
  player: Player,
  key: PartialCoverageMetricKey | string,
  cohort: Player[] = [],
): boolean {
  if (!PARTIAL_COVERAGE_METRICS.includes(key as PartialCoverageMetricKey)) return true
  return statCoverageFraction(player, key as PartialCoverageMetricKey, cohort) >= PARTIAL_COVERAGE_THRESHOLD
}

export function eligibleRadarMetrics<T extends { key: string }>(
  metrics: T[],
  player: Player,
  cohort: Player[],
): T[] {
  return metrics.filter((m) => isStatEligibleForPlayer(player, m.key, cohort))
}
