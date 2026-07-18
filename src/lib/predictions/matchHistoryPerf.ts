import type { Player } from '../../hooks/useDashboardData'
import { buildTeamMatchHistory, type TeamMatchRow } from '../entities/entityAnalytics'
import { teamMatchesCanonical } from '../entities/slugs'
import { computeGameScore, normalizePosition, type RoleKey } from '../playerRadar'
import { unitIntervalTo100 } from '../scoreNormalize'

export interface TeamMatchRowWithPerf extends TeamMatchRow {
  performanceScore: number | null
}

/** Average roster performance score (0–100) for a gameId, when game logs exist. */
export function teamGamePerformanceScore(
  players: Player[],
  teamName: string,
  gameId: string,
  cohort: Player[],
): number | null {
  if (!gameId) return null
  const scores: number[] = []
  for (const p of players) {
    if (!teamMatchesCanonical(p.team, teamName)) continue
    const role: RoleKey | null = normalizePosition(p.position)
    if (!role) continue
    const game = p.gameLog?.find((g) => g.gameId === gameId)
    if (!game) continue
    scores.push(computeGameScore(game, role, cohort))
  }
  if (!scores.length) return null
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return unitIntervalTo100(avg)
}

export function buildTeamMatchHistoryWithPerf(
  players: Player[],
  teamSlugOrName: string,
  limit = 10,
  fallbackLeague?: string,
  fallbackSplit?: string,
  gameCatalog?: Record<string, import('../../hooks/useDashboardData').GameCatalogEntry>,
): TeamMatchRowWithPerf[] {
  const rows = buildTeamMatchHistory(
    players,
    teamSlugOrName,
    limit,
    fallbackLeague,
    fallbackSplit,
    gameCatalog,
  )
  return rows.map((row) => ({
    ...row,
    performanceScore: teamGamePerformanceScore(players, row.teamName, row.gameId, players),
  }))
}
