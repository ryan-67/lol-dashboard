import type { Champion, Player, PlayerGameLog, Team } from '../hooks/useDashboardData'
import type { DashboardData } from '../hooks/useDashboardData'
import {
  buildTournamentIdentityFromGame,
  compareTournamentIdentity,
  tournamentKeyFromGame,
  tournamentKeyFromIdentity,
  type TournamentIdentity,
} from './tournamentCatalog'
import { isDisplayablePlayer } from './playerRadar'
import { isDisplayableTeam } from './teamAnalytics'
import { isDisplayableChampion } from './championAnalytics'
import { buildTournamentSeriesList } from './seriesAnalytics'
import { resolveTeamCanonicalName } from './entities/slugs'

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

export function gameMatchesTournament(game: PlayerGameLog, tournament: TournamentIdentity): boolean {
  return tournamentKeyFromGame(game) === tournamentKeyFromIdentity(tournament)
}

function teamGameDedupeKey(game: PlayerGameLog, team: string): string {
  if (game.gameId) return `${team}|${game.gameId}`
  return `${team}|${game.date}|${game.opponent ?? ''}|${game.result}`
}

function uniqueGameKey(game: PlayerGameLog): string {
  if (game.gameId) return game.gameId
  return `game|${game.date}|${game.league ?? ''}|${game.opponent ?? ''}|${game.result}`
}

function collectGamesFromPlayers(players: Player[]): PlayerGameLog[] {
  const seen = new Set<string>()
  const games: PlayerGameLog[] = []

  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      const id = uniqueGameKey(g)
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
    const split = game.split ?? ''
    if (!split) continue

    const identity = buildTournamentIdentityFromGame(game)
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
      gd15: avg(gameLog.map((g) => g.gd15).filter((v): v is number => typeof v === 'number')) ?? player.gd15,
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

export function filterTeamsForTournament(
  teams: Team[],
  players: Player[],
  data?: DashboardData,
  tournament?: TournamentIdentity,
): Team[] {
  const standings =
    data && tournament
      ? buildTournamentSeriesStandings(data, tournament)
      : buildTournamentStandings(players)
  const byName = new Map(standings.map((s) => [s.team, s]))

  return teams
    .filter((t) => isDisplayableTeam(t) && byName.has(t.name))
    .map((t) => {
      const row = byName.get(t.name)!
      const games = row.wins + row.losses
      return {
        ...t,
        wins: row.wins,
        losses: row.losses,
        winrate: row.winrate,
        games,
      }
    })
    .sort((a, b) => b.winrate - a.winrate || b.wins - a.wins)
}

export function filterChampionsForTournament(
  champions: Champion[],
  players: Player[],
): Champion[] {
  const counts = new Map<string, { picks: number; wins: number }>()
  const seen = new Set<string>()

  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      if (!g.champion) continue
      const pickKey = `${player.team}|${teamGameDedupeKey(g, player.team)}|${g.champion}`
      if (seen.has(pickKey)) continue
      seen.add(pickKey)

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
  const byTeam = new Map<string, Player[]>()

  for (const player of players) {
    const roster = byTeam.get(player.team) ?? []
    roster.push(player)
    byTeam.set(player.team, roster)
  }

  for (const [team, roster] of byTeam) {
    const anchor = roster.reduce((best, p) =>
      (p.gameLog?.length ?? 0) > (best.gameLog?.length ?? 0) ? p : best,
    )
    const seen = new Set<string>()

    for (const g of anchor.gameLog ?? []) {
      const id = teamGameDedupeKey(g, team)
      if (seen.has(id)) continue
      seen.add(id)

      const cur = records.get(team) ?? { league: anchor.league, wins: 0, losses: 0 }
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

/** Series W-L within a tournament (matches gol.gg-style standings). */
export function buildTournamentSeriesStandings(
  data: DashboardData,
  tournament: TournamentIdentity,
): TournamentStandingsRow[] {
  const seriesList = buildTournamentSeriesList(data, tournament)
  const records = new Map<string, { league: string; wins: number; losses: number }>()

  for (const series of seriesList) {
    for (const team of [series.teamA, series.teamB]) {
      const won = series.winner === team
      const cur = records.get(team) ?? { league: tournament.league, wins: 0, losses: 0 }
      if (won) cur.wins += 1
      else cur.losses += 1
      records.set(team, cur)
    }
  }

  return [...records.entries()]
    .map(([team, r]) => ({
      team: resolveTeamCanonicalName(team),
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
  return buildTournamentIdentityFromGame(game)
}
