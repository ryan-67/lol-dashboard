import type { Player, Team } from '../hooks/useDashboardData'
import { teamMatchesCanonical } from './entities/slugs'
import { PARTIAL_COVERAGE_THRESHOLD } from './statAvailability'
import type { TeamRadarMetricKey } from './teamAnalytics'

function teamPlayerLogs(team: Team, players: Player[]): NonNullable<Player['gameLog']> {
  const logs: NonNullable<Player['gameLog']> = []
  for (const p of players) {
    if (!teamMatchesCanonical(p.team, team.name)) continue
    if (p.league !== team.league) continue
    logs.push(...(p.gameLog ?? []))
  }
  return logs
}

function gd15CoverageFraction(team: Team, players: Player[]): number {
  const logs = teamPlayerLogs(team, players)
  if (!logs.length) return 0
  const seen = new Set<string>()
  let present = 0
  let total = 0
  for (const g of logs) {
    const id = g.gameId ?? `${g.date}|${g.opponent ?? ''}|${g.result}`
    if (seen.has(id)) continue
    seen.add(id)
    total += 1
    if (typeof g.gd15 === 'number' && !Number.isNaN(g.gd15)) present += 1
  }
  return total ? present / total : 0
}

export function isTeamEarlyGameEligible(team: Team, players: Player[]): boolean {
  return gd15CoverageFraction(team, players) >= PARTIAL_COVERAGE_THRESHOLD
}

export function isTeamMetricEligibleForScore(
  team: Team,
  key: TeamRadarMetricKey,
  players: Player[],
): boolean {
  if (key === 'earlyGame') return isTeamEarlyGameEligible(team, players)
  return true
}
