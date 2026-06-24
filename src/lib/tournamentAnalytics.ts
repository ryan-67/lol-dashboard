import type { Champion, Player, PlayerGameLog, Team } from '../hooks/useDashboardData'
import type { DashboardData } from '../hooks/useDashboardData'
import {
  buildTournamentIdentity,
  compareTournamentIdentity,
  type TournamentIdentity,
} from './tournamentCatalog'
import { isDisplayablePlayer } from './playerRadar'
import { isDisplayableTeam } from './teamAnalytics'
import { isDisplayableChampion } from './championAnalytics'

export interface TournamentSummary extends TournamentIdentity {
  gameCount: number
  firstGameDate: string
  lastGameDate: string
  avgGameDurationMin: number | null
  region: string
}

export interface TournamentStandingsRow {
  team: string
  league: string
  wins: number
  losses: number
  winrate: number
}

function regionCode(league: string): string {
  const map: Record<string, string> = {
    LCK: 'KR',
    LPL: 'CN',
    LEC: 'EU',
    LCS: 'NA',
    MSI: 'INT',
    Worlds: 'INT',
    'First Stand': 'INT',
  }
  return map[league] ?? league.slice(0, 2).toUpperCase()
}

export function gameMatchesTournament(
  game: PlayerGameLog,
  tournament: Pick<TournamentIdentity, 'league' | 'canonicalSplit' | 'segment' | 'season'>,
): boolean {
  const gameSplit = game.split ?? ''
  if (gameSplit !== tournament.canonicalSplit) return false

  const international = ['MSI', 'Worlds', 'First Stand'].includes(tournament.season)
  if (international) return tournament.segment === 'event'

  const gameLeague = game.league ?? ''
  if (gameLeague !== tournament.league) return false

  const isPlayoff = Boolean(game.playoffs)
  if (tournament.segment === 'playoffs') return isPlayoff
  if (tournament.segment === 'regular') return !isPlayoff
  return true
}

function collectGamesFromPlayers(players: Player[]): PlayerGameLog[] {
  const seen = new Set<string>()
  const games: PlayerGameLog[] = []

  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      const id = g.gameId ?? `${g.date}|${player.team}|${g.opponent ?? ''}|${g.result}`
      if (seen.has(id)) continue
      seen.add(id)
      games.push(g)
    }
  }
  return games
}

export function buildTournamentSummaries(data: DashboardData): TournamentSummary[] {
  const players = data.players.filter(isDisplayablePlayer)
  const games = collectGamesFromPlayers(players)
  const map = new Map<string, TournamentSummary & { durationSum: number; durationCount: number }>()

  for (const game of games) {
    const league = game.league ?? ''
    const split = game.split ?? ''
    if (!split) continue

    const identity = buildTournamentIdentity(league, split, Boolean(game.playoffs))
    const existing = map.get(identity.id)
    const duration = game.gameLength ?? null

    if (!existing) {
      map.set(identity.id, {
        ...identity,
        gameCount: 1,
        firstGameDate: game.date,
        lastGameDate: game.date,
        avgGameDurationMin: duration,
        region: regionCode(identity.league),
        durationSum: duration ?? 0,
        durationCount: duration != null ? 1 : 0,
      })
      continue
    }

    existing.gameCount += 1
    if (game.date < existing.firstGameDate) existing.firstGameDate = game.date
    if (game.date > existing.lastGameDate) existing.lastGameDate = game.date
    if (duration != null) {
      existing.durationSum += duration
      existing.durationCount += 1
      existing.avgGameDurationMin = existing.durationSum / existing.durationCount
    }
  }

  return [...map.values()].map(({ durationSum: _s, durationCount: _c, ...t }) => t)
    .sort((a, b) => b.lastGameDate.localeCompare(a.lastGameDate) || compareTournamentIdentity(a, b))
}

export function findTournamentById(
  data: DashboardData,
  id: string,
): TournamentSummary | null {
  return buildTournamentSummaries(data).find((t) => t.id === id) ?? null
}

export function filterPlayersForTournament(
  players: Player[],
  tournament: TournamentIdentity,
): Player[] {
  const out: Player[] = []
  for (const player of players) {
    const gameLog = (player.gameLog ?? []).filter((g) => gameMatchesTournament(g, tournament))
    if (!gameLog.length) continue
    out.push({
      ...player,
      games: gameLog.length,
      gameLog,
      kda: avg(gameLog.map((g) => g.kda)),
      gd15: avg(gameLog.map((g) => g.gd15)) ?? player.gd15,
      kp: avg(gameLog.map((g) => g.kp)) ?? player.kp,
      dmgShare: avg(gameLog.map((g) => g.dmgShare)) ?? player.dmgShare,
    })
  }
  return out
}

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function filterTeamsForTournament(teams: Team[], players: Player[]): Team[] {
  const teamNames = new Set(players.map((p) => p.team))
  return teams.filter((t) => isDisplayableTeam(t) && teamNames.has(t.name))
}

export function filterChampionsForTournament(
  champions: Champion[],
  players: Player[],
): Champion[] {
  const counts = new Map<string, { picks: number; wins: number }>()
  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      if (!g.champion) continue
      const cur = counts.get(g.champion) ?? { picks: 0, wins: 0 }
      cur.picks += 1
      if (g.result === 1) cur.wins += 1
      counts.set(g.champion, cur)
    }
  }

  const totalGames = [...counts.values()].reduce((s, c) => s + c.picks, 0) || 1

  return champions
    .filter((c) => isDisplayableChampion(c) && counts.has(c.name))
    .map((c) => {
      const stats = counts.get(c.name)!
      return {
        ...c,
        picks: stats.picks,
        games: stats.picks,
        wins: stats.wins,
        winrate: stats.picks ? (stats.wins / stats.picks) * 100 : 0,
        pickRate: (stats.picks / totalGames) * 100,
        presence: (stats.picks / totalGames) * 100,
      }
    })
    .sort((a, b) => b.picks - a.picks)
}

export function buildTournamentStandings(players: Player[]): TournamentStandingsRow[] {
  const records = new Map<string, { league: string; wins: number; losses: number }>()

  const seen = new Set<string>()
  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      const id = g.gameId ?? `${g.date}|${player.team}|${g.opponent ?? ''}|${g.result}`
      if (seen.has(id)) continue
      seen.add(id)

      const team = player.team
      const cur = records.get(team) ?? { league: player.league, wins: 0, losses: 0 }
      if (g.result === 1) cur.wins += 1
      else cur.losses += 1
      records.set(team, cur)
    }
  }

  return [...records.entries()]
    .map(([team, r]) => ({
      team,
      league: r.league,
      wins: r.wins,
      losses: r.losses,
      winrate: r.wins + r.losses ? (r.wins / (r.wins + r.losses)) * 100 : 0,
    }))
    .sort((a, b) => b.winrate - a.winrate || b.wins - a.wins)
}

export function resolveTournamentFromGame(
  game: PlayerGameLog,
): Pick<TournamentIdentity, 'id' | 'displayName' | 'segment'> {
  const identity = buildTournamentIdentity(game.league ?? '', game.split ?? '', Boolean(game.playoffs))
  return identity
}
