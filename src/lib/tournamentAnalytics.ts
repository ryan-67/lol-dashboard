import type { Champion, GameCatalogEntry, Player, PlayerGameLog, Team } from '../hooks/useDashboardData'
import type { DashboardData } from '../hooks/useDashboardData'
import {
  buildTournamentIdentityFromGame,
  compareTournamentIdentity,
  isInternationalSeason,
  parseCanonicalSplit,
  tournamentKeyFromGame,
  tournamentKeyFromIdentity,
  tournamentYearFromGame,
  type TournamentIdentity,
} from './tournamentCatalog'
import { isDisplayablePlayer } from './playerRadar'
import { isDisplayableTeam } from './teamAnalytics'
import { isDisplayableChampion, roleForChampion, type RoleFilter } from './championAnalytics'
import { buildTournamentSeriesList } from './seriesAnalytics'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
import { rankTournamentStandings, type TournamentRankContext } from './tournamentRank'

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
  const { season } = parseCanonicalSplit(game.split ?? '')
  if (isInternationalSeason(tournament.season) && isInternationalSeason(season)) {
    return season === tournament.season && tournamentYearFromGame(game) === tournament.year
  }
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

function aggregateTeamFromRoster(
  teamName: string,
  allTeams: Team[],
  roster: Player[],
  standingsRow?: TournamentStandingsRow,
): Team | null {
  const base = allTeams.find((t) => teamMatchesCanonical(t.name, teamName))
  const gameSet = new Set<string>()
  let wins = 0
  let losses = 0
  const gd15: number[] = []
  let lengthSum = 0
  let lengthCount = 0

  for (const p of roster) {
    for (const g of p.gameLog ?? []) {
      const id = g.gameId ?? `${g.date}|${p.team}|${g.opponent ?? ''}|${g.result}`
      if (gameSet.has(id)) continue
      gameSet.add(id)
      if (g.result === 1) wins++
      else losses++
      if (typeof g.gd15 === 'number') gd15.push(g.gd15)
      if (typeof g.gameLength === 'number' && g.gameLength > 0) {
        lengthSum += g.gameLength
        lengthCount++
      }
    }
  }

  const games = gameSet.size
  if (!games && !standingsRow) return null

  const seriesWins = standingsRow?.wins ?? wins
  const seriesLosses = standingsRow?.losses ?? losses
  const seriesGames = seriesWins + seriesLosses
  const kills = roster.reduce((s, p) => s + (p.kills ?? 0), 0)
  const deaths = roster.reduce((s, p) => s + (p.deaths ?? 0), 0)
  const assists = roster.reduce((s, p) => s + (p.assists ?? 0), 0)
  const league = roster[0]?.league ?? base?.league ?? standingsRow?.league ?? ''

  const merged: Team = {
    ...(base ?? {
      name: resolveTeamCanonicalName(teamName),
      league,
      towers: 0,
      dragons: 0,
      barons: 0,
      heralds: 0,
      dragonsPerGame: 0,
      baronsPerGame: 0,
      towersPerGame: 0,
    }),
    name: resolveTeamCanonicalName(base?.name ?? teamName),
    league: base?.league ?? league,
    games: games || seriesGames,
    wins: seriesWins,
    losses: seriesLosses,
    winrate: seriesGames ? (seriesWins / seriesGames) * 100 : games ? (wins / games) * 100 : 0,
    kills,
    deaths,
    assists,
    avgKda: (kills + assists) / Math.max(deaths, 1),
    avgGd15: gd15.length ? gd15.reduce((a, b) => a + b, 0) / gd15.length : base?.avgGd15,
    avgGameLength: lengthCount ? lengthSum / lengthCount : base?.avgGameLength,
  }

  return isDisplayableTeam(merged) ? merged : null
}

/** All participant teams in a tournament (from series + player logs, not global team list intersection). */
export function buildTournamentTeams(
  allTeams: Team[],
  players: Player[],
  data: DashboardData,
  tournament: TournamentIdentity,
): Team[] {
  const seriesList = buildTournamentSeriesList(data, tournament)
  const standings = buildTournamentSeriesStandings(data, tournament)
  const standingsByTeam = new Map(
    standings.map((s) => [resolveTeamCanonicalName(s.team).toLowerCase(), s]),
  )

  const teamNames = new Set<string>()
  for (const s of seriesList) {
    teamNames.add(resolveTeamCanonicalName(s.teamA))
    teamNames.add(resolveTeamCanonicalName(s.teamB))
  }
  for (const p of players) {
    teamNames.add(resolveTeamCanonicalName(p.team))
  }

  const out: Team[] = []
  for (const teamName of teamNames) {
    const row = standingsByTeam.get(teamName.toLowerCase())
    const roster = players.filter((p) => teamMatchesCanonical(p.team, teamName))
    const team = aggregateTeamFromRoster(teamName, allTeams, roster, row)
    if (team) out.push(team)
  }

  return out.sort((a, b) => b.winrate - a.winrate || b.wins - a.wins)
}

