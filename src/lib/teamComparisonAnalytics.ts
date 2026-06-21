import type { Player, Team } from '../hooks/useDashboardData'
import { teamMatchesCanonical } from './entities/slugs'
import { normalizePosition, ROLES, type RoleKey } from './playerRadar'
import { formatGameLength } from './matchupAnalytics'
import { computeSideWinrates } from './entities/entityAnalytics'

export interface TeamComparisonStatRow {
  metric: string
  label: string
  [teamKey: string]: string | number
}

export interface TeamRosterPlayer {
  player: Player
  role: RoleKey
}

/** Best player per role on a team (by games). */
export function rosterPlayersForTeam(players: Player[], team: Team): TeamRosterPlayer[] {
  const teamPlayers = players.filter(
    (p) => p.team === team.name || teamMatchesCanonical(p.team, team.name),
  )
  const byRole = new Map<RoleKey, Player>()
  for (const role of ROLES) {
    const best =
      teamPlayers
        .filter((p) => normalizePosition(p.position) === role)
        .sort((a, b) => b.games - a.games)[0] ?? null
    if (best) byRole.set(role, best)
  }
  return ROLES.filter((role) => byRole.has(role)).map((role) => ({
    player: byRole.get(role)!,
    role,
  }))
}

export function buildTeamComparisonStatRows(
  teams: Team[],
  players: Player[],
): TeamComparisonStatRow[] {
  const sideStats = teams.map((team) => ({
    team,
    sides: computeSideWinrates(players, team.name),
  }))

  const metrics: Array<{
    metric: string
    label: string
    value: (team: Team, index: number) => number
    format: (v: number) => string
  }> = [
    {
      metric: 'winrate',
      label: 'Win Rate',
      value: (t) => t.winrate,
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      metric: 'blueWr',
      label: 'Blue Side WR',
      value: (_t, i) => sideStats[i]?.sides.blue.winrate ?? 0,
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      metric: 'redWr',
      label: 'Red Side WR',
      value: (_t, i) => sideStats[i]?.sides.red.winrate ?? 0,
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      metric: 'dragons',
      label: 'Dragons / Game',
      value: (t) => t.dragonsPerGame ?? 0,
      format: (v) => v.toFixed(2),
    },
    {
      metric: 'barons',
      label: 'Barons / Game',
      value: (t) => t.baronsPerGame ?? 0,
      format: (v) => v.toFixed(2),
    },
    {
      metric: 'towers',
      label: 'Towers / Game',
      value: (t) => t.towersPerGame ?? 0,
      format: (v) => v.toFixed(2),
    },
    {
      metric: 'firstBlood',
      label: 'First Blood %',
      value: (t) => t.firstBloodRate ?? 0,
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      metric: 'gameLength',
      label: 'Avg Game Duration',
      value: (t) => t.avgGameLength ?? 0,
      format: (v) => (v > 0 ? formatGameLength(v) : '—'),
    },
  ]

  return metrics.map(({ metric, label, value, format }) => {
    const row: TeamComparisonStatRow = { metric, label }
    teams.forEach((team, index) => {
      const raw = value(team, index)
      row[`team${index}`] = raw
      row[`team${index}Label`] = format(raw)
    })
    return row
  })
}

export function teamRecordLabel(team: Team): string {
  return `${team.wins}W-${team.losses}L`
}

/** Muted distinct colors for player slices within a team pie. */
export function playerShareColors(names: string[]): Record<string, string> {
  const base = ['#c45c5c', '#5c9e5a', '#5c7a9e', '#c5a059', '#8c6a9e', '#9e8c7a', '#6a7a8c']
  const out: Record<string, string> = {}
  names.forEach((name, index) => {
    out[name] = base[index % base.length]!
  })
  return out
}

export interface PlayerShareSlice {
  name: string
  role: RoleKey
  value: number
  fill: string
}

export function buildPlayerShareSlices(
  roster: TeamRosterPlayer[],
  metric: 'dmgShare' | 'goldShare',
): PlayerShareSlice[] {
  const colors = playerShareColors(roster.map((r) => r.player.name))
  return roster
    .map(({ player, role }) => ({
      name: player.name,
      role,
      value: metric === 'dmgShare' ? (player.dmgShare ?? 0) : (player.goldShare ?? 0),
      fill: colors[player.name] ?? '#c5a059',
    }))
    .filter((slice) => slice.value > 0)
}
