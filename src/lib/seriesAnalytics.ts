import type {
  DashboardData,
  GameCatalogEntry,
  Player,
  PlayerGameLog,
  Team,
} from '../hooks/useDashboardData'
import type { TournamentIdentity } from './tournamentCatalog'
import { gameMatchesTournament } from './tournamentAnalytics'
import { teamMatchesCanonical, resolveTeamCanonicalName } from './entities/slugs'
import { isDisplayablePlayer } from './playerRadar'
import { isDisplayableTeam } from './teamAnalytics'
import { recapTeamTag } from './recapTeamTag'
import {
  collectParsedGames,
  stableSeriesId,
  type ParsedGame,
} from './weeklyRecap'
import {
  compareSeriesGames,
  countSeriesWins,
  groupGamesIntoSeries,
  isValidSeriesScore,
  orderSeriesGames,
} from './seriesGrouping'
import { formatPatch } from './format'
import { formatDurationMinSec } from './tournamentFormat'
import { combinedFilterForCatalogSeason } from './splitGroups'
import { parseCanonicalSplit } from './tournamentCatalog'

export interface TournamentSeriesRow {
  seriesId: string
  teamA: string
  teamB: string
  winner: string
  loser: string
  scoreLabel: string
  winsA: number
  winsB: number
  patch: string
  date: string
  gameCount: number
}

export interface EnrichedSeriesGame extends ParsedGame {
  gameNumber: number
  catalog: GameCatalogEntry | null
  durationLabel: string
  patch: string
}

export interface ResolvedSeries {
  seriesId: string
  teamA: string
  teamB: string
  games: EnrichedSeriesGame[]
  winsA: number
  winsB: number
  winner: string
  loser: string
  scoreLabel: string
  lastDate: string
  firstDate: string
  patch: string
  league: string
  split: string
  playoffs: boolean
  tournament: TournamentIdentity | null
}

export interface SeriesGameRosterPlayer {
  name: string
  team: string
  champion: string
  role: string
  kills: number | null
  deaths: number | null
  assists: number | null
  totalCs: number | null
  kda: number
  won: boolean
}

function dominantScore(teamA: string, teamB: string, winsA: number, winsB: number): string {
  const winner = winsA >= winsB ? teamA : teamB
  const loser = winner === teamA ? teamB : teamA
  const wWins = Math.max(winsA, winsB)
  const lWins = Math.min(winsA, winsB)
  return `${recapTeamTag(winner)} ${wWins}-${lWins} ${recapTeamTag(loser)}`
}

function patchForGame(gameId: string, catalog: Record<string, GameCatalogEntry>): string {
  return formatPatch(catalog[gameId]?.patch?.trim() ?? '', '')
}

function enrichBucket(
  teamA: string,
  teamB: string,
  games: ParsedGame[],
  sessionIndex: number,
  catalog: Record<string, GameCatalogEntry>,
): ResolvedSeries | null {
  const ordered = orderSeriesGames(games, teamA, teamB)
  const winsA = countSeriesWins(ordered, teamA)
  const winsB = countSeriesWins(ordered, teamB)
  if (!isValidSeriesScore(winsA, winsB)) return null

  const lastDate = ordered[ordered.length - 1]?.date ?? ''
  const seriesId = stableSeriesId(teamA, teamB, lastDate, sessionIndex)
  const winner = winsA >= winsB ? teamA : teamB
  const loser = winner === teamA ? teamB : teamA

  const enrichedGames: EnrichedSeriesGame[] = ordered.map((g, idx) => {
    const entry = catalog[g.id] ?? null
    const lenMin = entry?.gameLength ?? null
    return {
      ...g,
      gameNumber: idx + 1,
      catalog: entry,
      durationLabel: lenMin != null && lenMin > 0 ? formatDurationMinSec(lenMin) : '—',
      patch: patchForGame(g.id, catalog),
    }
  })
  const patch =
    [...enrichedGames].reverse().find((g) => g.patch)?.patch ??
    patchForGame(ordered[0]!.id, catalog) ??
    '—'

  const sample = ordered[0]
  return {
    seriesId,
    teamA,
    teamB,
    games: enrichedGames,
    winsA,
    winsB,
    winner,
    loser,
    scoreLabel: dominantScore(teamA, teamB, winsA, winsB),
    lastDate,
    firstDate: ordered[0]?.date ?? lastDate,
    patch: patch || '—',
    league: sample?.league ?? '',
    split: sample?.split ?? '',
    playoffs: Boolean(sample?.playoffs),
    tournament: null,
  }
}

function collectSeriesFromGames(
  games: ParsedGame[],
  catalog: Record<string, GameCatalogEntry>,
): ResolvedSeries[] {
  const buckets = groupGamesIntoSeries(games)
  const out: ResolvedSeries[] = []

  for (const bucket of buckets) {
    const series = enrichBucket(bucket.teamA, bucket.teamB, bucket.games, bucket.sessionIndex, catalog)
    if (series) out.push(series)
  }

  return out.sort((a, b) => {
    const byDate = b.lastDate.localeCompare(a.lastDate)
    if (byDate !== 0) return byDate
    return compareSeriesGames(
      { date: a.firstDate, id: a.seriesId },
      { date: b.firstDate, id: b.seriesId },
    )
  })
}