export function filterTeamsForTournament(
  teams: Team[],
  players: Player[],
  data?: DashboardData,
  tournament?: TournamentIdentity,
): Team[] {
  if (data && tournament) {
    return buildTournamentTeams(teams, players, data, tournament)
  }

  const standings = buildTournamentStandings(players)
  const byCanonical = new Map(standings.map((s) => [resolveTeamCanonicalName(s.team).toLowerCase(), s]))

  return teams
    .filter((t) => {
      if (!isDisplayableTeam(t)) return false
      const key = resolveTeamCanonicalName(t.name).toLowerCase()
      return byCanonical.has(key) || teamMatchesCanonical(t.name, key)
    })
    .map((t) => {
      const row =
        byCanonical.get(resolveTeamCanonicalName(t.name).toLowerCase()) ??
        standings.find((s) => teamMatchesCanonical(s.team, t.name))
      if (!row) return t
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
  gameCatalog?: Record<string, GameCatalogEntry>,
): Champion[] {
  const counts = new Map<string, { picks: number; wins: number; gd15: number[]; csd15: number[]; xpd15: number[] }>()
  const bans = new Map<string, number>()
  const seen = new Set<string>()
  const seenGames = new Set<string>()

  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      if (!g.champion) continue
      const pickKey = `${player.team}|${teamGameDedupeKey(g, player.team)}|${g.champion}`
      if (seen.has(pickKey)) continue
      seen.add(pickKey)

      const cur = counts.get(g.champion) ?? { picks: 0, wins: 0, gd15: [], csd15: [], xpd15: [] }
      cur.picks += 1
      if (g.result === 1) cur.wins += 1
      if (typeof g.gd15 === 'number') cur.gd15.push(g.gd15)
      if (typeof g.csd15 === 'number') cur.csd15.push(g.csd15)
      if (typeof g.xpd15 === 'number') cur.xpd15.push(g.xpd15)
      counts.set(g.champion, cur)

      if (g.gameId && !seenGames.has(g.gameId)) {
        seenGames.add(g.gameId)
        const entry = gameCatalog?.[g.gameId]
        if (entry?.teams) {
          for (const draft of Object.values(entry.teams)) {
            for (const ban of draft.bans ?? []) {
              if (ban) bans.set(ban, (bans.get(ban) ?? 0) + 1)
            }
          }
        }
      }
    }
  }

  const totalPickSlots = [...counts.values()].reduce((s, c) => s + c.picks, 0) || 1
  const totalBanSlots = [...bans.values()].reduce((s, n) => s + n, 0) || 1
  const globalByName = new Map(champions.map((c) => [c.name, c]))

  return [...counts.entries()]
    .map(([name, stats]) => {
      const global = globalByName.get(name)
      const pickRate = (stats.picks / totalPickSlots) * 100
      const banCount = bans.get(name) ?? 0
      const banRate = (banCount / totalBanSlots) * 100
      return {
        name,
        positions: global?.positions ?? [],
        primaryRole: global?.primaryRole,
        picks: stats.picks,
        games: stats.picks,
        bans: banCount,
        wins: stats.wins,
        winrate: stats.picks ? (stats.wins / stats.picks) * 100 : 0,
        pickRate,
        banRate,
        presence: pickRate + banRate,
        avgKda: global?.avgKda ?? 0,
        avgGd15: stats.gd15.length ? avg(stats.gd15) : global?.avgGd15,
        avgCsd15: stats.csd15.length ? avg(stats.csd15) : global?.avgCsd15,
        avgXpd15: stats.xpd15.length ? avg(stats.xpd15) : global?.avgXpd15,
      } satisfies Champion
    })
    .filter((c) => isDisplayableChampion(c) || c.picks > 0)
    .sort((a, b) => b.picks - a.picks)
}

export interface TournamentChampionRow {
  name: string
  positions: string[]
  picks: number
  bans: number
  winrate: number
  presence: number
  priority: number
  gd15: number | null
  csd15: number | null
  xpd15: number | null
}

export function buildTournamentChampionRows(
  champions: Champion[],
  roleFilter: RoleFilter = 'all',
): TournamentChampionRow[] {
  const filtered =
    roleFilter === 'all'
      ? champions
      : champions.filter((c) => roleForChampion(c) === roleFilter)

  const maxPicks = Math.max(...filtered.map((c) => c.picks), 1)

  return filtered.map((c) => {
    const pickRate = c.pickRate ?? (c.picks / maxPicks) * 100
    return {
      name: c.name,
      positions: c.positions ?? [],
      picks: c.picks,
      bans: c.bans ?? 0,
      winrate: c.winrate,
      presence: c.presence ?? pickRate + (c.banRate ?? 0),
      priority: pickRate,
      gd15: typeof c.avgGd15 === 'number' ? c.avgGd15 : null,
      csd15: typeof c.avgCsd15 === 'number' ? c.avgCsd15 : null,
      xpd15: typeof c.avgXpd15 === 'number' ? c.avgXpd15 : null,
    }
  })
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
  rankContext?: TournamentRankContext,
): TournamentStandingsRow[] {
  const seriesList = buildTournamentSeriesList(data, tournament)
  const records = new Map<string, { league: string; wins: number; losses: number }>()

  for (const series of seriesList) {
    for (const team of [series.teamA, series.teamB]) {
      const won = teamMatchesCanonical(series.winner, team)
      const key = resolveTeamCanonicalName(team)
      const cur = records.get(key) ?? { league: tournament.league, wins: 0, losses: 0 }
      if (won) cur.wins += 1
      else cur.losses += 1
      records.set(key, cur)
    }
  }

  const rows = [...records.entries()].map(([team, r]) => ({
    team,
    league: r.league,
    wins: r.wins,
    losses: r.losses,
    winrate: r.wins + r.losses ? (r.wins / (r.wins + r.losses)) * 100 : 0,
  }))

  return rankTournamentStandings(rows, seriesList, rankContext)
}

export function resolveTournamentFromGame(
  game: PlayerGameLog,
): Pick<TournamentIdentity, 'id' | 'displayName' | 'segment'> {
  return buildTournamentIdentityFromGame(game)
}
