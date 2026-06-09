import type { Champion, Player, Team, TeamChampion } from '../../hooks/useDashboardData'
import { computeHighestPriorityChamps } from '../matchupAnalytics'
import type { RoleKey } from '../championAnalytics'
import { teamMatchesCanonical } from './slugs'

export interface ChampionWinrateEntry {
  champion: string
  games: number
  wins: number
  winrate: number
}

export function bestWorstChampions(
  player: Player,
  minGames: number,
): { best: ChampionWinrateEntry[]; worst: ChampionWinrateEntry[] } {
  const eligible = (player.championPool ?? []).filter((c) => c.games >= minGames)
  const sorted = [...eligible].sort((a, b) => b.winrate - a.winrate)
  return {
    best: sorted.slice(0, 5),
    worst: [...sorted].reverse().slice(0, 5),
  }
}

export interface TeamMatchRow {
  date: string
  opponent: string
  result: 'W' | 'L'
  side?: string
}

export function buildTeamMatchHistory(
  players: Player[],
  teamSlugOrName: string,
  limit = 10,
): TeamMatchRow[] {
  const rows: TeamMatchRow[] = []
  const seen = new Set<string>()

  for (const player of players) {
    if (!teamMatchesCanonical(player.team, teamSlugOrName)) continue
    for (const game of player.gameLog ?? []) {
      const key = `${game.date}|${game.opponent ?? ''}|${game.result}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        date: game.date,
        opponent: game.opponent ?? 'Unknown',
        result: game.result === 1 ? 'W' : 'L',
        side: game.side,
      })
    }
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

export interface SideWinrates {
  blue: { wins: number; games: number; winrate: number }
  red: { wins: number; games: number; winrate: number }
}

export function computeSideWinrates(
  players: Player[],
  teamSlugOrName: string,
): SideWinrates {
  const acc = {
    blue: { wins: 0, games: 0 },
    red: { wins: 0, games: 0 },
  }
  const seen = new Set<string>()

  for (const player of players) {
    if (!teamMatchesCanonical(player.team, teamSlugOrName)) continue
    for (const game of player.gameLog ?? []) {
      const side = (game.side ?? '').toLowerCase()
      if (side !== 'blue' && side !== 'red') continue
      const key = `${game.date}|${game.opponent}|${side}`
      if (seen.has(key)) continue
      seen.add(key)
      acc[side as 'blue' | 'red'].games += 1
      if (game.result === 1) acc[side as 'blue' | 'red'].wins += 1
    }
  }

  return {
    blue: {
      ...acc.blue,
      winrate: acc.blue.games ? (acc.blue.wins / acc.blue.games) * 100 : 0,
    },
    red: {
      ...acc.red,
      winrate: acc.red.games ? (acc.red.wins / acc.red.games) * 100 : 0,
    },
  }
}

export interface TeamTrendPoint {
  game: number
  date: string
  winrate: number
  gd15: number
}

export function buildTeamTrend(
  players: Player[],
  teamSlugOrName: string,
  limit = 20,
): TeamTrendPoint[] {
  const games = buildTeamMatchHistory(players, teamSlugOrName, limit).reverse()
  let wins = 0
  return games.map((g, i) => {
    if (g.result === 'W') wins += 1
    const teamPlayers = players.filter((p) => teamMatchesCanonical(p.team, teamSlugOrName))
    let gdSum = 0
    let gdCount = 0
    for (const p of teamPlayers) {
      const hit = (p.gameLog ?? []).find(
        (gl) => gl.date === g.date && (gl.opponent ?? '') === g.opponent,
      )
      if (hit) {
        gdSum += hit.gd15
        gdCount += 1
      }
    }
    return {
      game: i + 1,
      date: g.date,
      winrate: ((wins / (i + 1)) * 100),
      gd15: gdCount ? gdSum / gdCount : 0,
    }
  })
}

export function priorityChampsByRole(
  teamChampions: TeamChampion[],
  teams: Team[],
  teamName: string,
  champions: Champion[],
): Record<RoleKey, ReturnType<typeof computeHighestPriorityChamps>['teamA']> {
  const championsByName = new Map(champions.map((c) => [c.name, c]))
  const { teamA } = computeHighestPriorityChamps(
    teamChampions,
    teams,
    teamName,
    teamName,
    championsByName,
    20,
  )
  const byRole: Record<RoleKey, typeof teamA> = {
    top: [],
    jungle: [],
    mid: [],
    adc: [],
    support: [],
  }
  for (const entry of teamA) {
    const role = entry.role ?? 'mid'
    if (byRole[role].length < 5) byRole[role].push(entry)
  }
  return byRole
}

export function topPlayersOnChampion(
  players: Player[],
  championName: string,
  limit = 8,
): Array<{ player: Player; games: number; winrate: number }> {
  return players
    .map((player) => {
      const entry = (player.championPool ?? []).find((c) => c.champion === championName)
      if (!entry || entry.games < 2) return null
      return { player, games: entry.games, winrate: entry.winrate }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.games - a.games)
    .slice(0, limit)
}

export function championWeeklyTrend(champion: Champion) {
  return (champion.weeklyStats ?? [])
    .slice()
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({
      week: w.weekStart,
      presence: w.presence,
      winrate: w.winrate ?? 0,
      picks: w.picks,
      bans: w.bans,
    }))
}
