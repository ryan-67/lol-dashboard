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

/** Series-scoped team stats: combined side WR + @15 diffs instead of game length. */
export function buildSeriesTeamComparisonStatRows(
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
      metric: 'sideWr',
      label: 'Side Win Rate',
      value: () => 0,
      format: () => '',
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
      metric: 'gd15',
      label: 'Gold Diff @15',
      value: (t) => t.avgGd15 ?? 0,
      format: (v) => (v > 0 ? `+${v.toFixed(0)}` : v.toFixed(0)),
    },
    {
      metric: 'csd15',
      label: 'CS Diff @15',
      value: (t) => t.avgCsd15 ?? 0,
      format: (v) => (v > 0 ? `+${v.toFixed(0)}` : v.toFixed(0)),
    },
    {
      metric: 'xpd15',
      label: 'XP Diff @15',
      value: (t) => t.avgXpd15 ?? 0,
      format: (v) => (v > 0 ? `+${v.toFixed(0)}` : v.toFixed(0)),
    },
  ]

  const rows = metrics.map(({ metric, label, value, format }) => {
    const row: TeamComparisonStatRow = { metric, label }
    teams.forEach((team, index) => {
      const raw = value(team, index)
      row[`team${index}`] = raw
      row[`team${index}Label`] = format(raw)
    })
    return row
  })

  // Attach side win rates for the combined side chart.
  const sideRow = rows.find((r) => r.metric === 'sideWr')
  if (sideRow) {
    teams.forEach((team, index) => {
      sideRow[`team${index}Blue`] = sideStats[index]?.sides.blue.winrate ?? 0
      sideRow[`team${index}Red`] = sideStats[index]?.sides.red.winrate ?? 0
      sideRow[`team${index}BlueLabel`] = `${(sideStats[index]?.sides.blue.winrate ?? 0).toFixed(1)}%`
      sideRow[`team${index}RedLabel`] = `${(sideStats[index]?.sides.red.winrate ?? 0).toFixed(1)}%`
      sideRow[`team${index}Label`] = team.name
    })
  }

  return rows
}

/** Axis scaling for individual stat mini-charts. */
export const STAT_AXIS_KIND: Record<string, StatAxisKind> = {
  winrate: 'percent',
  blueWr: 'percent',
  redWr: 'percent',
  sideWr: 'percent',
  firstBlood: 'percent',
  dragons: 'count',
  barons: 'count',
  towers: 'count',
  gameLength: 'duration',
  gd15: 'signed',
  csd15: 'signed',
  xpd15: 'signed',
}

export type StatAxisKind = 'percent' | 'count' | 'duration' | 'signed'

export function statChartYDomain(values: number[], kind: StatAxisKind): [number, number] {
  const max = values.length ? Math.max(...values) : 0
  if (kind === 'percent') return [0, 100]
  if (kind === 'signed') {
    const maxAbs = values.length ? Math.max(...values.map((v) => Math.abs(v)), 1) : 1
    const ceiling = Math.ceil(maxAbs * 1.25)
    return [-ceiling, ceiling]
  }
  if (kind === 'duration') {
    const ceiling = max > 0 ? Math.ceil(max * 1.08) : 3600
    return [0, ceiling]
  }
  const ceiling = max > 0 ? Math.ceil(max * 1.25 * 10) / 10 : 1
  return [0, Math.max(ceiling, 0.5)]
}

export function statChartTickFormat(value: number, kind: StatAxisKind): string {
  if (kind === 'percent') return `${value}%`
  if (kind === 'signed') return value > 0 ? `+${value}` : String(value)
  if (kind === 'duration') return formatGameLength(value)
  return value % 1 === 0 ? String(value) : value.toFixed(1)
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
