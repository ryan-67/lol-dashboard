import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import type { EnrichedSeriesGame, ResolvedSeries, SeriesGameRosterPlayer } from './seriesAnalytics'
import { type TeamGoldGameSeries } from './entities/entityAnalytics'
import { teamMatchesCanonical } from './entities/slugs'
import type { CitoGameGoldRecord } from './citoGoldMatch'
import type { GolGameGoldRecord } from './golGoldMatch'
import { resolveGoldTimelineForGame } from './goldTimelineResolve'
import {
  ADVANCED_METRICS_BY_ROLE,
  dmgGoldRatioFromGame,
  dmgPerGoldFromGame,
  getAdvancedMetricValue,
  type AdvancedMetricKey,
} from './advancedStats'
import {
  gameMetricRaw,
  normalizePosition,
  playersForRole,
  ROLE_METRICS,
  type RadarMetricKey,
  type RoleKey,
} from './playerRadar'

const OUTLIER_Z = 1.5

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function zScore(value: number, values: number[]): number {
  const sd = stdDev(values)
  if (!sd) return 0
  return (value - mean(values)) / sd
}

function findPlayerGameLog(
  players: Player[],
  gameId: string,
  playerName: string,
): PlayerGameLog | null {
  for (const p of players) {
    if (p.name !== playerName) continue
    const hit = (p.gameLog ?? []).find((g) => (g.gameId ?? '') === gameId)
    if (hit) return hit
  }
  return null
}

export function resolveSeriesGameGoldTimeline(
  game: EnrichedSeriesGame,
  series: ResolvedSeries,
  players: Player[],
  citoRows: CitoGameGoldRecord[],
  perspectiveTeam: string,
  maxMinute = 35,
  golRows: GolGameGoldRecord[] = [],
): TeamGoldGameSeries | null {
  const roster = players.filter(
    (p) =>
      teamMatchesCanonical(p.team, perspectiveTeam) ||
      teamMatchesCanonical(p.team, series.teamA) ||
      teamMatchesCanonical(p.team, series.teamB),
  )
  if (!roster.length) return null

  const anchor = roster.reduce(
    (best, p) => ((p.gameLog ?? []).length > (best.gameLog ?? []).length ? p : best),
    roster[0]!,
  )
  const anchorLog = [...(anchor.gameLog ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const log = findPlayerGameLog(players, game.id, anchor.name)
    ?? roster.flatMap((p) => p.gameLog ?? []).find((g) => g.gameId === game.id)
  if (!log) return null

  const opponent =
    log.opponent ??
    (teamMatchesCanonical(game.winner, perspectiveTeam)
      ? teamMatchesCanonical(series.teamA, perspectiveTeam)
        ? series.teamB
        : series.teamA
      : perspectiveTeam)

  const resolved = resolveGoldTimelineForGame(
    log,
    anchorLog,
    perspectiveTeam,
    opponent,
    citoRows,
    golRows,
    maxMinute,
  )
  if (!resolved) return null

  return {
    id: game.id,
    label: `${opponent} · ${game.date}`,
    opponent,
    date: game.date,
    result: log.result === 1 ? 'W' : 'L',
    points: resolved.points,
    dataSource: resolved.dataSource,
  }
}

/** @deprecated use resolveSeriesGameGoldTimeline with Cito rows */
export function buildSeriesGameGoldSeries(
  game: EnrichedSeriesGame,
  series: ResolvedSeries,
  players: Player[],
  perspectiveTeam: string,
  maxMinute = 30,
): TeamGoldGameSeries | null {
  return resolveSeriesGameGoldTimeline(game, series, players, [], perspectiveTeam, maxMinute)
}

export interface GameDistributionRow {
  name: string
  team: string
  dmgShare: number
  goldShare: number
}

export function buildGameDistributionRows(
  roster: SeriesGameRosterPlayer[],
  players: Player[],
  gameId: string,
): GameDistributionRow[] {
  return roster
    .map((row) => {
      const log = findPlayerGameLog(players, gameId, row.name)
      if (!log) return null
      return {
        name: row.name,
        team: row.team,
        dmgShare: log.dmgShare ?? 0,
        goldShare: log.goldShare ?? 0,
      }
    })
    .filter((r): r is GameDistributionRow => r != null)
}

export interface GameStatHighlight {
  player: string
  team: string
  role: RoleKey
  label: string
  formatted: string
  cohortAvgFormatted: string
  zScore: number
  direction: 'high' | 'low'
}

function formatGameMetric(key: RadarMetricKey, value: number): string {
  const def = Object.values(ROLE_METRICS)
    .flat()
    .find((d) => d.key === key)
  return def ? def.format(value) : String(value)
}

function gameAdvancedValue(game: PlayerGameLog, key: AdvancedMetricKey): number | null {
  switch (key) {
    case 'dmgGoldRatio':
      return dmgGoldRatioFromGame(game)
    case 'dmgPerGold': {
      const v = dmgPerGoldFromGame(game)
      return v > 0 ? v : null
    }
    case 'kaPerMin':
      return game.kaPerMin ?? null
    case 'turretPlates':
      return game.turretPlates ?? null
    case 'campsStolen':
      return game.campsStolen ?? null
    case 'wardsDestroyed':
      return game.wardsDestroyed ?? null
    default:
      return null
  }
}

export function findGameStatHighlights(
  roster: SeriesGameRosterPlayer[],
  players: Player[],
  gameId: string,
  cohortPlayers: Player[],
): GameStatHighlight[] {
  const highlights: GameStatHighlight[] = []

  for (const row of roster) {
    const log = findPlayerGameLog(players, gameId, row.name)
    if (!log) continue
    const role = normalizePosition(row.role)
    if (!role) continue
    const roleCohort = playersForRole(cohortPlayers, role)

    for (const def of ROLE_METRICS[role]) {
      const value = gameMetricRaw(log, def.key, roleCohort)
      if (value == null) continue
      const cohortValues = roleCohort
        .flatMap((p) => p.gameLog ?? [])
        .map((g) => gameMetricRaw(g, def.key, roleCohort))
        .filter((v): v is number => v != null)
      if (cohortValues.length < 8) continue

      const z = zScore(value, cohortValues)
      if (Math.abs(z) < OUTLIER_Z) continue

      highlights.push({
        player: row.name,
        team: row.team,
        role,
        label: def.label,
        formatted: formatGameMetric(def.key, value),
        cohortAvgFormatted: formatGameMetric(def.key, mean(cohortValues)),
        zScore: z,
        direction: z >= OUTLIER_Z ? 'high' : 'low',
      })
    }

    for (const def of ADVANCED_METRICS_BY_ROLE[role]) {
      const value = gameAdvancedValue(log, def.key)
      if (value == null) continue
      const cohortValues = roleCohort
        .map((p) => getAdvancedMetricValue(p, def.key))
        .filter((v) => v > 0 || def.key === 'campsStolen' || def.key === 'turretPlates')
      if (cohortValues.length < 3) continue

      const z = zScore(value, cohortValues)
      if (Math.abs(z) < OUTLIER_Z) continue
      if (z <= -OUTLIER_Z && def.higherIsBetter) continue

      highlights.push({
        player: row.name,
        team: row.team,
        role,
        label: def.label,
        formatted: def.format(value),
        cohortAvgFormatted: def.format(mean(cohortValues)),
        zScore: z,
        direction: z >= OUTLIER_Z ? 'high' : 'low',
      })
    }
  }

  return highlights.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)).slice(0, 12)
}
