import type { Champion, Player, TeamChampion } from '../hooks/useDashboardData'
import { roleColor as championRoleColor, roleForChampion } from './championAnalytics'
import { getMetricValue, normalizePosition, type RoleKey } from './playerRadar'

export const MATCHUP_POSITIONS: RoleKey[] = ['top', 'jungle', 'mid', 'adc', 'support']

export const MINI_RADAR_METRICS = [
  { key: 'kda' as const, label: 'KDA', format: (v: number) => v.toFixed(2) },
  { key: 'gd15' as const, label: 'GD@15', format: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
  { key: 'dpm' as const, label: 'DPM', format: (v: number) => v.toFixed(0) },
  { key: 'csd15' as const, label: 'CS@15', format: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
]

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
      metric: def.label,
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