/** Map OE gameId → seriesId for entity match-history links. */
export function buildGameToSeriesMap(data: DashboardData): Map<string, string> {
  const players = data.players.filter(isDisplayablePlayer)
  const catalog = data.gameCatalog ?? {}
  const games = collectParsedGames(players, { gameCatalog: catalog })
  const map = new Map<string, string>()
  for (const series of collectSeriesFromGames(games, catalog)) {
    for (const game of series.games) {
      if (game.id) map.set(game.id, series.seriesId)
    }
  }
  return map
}

export function buildTournamentSeriesList(
  data: DashboardData,
  tournament: TournamentIdentity,
): TournamentSeriesRow[] {
  const players = data.players.filter(isDisplayablePlayer)
  const catalog = data.gameCatalog ?? {}
  const games = collectParsedGames(players, {
    gameFilter: (g) => gameMatchesTournament(g, tournament),
    gameCatalog: catalog,
  })

  return collectSeriesFromGames(games, catalog).map((s) => ({
    seriesId: s.seriesId,
    teamA: s.teamA,
    teamB: s.teamB,
    winner: s.winner,
    loser: s.loser,
    scoreLabel: s.scoreLabel,
    winsA: s.winsA,
    winsB: s.winsB,
    patch: s.patch,
    date: s.lastDate,
    gameCount: s.games.length,
  }))
}

export function parseSeriesId(seriesId: string): {
  teamA: string
  teamB: string
  date: string
  sessionIndex: number
} | null {
  const parts = seriesId.split('|')
  if (parts.length < 3) return null

  let sessionIndex = 0
  let dateIdx = parts.length - 1
  const last = parts[parts.length - 1] ?? ''
  const secondLast = parts[parts.length - 2] ?? ''

  if (/^\d+$/.test(last) && /^\d{4}-\d{2}-\d{2}$/.test(secondLast)) {
    sessionIndex = Number(last) || 0
    dateIdx = parts.length - 2
  }

  const date = parts[dateIdx] ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  const teamParts = parts.slice(0, dateIdx)
  if (teamParts.length < 2) return null

  const teamA = teamParts[0] ?? ''
  const teamB = teamParts[1] ?? ''
  if (!teamA || !teamB) return null

  return { teamA, teamB, date, sessionIndex }
}

function teamsMatchSeriesPair(a: string, b: string, x: string, y: string): boolean {
  const ca = resolveTeamCanonicalName(a)
  const cb = resolveTeamCanonicalName(b)
  const cx = resolveTeamCanonicalName(x)
  const cy = resolveTeamCanonicalName(y)
  return (ca === cx && cb === cy) || (ca === cy && cb === cx)
}

export function findSeriesById(data: DashboardData, seriesId: string): ResolvedSeries | null {
  const players = data.players.filter(isDisplayablePlayer)
  const catalog = data.gameCatalog ?? {}
  const games = collectParsedGames(players, { gameCatalog: catalog })
  const all = collectSeriesFromGames(games, catalog)

  const exact = all.find((s) => s.seriesId === seriesId)
  if (exact) return exact

  const parsed = parseSeriesId(seriesId)
  if (!parsed) return null

  const candidates = all.filter(
    (s) => s.lastDate === parsed.date && teamsMatchSeriesPair(parsed.teamA, parsed.teamB, s.teamA, s.teamB),
  )
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]!

  const sorted = [...candidates].sort((a, b) =>
    compareSeriesGames({ date: a.firstDate, id: a.seriesId }, { date: b.firstDate, id: b.seriesId }),
  )
  return sorted[parsed.sessionIndex] ?? sorted[0] ?? null
}

export function seriesGameIds(series: ResolvedSeries): Set<string> {
  return new Set(series.games.map((g) => g.id))
}

/** Combined split/tournament scope for radar cohorts (e.g. 2026 MSI → 2026 Spring incl. MSI). */
export function resolveSeriesCohortContext(series: ResolvedSeries): { year: string; split: string } {
  const { year, season } = parseCanonicalSplit(series.split)
  const y = year || series.firstDate.slice(0, 4) || '2026'
  const combined = combinedFilterForCatalogSeason(season || 'Spring')
  return { year: y, split: `${y} ${combined}` }
}

