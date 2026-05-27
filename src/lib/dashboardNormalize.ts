import type {
  Champion,
  DashboardData,
  Matchup,
  Player,
  Team,
  TeamChampion,
} from '../hooks/useDashboardData'

function isPlayerRow(row: unknown): row is Player {
  if (!row || typeof row !== 'object') return false
  const r = row as Record<string, unknown>
  return (
    typeof r.name === 'string' &&
    typeof r.position === 'string' &&
    !Array.isArray(r.positions) &&
    typeof r.kda === 'number'
  )
}

function isTeamRow(row: unknown): row is Team {
  if (!row || typeof row !== 'object') return false
  const r = row as Record<string, unknown>
  return (
    typeof r.name === 'string' &&
    typeof r.league === 'string' &&
    typeof r.wins === 'number' &&
    typeof r.losses === 'number' &&
    !Array.isArray(r.positions)
  )
}

function isChampionRow(row: unknown): row is Champion {
  if (!row || typeof row !== 'object') return false
  const r = row as Record<string, unknown>
  return (
    typeof r.name === 'string' &&
    Array.isArray(r.positions) &&
    typeof r.picks === 'number'
  )
}

function dedupeByName<T extends { name: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    if (seen.has(row.name)) continue
    seen.add(row.name)
    out.push(row)
  }
  return out
}

/** Split corrupted arrays (teams/champions appended to players/teams) into clean lists. */
export function normalizeDashboardData(raw: Record<string, unknown>): DashboardData {
  const meta = raw.meta as DashboardData['meta']
  const rawPlayers = Array.isArray(raw.players) ? raw.players : []
  const rawTeams = Array.isArray(raw.teams) ? raw.teams : []
  const rawChampions = Array.isArray(raw.champions) ? raw.champions : []

  const playersFromPlayers = rawPlayers.filter(isPlayerRow)
  const teamsFromPlayers = rawPlayers.filter(isTeamRow)
  const champsFromPlayers = rawPlayers.filter(isChampionRow)

  const teamsFromTeams = rawTeams.filter(isTeamRow)
  const champsFromTeams = rawTeams.filter(isChampionRow)

  const championsFromKey = rawChampions.filter(isChampionRow)

  const players = dedupeByName(playersFromPlayers)
  const teams = dedupeByName([...teamsFromTeams, ...teamsFromPlayers])
  const champions = dedupeByName([
    ...championsFromKey,
    ...champsFromTeams,
    ...champsFromPlayers,
  ])

  const championsByLeague = raw.championsByLeague as
    | Record<string, Champion[]>
    | undefined

  const matchups = Array.isArray(raw.matchups)
    ? (raw.matchups as Matchup[])
    : []

  const teamChampions = Array.isArray(raw.teamChampions)
    ? (raw.teamChampions as TeamChampion[])
    : []

  return {
    meta,
    players,
    teams,
    champions,
    championsByLeague,
    matchups,
    teamChampions,
  }
}
