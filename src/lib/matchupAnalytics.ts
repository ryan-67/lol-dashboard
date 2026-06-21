import type { Champion, Player, Team, TeamChampion } from '../hooks/useDashboardData'
import { roleColor as championRoleColor, roleForChampion } from './championAnalytics'
import { getMetricValue, normalizePosition, type RoleKey } from './playerRadar'

export const MATCHUP_POSITIONS: RoleKey[] = ['top', 'jungle', 'mid', 'adc', 'support']

export const MINI_RADAR_METRICS = [
  { key: 'kda' as const, label: 'KDA', shortLabel: 'KDA', format: (v: number) => v.toFixed(2) },
  {
    key: 'gd15' as const,
    label: 'Gold Diff@15',
    shortLabel: 'GD@15',
    format: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`,
  },
  { key: 'dpm' as const, label: 'DPM', shortLabel: 'DPM', format: (v: number) => v.toFixed(0) },
  {
    key: 'csd15' as const,
    label: 'CS Diff@15',
    shortLabel: 'CS@15',
    format: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`,
  },
]

export interface PriorityChampionEntry {
  champion: string
  role: RoleKey | null
  picks: number
  pickRate: number
  avgPickOrder: number | null
  priorityScore: number
  winrate: number
}

export interface UniqueChampionEntry {
  champion: string
  role: RoleKey | null
  games: number
  winrate: number
}

export interface PositionalMatchup {
  position: RoleKey
  teamAPlayer: Player | null
  teamBPlayer: Player | null
}

export interface MiniRadarPoint {
  metric: string
  label: string
  playerANorm: number
  playerBNorm: number
  playerARaw: number
  playerBRaw: number
  formattedA: string
  formattedB: string
}

function normalizePair(a: number, b: number): { aNorm: number; bNorm: number } {
  const min = Math.min(a, b)
  const max = Math.max(a, b)
  if (max === min) return { aNorm: 50, bNorm: 50 }
  return {
    aNorm: ((a - min) / (max - min)) * 100,
    bNorm: ((b - min) / (max - min)) * 100,
  }
}

export function buildPositionalMatchups(
  players: Player[],
  teamA: string,
  teamB: string,
): PositionalMatchup[] {
  return MATCHUP_POSITIONS.map((position) => {
    const teamAPlayer =
      players
        .filter((p) => p.team === teamA && normalizePosition(p.position) === position)
        .sort((a, b) => b.games - a.games)[0] ?? null
    const teamBPlayer =
      players
        .filter((p) => p.team === teamB && normalizePosition(p.position) === position)
        .sort((a, b) => b.games - a.games)[0] ?? null
    return { position, teamAPlayer, teamBPlayer }
  })
}

export function buildMiniRadarSeries(
  playerA: Player,
  playerB: Player,
): MiniRadarPoint[] {
  return MINI_RADAR_METRICS.map((def) => {
    const playerARaw = getMetricValue(playerA, def.key)
    const playerBRaw = getMetricValue(playerB, def.key)
    const { aNorm, bNorm } = normalizePair(playerARaw, playerBRaw)
    return {
      metric: def.shortLabel,
      label: def.label,
      playerANorm: aNorm,
      playerBNorm: bNorm,
      playerARaw,
      playerBRaw,
      formattedA: def.format(playerARaw),
      formattedB: def.format(playerBRaw),
    }
  })
}

export function computeUniqueChampions(
  teamChampions: TeamChampion[],
  teamA: string,
  teamB: string,
  championsByName: Map<string, Champion>,
): { teamAUnique: UniqueChampionEntry[]; teamBUnique: UniqueChampionEntry[] } {
  const champsFor = (team: string) =>
    teamChampions.filter((row) => row.team === team && row.picks >= 1)

  const setFor = (team: string) => new Set(champsFor(team).map((r) => r.champion))

  const aSet = setFor(teamA)
  const bSet = setFor(teamB)

  const toEntry = (row: TeamChampion): UniqueChampionEntry => {
    const champ = championsByName.get(row.champion)
    const role = champ ? roleForChampion(champ) : null
    return {
      champion: row.champion,
      role,
      games: row.picks,
      winrate: row.winrate,
    }
  }

  const teamAUnique = champsFor(teamA)
    .filter((row) => !bSet.has(row.champion))
    .map(toEntry)
    .sort((a, b) => b.games - a.games)

  const teamBUnique = champsFor(teamB)
    .filter((row) => !aSet.has(row.champion))
    .map(toEntry)
    .sort((a, b) => b.games - a.games)

  return { teamAUnique, teamBUnique }
}

function teamTotalGames(teams: Team[], teamName: string): number {
  const team = teams.find((t) => t.name === teamName)
  if (!team) return 1
  return Math.max(team.wins + team.losses, 1)
}

function computePriorityScore(
  row: TeamChampion,
  teamGames: number,
): Omit<PriorityChampionEntry, 'champion' | 'role'> {
  const pickRate = (row.picks / teamGames) * 100
  const avgPickOrder = row.avgPickOrder ?? null
  const orderScore = avgPickOrder != null ? ((6 - avgPickOrder) / 5) * 100 : 50
  const priorityScore = pickRate * 0.65 + orderScore * 0.35
  return {
    picks: row.picks,
    pickRate,
    avgPickOrder,
    priorityScore,
    winrate: row.winrate,
  }
}

export function computeTeamPriorityChamps(
  teamChampions: TeamChampion[],
  teams: Team[],
  teamName: string,
  championsByName: Map<string, Champion>,
  limit = 10,
): PriorityChampionEntry[] {
  const teamGames = teamTotalGames(teams, teamName)
  return teamChampions
    .filter((row) => row.team === teamName && row.picks >= 2)
    .map((row) => {
      const champ = championsByName.get(row.champion)
      const role = champ ? roleForChampion(champ) : null
      return {
        champion: row.champion,
        role,
        ...computePriorityScore(row, teamGames),
      }
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
}

export function computeHighestPriorityChamps(
  teamChampions: TeamChampion[],
  teams: Team[],
  teamA: string,
  teamB: string,
  championsByName: Map<string, Champion>,
  limit = 10,
): { teamA: PriorityChampionEntry[]; teamB: PriorityChampionEntry[] } {
  return {
    teamA: computeTeamPriorityChamps(teamChampions, teams, teamA, championsByName, limit),
    teamB: computeTeamPriorityChamps(teamChampions, teams, teamB, championsByName, limit),
  }
}

export function championRoleBadgeColor(role: RoleKey | null): string {
  return role ? championRoleColor(role) : '#9e9a8e'
}

export function formatGameLength(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function positionLabel(position: RoleKey): string {
  return position.toUpperCase()
}