export function filterPlayersForSeries(players: Player[], series: ResolvedSeries): Player[] {
  const ids = seriesGameIds(series)
  const teams = new Set([series.teamA, series.teamB])

  return players
    .filter((p) => teams.has(p.team) || teamMatchesCanonical(p.team, series.teamA) || teamMatchesCanonical(p.team, series.teamB))
    .map((p) => {
      const gameLog = (p.gameLog ?? []).filter((g) => g.gameId && ids.has(g.gameId))
      if (!gameLog.length) return null
      const games = gameLog.length
      const kills = gameLog.reduce((s, g) => s + (g.kills ?? 0), 0)
      const deaths = gameLog.reduce((s, g) => s + (g.deaths ?? 0), 0)
      const assists = gameLog.reduce((s, g) => s + (g.assists ?? 0), 0)
      const kda = (kills + assists) / Math.max(deaths, 1)
      const avg = (key: keyof PlayerGameLog) => {
        const vals = gameLog.map((g) => g[key]).filter((v): v is number => typeof v === 'number')
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      }
      return {
        ...p,
        games,
        kills,
        deaths,
        assists,
        kda: Math.round(kda * 100) / 100,
        kp: Math.round(avg('kp') * 10) / 10,
        dmgShare: Math.round(avg('dmgShare') * 10) / 10,
        gd15: Math.round(avg('gd15')),
        csd15: Math.round(avg('csd15')),
        xpd15: Math.round(avg('xpd15')),
        dpm: Math.round(avg('dpm') * 10) / 10,
        gameLog,
      } as Player
    })
    .filter((p): p is Player => p !== null)
}

export function buildTeamsForSeries(
  allTeams: Team[],
  scopedPlayers: Player[],
  series: ResolvedSeries,
): Team[] {
  const names = [series.teamA, series.teamB]
  const out: Team[] = []

  for (const name of names) {
    const base = allTeams.find((t) => t.name === name || teamMatchesCanonical(t.name, name))
    const roster = scopedPlayers.filter((p) => p.team === name || teamMatchesCanonical(p.team, name))
    const gameSet = new Set<string>()
    let wins = 0
    let losses = 0
    const gd15: number[] = []
    let dragons = 0
    let barons = 0
    let towers = 0
    let lengthSum = 0
    let lengthCount = 0

    for (const p of roster) {
      for (const g of p.gameLog ?? []) {
        if (!g.gameId || !seriesGameIds(series).has(g.gameId)) continue
        if (gameSet.has(g.gameId)) continue
        gameSet.add(g.gameId)
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
    const kills = roster.reduce((s, p) => s + (p.kills ?? 0), 0)
    const deaths = roster.reduce((s, p) => s + (p.deaths ?? 0), 0)
    const assists = roster.reduce((s, p) => s + (p.assists ?? 0), 0)

    if (base) {
      out.push({
        ...base,
        games,
        wins,
        losses,
        winrate: games ? (wins / games) * 100 : 0,
        kills,
        deaths,
        assists,
        avgKda: (kills + assists) / Math.max(deaths, 1),
        avgGd15: gd15.length ? gd15.reduce((a, b) => a + b, 0) / gd15.length : base.avgGd15,
        avgGameLength: lengthCount ? lengthSum / lengthCount : base.avgGameLength,
        dragonsPerGame: games ? dragons / games : base.dragonsPerGame,
        baronsPerGame: games ? barons / games : base.baronsPerGame,
        towersPerGame: games ? towers / games : base.towersPerGame,
      })
      continue
    }

    out.push({
      name,
      league: series.league,
      games,
      wins,
      losses,
      winrate: games ? (wins / games) * 100 : 0,
      kills,
      deaths,
      assists,
      avgKda: (kills + assists) / Math.max(deaths, 1),
      avgGd15: gd15.length ? gd15.reduce((a, b) => a + b, 0) / gd15.length : 0,
      towers: 0,
      dragons: 0,
      barons: 0,
      heralds: 0,
      avgGameLength: lengthCount ? lengthSum / lengthCount : 0,
      dragonsPerGame: 0,
      baronsPerGame: 0,
      towersPerGame: 0,
    })
  }

  return out.filter(isDisplayableTeam)
}

export function buildGameRoster(
  players: Player[],
  game: EnrichedSeriesGame,
): SeriesGameRosterPlayer[] {
  const roster: SeriesGameRosterPlayer[] = []

  for (const p of players) {
    for (const g of p.gameLog ?? []) {
      const id = g.gameId ?? `${g.date}|${p.team}|${g.opponent ?? ''}|${g.result}`
      if (id !== game.id) continue
      roster.push({
        name: p.name,
        team: p.team,
        champion: g.champion,
        role: p.position,
        kills: g.kills ?? null,
        deaths: g.deaths ?? null,
        assists: g.assists ?? null,
        totalCs: g.totalCs ?? null,
        kda: g.kda,
        won: g.result === 1,
      })
    }
  }

  return roster.sort((a, b) => {
    const order = ['top', 'jng', 'mid', 'bot', 'sup', 'jungle', 'adc', 'support']
    const ia = order.findIndex((r) => a.role.toLowerCase().includes(r))
    const ib = order.findIndex((r) => b.role.toLowerCase().includes(r))
    if (ia !== ib) return ia - ib
    return a.team.localeCompare(b.team)
  })
}

export function formatKdaLine(k: number | null, d: number | null, a: number | null): string {
  if (k == null && d == null && a == null) return '—'
  return `${k ?? 0}/${d ?? 0}/${a ?? 0}`
}
