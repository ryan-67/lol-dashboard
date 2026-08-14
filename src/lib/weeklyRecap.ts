import type { GameCatalogEntry, Player, PlayerGameLog, Team } from '../hooks/useDashboardData'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
import { findTeamByName } from './teamAnalytics'
import { normalizePosition, computeGameScore, type RoleKey } from './playerRadar'
import { buildSeriesFacts, type PowerRankMap, type SeriesFacts } from './recapFacts'
import { findPocketPick } from './recapPocketPick'
import { recapTeamTag } from './recapTeamTag'
import {
  enrichPlayerWithAdvancedStats,
  findAdvancedOutliers,
  findGameAdvancedHighlights,
  formatAdvancedOutlierLine,
  dmgGoldRatioFromGame,
  dmgPerGoldFromGame,
} from './advancedStats'
import { parseDate as parseCalendarDate } from './weeklyWindow'
import { formatGameDate } from './format'
import {
  compareSeriesGames,
  groupGamesIntoSeries,
  isValidSeriesScore,
  seriesKey,
  type SeriesBucket as GroupedSeriesBucket,
} from './seriesGrouping'
import { analyzeSeriesMomentum } from './seriesMomentum'
import { resolveTournamentDisplay, buildTournamentIdentity } from './tournamentCatalog'
import { resolveGameOpponent } from './gameOpponent'
import {
  type CitoSeriesResult,
  isCitoRowCompletedForRecap,
  isInternationalContext,
  isSeriesReadyForRecap,
  nextOpponentInContext,
  recapHasFullSeriesEvidence,
  resolveSeriesScoreWithCito,
  liftStaleSweepIfOvermapped,
  teamHasUpcomingInTournament,
} from './citoSeriesVerify'
import { isBracketContextEvent, resolveTournamentFormat } from './tournamentFormat'
import {
  hasSufficientCitoBoxScores,
  rowsForMatch,
  rowsForTeamsDate,
  uniqueCitoGameCount,
  type CitoPlayerStatCacheRow,
  type CitoPlayerStatsBundle,
} from './citoPlayerStats'
import { unitIntervalTo100 } from './scoreNormalize'

export type { SeriesFacts }

function buildScheduleContextHint(
  winner: string,
  loser: string,
  date: string,
  tournamentLabel: string,
  cito: CitoSeriesResult[],
  bracketEvent: boolean,
): string | null {
  const nextW = nextOpponentInContext(winner, date, tournamentLabel, cito)
  const nextL = nextOpponentInContext(loser, date, tournamentLabel, cito)
  if (bracketEvent) {
    // Bracket next-opponent language is handled in buildTournamentImplicationHints.
    return null
  }
  const bits: string[] = []
  if (nextW) {
    bits.push(
      `schedule: ${recapTeamTag(winner)} next faces ${recapTeamTag(nextW.opponent)} (${nextW.date}) — regular season, not a bracket`,
    )
  }
  if (nextL) {
    bits.push(
      `schedule: ${recapTeamTag(loser)} looks to bounce back vs ${recapTeamTag(nextL.opponent)} (${nextL.date}) — regular season, not a bracket`,
    )
  }
  return bits.length ? bits.join(' | ') : null
}

/** Average model game score (0–100) per player ign across series gameIds. */
function buildSeriesModelScores(
  players: Player[],
  gameIds: string[],
): Map<string, number> {
  const out = new Map<string, number>()
  if (!players.length || !gameIds.length) return out
  const idSet = new Set(gameIds.filter(Boolean))
  const sums = new Map<string, { total: number; n: number }>()

  for (const p of players) {
    const role = normalizePosition(p.position)
    if (!role) continue
    const ign = p.name.toLowerCase()
    for (const g of p.gameLog ?? []) {
      if (!g.gameId || !idSet.has(g.gameId)) continue
      const score = unitIntervalTo100(computeGameScore(g, role, players))
      const cur = sums.get(ign) ?? { total: 0, n: 0 }
      cur.total += score
      cur.n += 1
      sums.set(ign, cur)
    }
  }
  for (const [ign, { total, n }] of sums) {
    if (n > 0) out.set(ign, total / n)
  }
  return out
}

function seriesResolveOpts(
  league: string | null | undefined,
  split?: string | null,
  playoffs?: boolean,
  tournamentLabel?: string | null,
) {
  const format = resolveTournamentFormat({ league, split, playoffs, tournamentLabel })
  const international = isInternationalContext({ league, split, tournamentLabel })
  return {
    international,
    defaultBestOf: format?.defaultBestOf ?? (international && format?.id !== 'EWC' ? 5 : null),
    formatId: format?.id ?? null,
    league: league ?? null,
    tournamentLabel: tournamentLabel ?? null,
  }
}

function intlTournamentLabel(
  league: string,
  year: string,
  split: string | null | undefined,
): string {
  const u = league.toUpperCase()
  if (u === 'WLDS' || u === 'WORLDS') return `${year} Worlds`
  if (u === 'FST' || u === 'FIRST STAND') return `${year} First Stand`
  if (u === 'EWC') return `${year} Esports World Cup`
  if (u === 'MSI') return `${year} MSI`
  return split ?? `${year} ${league}`
}

export interface WeeklyRecapWindow {
  start: Date
  end: Date
  label: string
}

export type WeeklyRecapSegment =
  | { kind: 'text'; value: string }
  | { kind: 'team'; canonicalName: string; label: string }

/** Re-apply official abbrev tags to cached team segments (fixes stale KR/TW labels in DB). */
export function normalizeRecapSegmentLabels(segments: WeeklyRecapSegment[]): WeeklyRecapSegment[] {
  return segments.map((seg) =>
    seg.kind === 'team' ? { ...seg, label: recapTeamTag(seg.canonicalName) } : seg,
  )
}

export interface WeeklyRecapLine {
  id: string
  /** Stable series identity URL slug (`teamA|teamB|date`). */
  seriesId?: string
  date: string
  dateLabel: string
  segments: WeeklyRecapSegment[]
  score: WeeklyRecapScore
}

export interface WeeklyRecapScore {
  winner: string
  loser: string
  winnerAbbr: string
  loserAbbr: string
  score: string
  tournamentLabel?: string
  /** League/event key for logo lookup (e.g. MSI, LCK). */
  tournamentLeague?: string
}

interface GamePlayer {
  team: string
  name: string
  champion: string
  role: RoleKey | null
  kda: number
  gd15: number
  xpd15: number
  csd15: number
  kp: number
  dmgShare: number
  goldShare: number
  kaPerMin: number
  dmgGoldRatio: number
  dmgPerGold: number
  won: boolean
}

export interface ParsedGame {
  id: string
  date: string
  winner: string
  loser: string
  players: GamePlayer[]
  league?: string
  split?: string
  playoffs?: boolean
  rawSplit?: string
  oeYear?: string
}

type SeriesBucket = GroupedSeriesBucket<ParsedGame>

interface LaneGapInfo {
  gapper: string
  gapped: string
  gapperTeam: string
  role: RoleKey
  gap: number
}

interface TeamGameRecord {
  id: string
  date: string
  opponent: string
  won: boolean
  league?: string
  split?: string
  oeYear?: string
}

/** Scope streaks to the same event (MSI/Worlds) or same regional split — never bleed LEC playoffs into MSI. */
function eventKeyForGame(g: {
  league?: string
  split?: string
  oeYear?: string
  date?: string
}): string {
  const year = g.oeYear ?? g.date?.slice(0, 4) ?? ''
  const league = (g.league ?? '').toUpperCase()
  if (['MSI', 'WLDS', 'WORLDS', 'FST', 'FIRST STAND'].includes(league)) {
    const name =
      league === 'WLDS' || league === 'WORLDS'
        ? 'WORLDS'
        : league === 'FST' || league === 'FIRST STAND'
          ? 'FST'
          : 'MSI'
    return `${year}|${name}`
  }
  return `${year}|${league}|${g.split ?? ''}`
}

interface HistoricalSeries {
  opponent: string
  wins: number
  losses: number
  lastDate: string
}

interface LaneDuelDomination {
  dominator: string
  victim: string
  role: RoleKey
  games: number
  avgGd15Lead: number
  wonLaneEveryGame: boolean
  wonDmgEveryGame: boolean
}

interface SeriesPlayerStats {
  name: string
  team: string
  role: RoleKey | null
  games: number
  wins: number
  avgKda: number
  avgDmg: number
  avgGd15: number
  avgKp: number
  champions: string[]
}

interface SeriesContext {
  kind: string
  priority: number
  segments: WeeklyRecapSegment[]
}

const ROLE_CHAT: Record<RoleKey, string> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'mid',
  adc: 'bot',
  support: 'support',
}

/** GD@15 advantage phrasing — jungle is not a lane. */
function roleAdvantageVerb(role: RoleKey): 'outlaned' | 'outjungled' {
  return role === 'jungle' ? 'outjungled' : 'outlaned'
}

const MAX_CONTEXT_CLAUSES = 3

class RecapLedger {
  private families = new Set<string>()

  claim(family: string): boolean {
    if (this.families.has(family)) return false
    this.families.add(family)
    return true
  }

  pick<T>(key: string, salt: number, options: T[]): T {
    if (!options.length) throw new Error('empty options')
    return options[(hashKey(key) + salt) % options.length]!
  }
}

function parseDate(value: string): Date | null {
  return parseCalendarDate(value)
}

function startOfDay(date: Date): Date {
  const out = new Date(date)
  out.setHours(0, 0, 0, 0)
  return out
}

export function formatRecapDate(iso: string): string {
  return formatGameDate(iso)
}

function inWindow(log: PlayerGameLog, window: WeeklyRecapWindow): boolean {
  const d = parseDate(log.date)
  if (!d) return false
  const day = startOfDay(d)
  return day >= window.start && day <= window.end
}

function playerLabel(name: string): string {
  return name.toLowerCase()
}

function champLabel(champ: string): string {
  return champ.toLowerCase()
}

function teamLeague(teams: Team[], name: string): string {
  const t = findTeamByName(teams, name)
  return (t?.league ?? 'LCK').toUpperCase()
}

function hashKey(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0
  }
  return h
}

function segText(value: string): WeeklyRecapSegment {
  return { kind: 'text', value }
}

function segTeam(name: string): WeeklyRecapSegment {
  const canonical = resolveTeamCanonicalName(name)
  return {
    kind: 'team',
    canonicalName: canonical,
    label: recapTeamTag(name),
  }
}

export function collectParsedGames(
  players: Player[],
  options?: {
    window?: WeeklyRecapWindow | null
    gameFilter?: (g: PlayerGameLog) => boolean
    gameCatalog?: Record<string, GameCatalogEntry>
  },
): ParsedGame[] {
  const seen = new Set<string>()
  const games: ParsedGame[] = []
  const window = options?.window ?? null
  const gameFilter = options?.gameFilter
  const gameCatalog = options?.gameCatalog

  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      if (window && !inWindow(g, window)) continue
      if (gameFilter && !gameFilter(g)) continue
      const id = g.gameId ?? `${g.date}|${player.team}|${g.opponent ?? ''}|${g.result}`
      if (seen.has(id)) continue
      seen.add(id)

      const opponent = resolveGameOpponent(g, player.team, players, gameCatalog)
      if (!opponent) continue
      const won = g.result === 1
      const winner = won ? player.team : opponent
      const loser = won ? opponent : player.team

      const roster: GamePlayer[] = []
      for (const p of players) {
        for (const pg of p.gameLog ?? []) {
          const pgId = pg.gameId ?? `${pg.date}|${p.team}|${pg.opponent ?? ''}|${pg.result}`
          if (pgId !== id) continue
          roster.push({
            team: p.team,
            name: p.name,
            champion: pg.champion,
            role: normalizePosition(p.position),
            kda: pg.kda,
            gd15: pg.gd15 ?? 0,
            xpd15: pg.xpd15 ?? 0,
            csd15: pg.csd15 ?? 0,
            kp: pg.kp ?? 0,
            dmgShare: pg.dmgShare ?? 0,
            goldShare: pg.goldShare ?? 0,
            kaPerMin: pg.kaPerMin ?? 0,
            dmgGoldRatio: dmgGoldRatioFromGame(pg) ?? 0,
            dmgPerGold: dmgPerGoldFromGame(pg),
            won: pg.result === 1,
          })
        }
      }

      games.push({
        id,
        date: g.date,
        winner,
        loser,
        players: roster,
        league: g.league,
        split: g.split,
        playoffs: g.playoffs,
        rawSplit: g.rawSplit,
        oeYear: g.oeYear,
      })
    }
  }

  return games.sort(compareSeriesGames)
}

function collectWeeklyGames(
  players: Player[],
  window: WeeklyRecapWindow,
  gameCatalog?: Record<string, GameCatalogEntry>,
): ParsedGame[] {
  return collectParsedGames(players, { window, gameCatalog })
}

function collectTeamGames(
  players: Player[],
  team: string,
  gameCatalog?: Record<string, GameCatalogEntry>,
): TeamGameRecord[] {
  const seen = new Set<string>()
  const games: TeamGameRecord[] = []

  for (const player of players) {
    if (!teamMatchesCanonical(player.team, team)) continue
    for (const g of player.gameLog ?? []) {
      const id = g.gameId ?? `${g.date}|${player.team}|${g.opponent ?? ''}|${g.result}`
      if (seen.has(id)) continue
      seen.add(id)
      const opponent = resolveGameOpponent(g, player.team, players, gameCatalog)
      if (!opponent) continue
      games.push({
        id,
        date: g.date,
        opponent,
        won: g.result === 1,
        league: g.league,
        split: g.split,
        oeYear: g.oeYear,
      })
    }
  }

  return games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

function groupTeamSeriesHistory(
  games: TeamGameRecord[],
  team: string,
  eventKey?: string,
): HistoricalSeries[] {
  const scoped = eventKey
    ? games.filter((g) => eventKeyForGame(g) === eventKey)
    : games
  if (!scoped.length) return []

  const chrono = scoped.map((g) => ({
    id: g.id,
    date: g.date,
    winner: g.won ? team : g.opponent,
    loser: g.won ? g.opponent : team,
  }))

  return groupGamesIntoSeries(chrono)
    .map((bucket) => {
      const opponent = bucket.teamA === team ? bucket.teamB : bucket.teamA
      const wins = bucket.games.filter((g) => g.winner === team).length
      return {
        opponent,
        wins,
        losses: bucket.games.length - wins,
        lastDate: bucket.games[bucket.games.length - 1]!.date,
      }
    })
    .filter((s) => isValidSeriesScore(s.wins, s.losses))
}

function countSeriesWinStreak(
  history: HistoricalSeries[],
  beforeDate: string,
  excludeOpponent?: string,
): number {
  const prior = history.filter(
    (s) => s.lastDate < beforeDate && (!excludeOpponent || s.opponent !== excludeOpponent),
  )
  let streak = 0
  for (let i = prior.length - 1; i >= 0; i--) {
    const s = prior[i]!
    if (s.wins > s.losses) streak++
    else break
  }
  return streak
}

function countSeriesLossStreak(history: HistoricalSeries[], beforeDate: string): number {
  const prior = history.filter((s) => s.lastDate < beforeDate)
  let streak = 0
  for (let i = prior.length - 1; i >= 0; i--) {
    const s = prior[i]!
    if (s.losses > s.wins) streak++
    else break
  }
  return streak
}

function findStarPlayer(players: Player[], team: string): Player | null {
  return (
    players
      .filter((p) => p.team === team && p.games >= 8)
      .sort((a, b) => b.games * b.kda - a.games * a.kda)[0] ?? null
  )
}

function groupSeries(games: ParsedGame[]): SeriesBucket[] {
  return groupGamesIntoSeries(games)
}

function splitWinrate(teams: Team[], name: string): number {
  return findTeamByName(teams, name)?.winrate ?? 50
}

function buildWeekChampionCounts(games: ParsedGame[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const g of games) {
    for (const p of g.players) {
      if (!p.champion) continue
      counts.set(p.champion, (counts.get(p.champion) ?? 0) + 1)
    }
  }
  return counts
}

/** Lightweight champion meta from the recap game window (presence, primary role, dates). */
function buildChampionMetaFromGames(games: ParsedGame[]): import('../hooks/useDashboardData').Champion[] {
  const totalGames = Math.max(games.length, 1)
  type Acc = {
    name: string
    picks: number
    roleCounts: Map<string, number>
    gameDates: Set<string>
  }
  const byChamp = new Map<string, Acc>()

  for (const g of games) {
    const seenInGame = new Set<string>()
    for (const p of g.players) {
      if (!p.champion) continue
      const key = p.champion
      const acc = byChamp.get(key) ?? {
        name: p.champion,
        picks: 0,
        roleCounts: new Map<string, number>(),
        gameDates: new Set<string>(),
      }
      if (!seenInGame.has(key)) {
        acc.picks++
        seenInGame.add(key)
        acc.gameDates.add(g.date)
      }
      if (p.role) {
        acc.roleCounts.set(p.role, (acc.roleCounts.get(p.role) ?? 0) + 1)
      }
      byChamp.set(key, acc)
    }
  }

  return [...byChamp.values()].map((acc) => {
    let primaryRole = ''
    let best = -1
    for (const [role, n] of acc.roleCounts) {
      if (n > best) {
        best = n
        primaryRole = role
      }
    }
    const presence = (acc.picks / totalGames) * 100
    return {
      name: acc.name,
      positions: primaryRole ? [primaryRole] : [],
      picks: acc.picks,
      bans: 0,
      presence,
      pickRate: presence,
      winrate: 0,
      avgKda: 0,
      primaryRole: primaryRole || undefined,
      gameDates: [...acc.gameDates].sort(),
    }
  })
}

function buildPlayerChampGameIndex(players: Player[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const p of players) {
    const byChamp = new Map<string, number>()
    for (const c of p.championPool ?? []) {
      byChamp.set(c.champion.toLowerCase(), c.games)
    }
    for (const g of p.gameLog ?? []) {
      if (!g.champion) continue
      const key = g.champion.toLowerCase()
      if (!byChamp.has(key)) {
        byChamp.set(
          key,
          (p.gameLog ?? []).filter((x) => x.champion.toLowerCase() === key).length,
        )
      }
    }
    out.set(p.name.toLowerCase(), byChamp)
  }
  return out
}

function aggregateSeriesPlayerStats(bucket: SeriesBucket): SeriesPlayerStats[] {
  const map = new Map<string, SeriesPlayerStats>()

  for (const g of bucket.games) {
    for (const p of g.players) {
      const key = `${p.team}|${p.name}`
      const cur = map.get(key) ?? {
        name: p.name,
        team: p.team,
        role: p.role,
        games: 0,
        wins: 0,
        avgKda: 0,
        avgDmg: 0,
        avgGd15: 0,
        avgKp: 0,
        champions: [],
      }
      cur.games++
      if (p.won) cur.wins++
      cur.avgKda += p.kda
      cur.avgDmg += p.dmgShare
      cur.avgGd15 += p.gd15
      cur.avgKp += p.kp
      if (p.champion && !cur.champions.includes(p.champion)) cur.champions.push(p.champion)
      map.set(key, cur)
    }
  }

  return [...map.values()].map((s) => ({
    ...s,
    avgKda: s.avgKda / s.games,
    avgDmg: s.avgDmg / s.games,
    avgGd15: s.avgGd15 / s.games,
    avgKp: s.avgKp / s.games,
  }))
}

function findLaneDuelDomination(series: SeriesBucket): LaneDuelDomination | null {
  let best: LaneDuelDomination | null = null

  for (const role of ['top', 'jungle', 'mid', 'adc', 'support'] as RoleKey[]) {
    const perGame: { a: GamePlayer; b: GamePlayer }[] = []

    for (const g of series.games) {
      const lane = g.players.filter((p) => p.role === role)
      if (lane.length < 2) continue
      const teams = [...new Set(lane.map((p) => p.team))]
      if (teams.length < 2) continue
      const p1 = lane.find((p) => p.team === teams[0])
      const p2 = lane.find((p) => p.team === teams[1])
      if (!p1 || !p2 || p1.name === p2.name) continue
      perGame.push({ a: p1, b: p2 })
    }

    if (perGame.length < 2) continue

    const namesA = new Set(perGame.map((x) => x.a.name))
    const namesB = new Set(perGame.map((x) => x.b.name))
    if (namesA.size !== 1 || namesB.size !== 1) continue

    const sample = perGame[0]!
    let aLaneWins = 0
    let aDmgWins = 0
    let gdLead = 0

    for (const { a, b } of perGame) {
      if (a.gd15 > b.gd15) aLaneWins++
      if (a.dmgShare > b.dmgShare) aDmgWins++
      gdLead += a.gd15 - b.gd15
    }

    const bLaneWins = perGame.length - aLaneWins
    const bDmgWins = perGame.length - aDmgWins

    const candidates: LaneDuelDomination[] = []
    if (aLaneWins === perGame.length || aDmgWins === perGame.length) {
      candidates.push({
        dominator: sample.a.name,
        victim: sample.b.name,
        role,
        games: perGame.length,
        avgGd15Lead: gdLead / perGame.length,
        wonLaneEveryGame: aLaneWins === perGame.length,
        wonDmgEveryGame: aDmgWins === perGame.length,
      })
    }
    if (bLaneWins === perGame.length || bDmgWins === perGame.length) {
      candidates.push({
        dominator: sample.b.name,
        victim: sample.a.name,
        role,
        games: perGame.length,
        avgGd15Lead: -gdLead / perGame.length,
        wonLaneEveryGame: bLaneWins === perGame.length,
        wonDmgEveryGame: bDmgWins === perGame.length,
      })
    }

    for (const c of candidates) {
      const score =
        (c.wonLaneEveryGame ? 40 : 0) +
        (c.wonDmgEveryGame ? 35 : 0) +
        c.games * 10 +
        Math.abs(c.avgGd15Lead) / 20
      const bestScore = best
        ? (best.wonLaneEveryGame ? 40 : 0) +
          (best.wonDmgEveryGame ? 35 : 0) +
          best.games * 10 +
          Math.abs(best.avgGd15Lead) / 20
        : 0
      if (!best || score > bestScore) best = c
    }
  }

  return best
}

function findBestLaneGap(series: SeriesBucket): LaneGapInfo | null {
  let best: LaneGapInfo | null = null
  for (const g of series.games) {
    for (const role of ['top', 'jungle', 'mid', 'adc', 'support'] as RoleKey[]) {
      const lanePlayers = g.players.filter((p) => p.role === role)
      if (lanePlayers.length < 2) continue
      const byTeam = new Map<string, GamePlayer[]>()
      for (const p of lanePlayers) {
        const list = byTeam.get(p.team) ?? []
        list.push(p)
        byTeam.set(p.team, list)
      }
      const teamNames = [...byTeam.keys()]
      if (teamNames.length < 2) continue
      const [t1, t2] = teamNames
      const p1 = byTeam.get(t1)?.[0]
      const p2 = byTeam.get(t2)?.[0]
      if (!p1 || !p2) continue
      const gap = Math.abs(p1.gd15 - p2.gd15)
      if (gap < 75) continue
      const gapper = p1.gd15 > p2.gd15 ? p1 : p2
      const gapped = p1.gd15 > p2.gd15 ? p2 : p1
      if (!best || gap > best.gap) {
        best = {
          gapper: gapper.name,
          gapped: gapped.name,
          gapperTeam: gapper.team,
          role,
          gap,
        }
      }
    }
  }
  return best
}

function avgTeamGd15(series: SeriesBucket, team: string): number {
  const vals = series.games.flatMap((g) =>
    g.players.filter((p) => p.team === team).map((p) => p.gd15),
  )
  if (!vals.length) return 0
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function buildFormPrefix(
  dominant: string,
  victim: string,
  domWins: number,
  vicWins: number,
  flags: {
    reverseSweep: boolean
    droppedGame1: boolean
    leadBlownBy: string | null
    blowout: boolean
    upset: boolean
    domSplitWr: number
    vicSplitWr: number
    seriesStreak: number
    victimSlump: number
  },
  players: Player[],
  region: string,
  ledger: RecapLedger,
  id: string,
  salt: number,
): WeeklyRecapSegment[] | null {
  const { reverseSweep, droppedGame1, leadBlownBy, blowout, domSplitWr, vicSplitWr, seriesStreak, victimSlump } =
    flags
  const star = findStarPlayer(players, dominant)

  if ((reverseSweep || leadBlownBy || droppedGame1) && vicSplitWr >= domSplitWr + 5) {
    return [
      segTeam(victim),
      segText(
        ledger.pick(`${id}-stinker`, salt, [
          ` with an absolute stinker, getting reverse swept by `,
          ` in freefall — reverse swept by `,
          ` blew a game-1 lead and got reverse swept by `,
        ]),
      ),
    ]
  }

  if (seriesStreak >= 3 && blowout) {
    return [
      segTeam(dominant),
      segText(
        ledger.pick(`${id}-peak`, salt, [
          ` are peaking, stomping `,
          ` stay hot, taking down `,
          ` extend their hot streak, dismantling `,
        ]),
      ),
    ]
  }

  if (seriesStreak >= 3) {
    const ord =
      seriesStreak === 3 ? '3rd' : seriesStreak === 4 ? '4th' : `${seriesStreak}th`
    return [
      segTeam(dominant),
      segText(` riding a wave — their ${ord} straight series win, taking `),
    ]
  }

  if (domSplitWr >= 72 && star && domWins >= vicWins) {
    return [
      segText(
        ledger.pick(`${id}-goat`, salt, [
          `${playerLabel(star.name)} reminds everyone why `,
          `${playerLabel(star.name)} shows once again that `,
          `${playerLabel(star.name)} keeps proving `,
        ]),
      ),
      segTeam(dominant),
      segText(
        ledger.pick(`${id}-goat2`, salt, [
          ` run ${region} as they beat `,
          ` are the team to beat in ${region}, beating `,
          ` own ${region} right now — `,
        ]),
      ),
    ]
  }

  if (victimSlump >= 2 && !reverseSweep && !droppedGame1) {
    return [
      segTeam(victim),
      segText(
        ledger.pick(`${id}-slump`, salt, [
          ` can't catch a break, dropping another to `,
          ` stay ice cold against `,
          ` continue to struggle vs `,
        ]),
      ),
    ]
  }

  if (upsetFromWr(domSplitWr, vicSplitWr) && domSplitWr < 45) {
    return [
      segTeam(dominant),
      segText(` spring the upset, knocking off `),
    ]
  }

  return null
}

function upsetFromWr(dom: number, vic: number): boolean {
  return dom + 8 < vic
}

function buildResultSegments(
  dominant: string,
  victim: string,
  domWins: number,
  vicWins: number,
  region: string,
  flags: {
    reverseSweep: boolean
    droppedGame1: boolean
    blowout: boolean
    upset: boolean
    domSplitWr: number
    vicSplitWr: number
    hasPrefix: boolean
    victimSlump: number
  },
  ledger: RecapLedger,
  id: string,
  salt: number,
): WeeklyRecapSegment[] {
  const { reverseSweep, droppedGame1, blowout, upset, domSplitWr, vicSplitWr, hasPrefix } = flags

  // Prefix already named the teams — only append the score (never a second team token).
  // Fixes "DCG stay ice cold against DCG 3-0" and "taking G2 3-2".
  if (hasPrefix) {
    return [segText(` ${domWins}-${vicWins}`)]
  }

  if (reverseSweep && domWins >= 2) {
    const templates = [
      () => [
        segTeam(dominant),
        segText(` rallied for the reverse sweep against `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins} (${region})`),
      ],
      () => [
        segTeam(dominant),
        segText(` came back from 0-2 to beat `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins}`),
      ],
    ]
    return ledger.pick(`${id}-rev`, salt, templates)()
  }

  if (droppedGame1 && domWins >= 2) {
    const templates = [
      () => [
        segTeam(dominant),
        segText(` dropped game 1 then closed `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins}`),
      ],
      () => [
        segTeam(dominant),
        segText(` rallied after a slow start to beat `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins} (${region})`),
      ],
    ]
    return ledger.pick(`${id}-g1`, salt, templates)()
  }

  if (blowout && domWins >= 3) {
    const templates = [
      () => [
        segTeam(dominant),
        segText(` ran through `),
        segTeam(victim),
        segText(` ${domWins}-0 this week`),
      ],
      () => [
        segTeam(dominant),
        segText(` took a clean ${domWins}-0 vs `),
        segTeam(victim),
        segText(` (${region})`),
      ],
    ]
    return ledger.pick(`${id}-blowout`, salt + 1, templates)()
  }

  if (blowout) {
    return [
      segTeam(dominant),
      segText(` swept `),
      segTeam(victim),
      segText(` ${domWins}-0 (${region})`),
    ]
  }

  if (upset) {
    return [
      segTeam(dominant),
      segText(` (${domSplitWr.toFixed(0)}% split wr) knocked off `),
      segTeam(victim),
      segText(` (${vicSplitWr.toFixed(0)}%) ${domWins}-${vicWins}`),
    ]
  }

  const templates = [
    () => [
      segTeam(dominant),
      segText(` beat `),
      segTeam(victim),
      segText(` ${domWins}-${vicWins} (${region})`),
    ],
    () => [
      segTeam(dominant),
      segText(` took the series ${domWins}-${vicWins} from `),
      segTeam(victim),
    ],
    () => [
      segTeam(dominant),
      segText(` vs `),
      segTeam(victim),
      segText(`: ${domWins}-${vicWins} on the week`),
    ],
  ]
  return ledger.pick(`${id}-close`, salt + 3, templates)()
}

function seriesGameIds(bucket: SeriesBucket): Set<string> {
  const ids = new Set<string>()
  for (const g of bucket.games) ids.add(g.id)
  return ids
}

function playerSeriesLogs(player: Player, gameIds: Set<string>): PlayerGameLog[] {
  return (player.gameLog ?? []).filter((g) => {
    const id = g.gameId ?? `${g.date}|${player.team}|${g.opponent ?? ''}|${g.result}`
    return gameIds.has(id)
  })
}

function buildSeriesAdvancedInsights(
  bucket: SeriesBucket,
  players: Player[],
  ledger: RecapLedger,
  id: string,
  salt: number,
): SeriesContext[] {
  const insights: SeriesContext[] = []
  const gameIds = seriesGameIds(bucket)
  const namesInSeries = new Set(bucket.games.flatMap((g) => g.players.map((p) => p.name)))

  for (const player of players) {
    if (!namesInSeries.has(player.name)) continue
    const role = normalizePosition(player.position)
    if (!role) continue

    const seriesLogs = playerSeriesLogs(player, gameIds)
    if (!seriesLogs.length) continue

    const leagueCohort = players
      .filter((p) => normalizePosition(p.position) === role && p.league === player.league)
      .map((p) => enrichPlayerWithAdvancedStats(p))

    const snapshot: Player = {
      ...enrichPlayerWithAdvancedStats(player),
      gameLog: seriesLogs,
      games: seriesLogs.length,
    }

    const outliers = findAdvancedOutliers(snapshot, role, leagueCohort, seriesLogs)
    for (const o of outliers.slice(0, 1)) {
      const line = formatAdvancedOutlierLine(o)
      insights.push({
        kind: `advanced_${o.metric}_${o.direction}`,
        priority: 80 + Math.abs(o.zScore) * 5,
        segments: [
          segText(` — ${line.charAt(0).toLowerCase() + line.slice(1)}`),
        ],
      })
    }

    for (const g of seriesLogs) {
      if (role === 'jungle' && (g.campsStolen ?? 0) >= 1) {
        insights.push({
          kind: 'camps_stolen_game',
          priority: 90 + (g.campsStolen ?? 0) * 5,
          segments: [
            segText(
              ledger.pick(`${id}-camps-${player.name}`, salt, [
                ` — ${playerLabel(player.name)} stole ${g.campsStolen} enemy camp${(g.campsStolen ?? 0) > 1 ? 's' : ''}`,
                ` — ${playerLabel(player.name)} was deep in enemy jungle (${g.campsStolen} camps stolen)`,
              ]),
            ),
          ],
        })
      }

      const cohortGames = leagueCohort.flatMap((p) => p.gameLog ?? [])
      const spikes = findGameAdvancedHighlights(g, role, cohortGames)
      if (spikes.length) {
        insights.push({
          kind: 'advanced_game_spike',
          priority: 76,
          segments: [
            segText(` — ${playerLabel(player.name)} ${spikes[0]}`),
          ],
        })
      }
    }
  }

  return insights
}

function buildContextInsights(
  bucket: SeriesBucket,
  dominant: string,
  victim: string,
  gap: LaneGapInfo | null,
  laneDuel: LaneDuelDomination | null,
  playerStats: SeriesPlayerStats[],
  _weekCounts: Map<string, number>,
  flags: {
    reverseSweep: boolean
    blowout: boolean
    domSplitWr: number
    vicSplitWr: number
  },
  players: Player[],
  ledger: RecapLedger,
  id: string,
  salt: number,
  championMeta: import('../hooks/useDashboardData').Champion[] = [],
  asOfDate = '',
): SeriesContext[] {
  const insights: SeriesContext[] = []
  const role = gap ? ROLE_CHAT[gap.role] : 'mid'
  const gapper = gap?.gapper ?? ''
  const gapped = gap?.gapped ?? ''
  const gapOnWinner = gap ? gap.gapperTeam === dominant : false
  const avgGd = avgTeamGd15(bucket, dominant)
  const winPlayers = playerStats.filter((p) => p.team === dominant && p.wins > 0)
  const losePlayers = playerStats.filter((p) => p.team === victim)

  if (laneDuel && (laneDuel.wonLaneEveryGame || laneDuel.wonDmgEveryGame)) {
    const r = ROLE_CHAT[laneDuel.role]
    const adv = roleAdvantageVerb(laneDuel.role)
    const dom = playerLabel(laneDuel.dominator)
    const vic = playerLabel(laneDuel.victim)
    const onWinnerSide = playerStats.some(
      (p) => p.name === laneDuel.dominator && p.team === dominant,
    )

    if (laneDuel.wonLaneEveryGame && laneDuel.wonDmgEveryGame) {
      insights.push({
        kind: 'lane_sweep',
        priority: 95,
        segments: [
          segText(
            ledger.pick(`${id}-ls`, salt, [
              ` — ${dom} ${adv} and outdamaged ${vic} in every game`,
              ` — ${dom} styled on ${vic} in ${r} all series (${laneDuel.games} games)`,
              ` with ${dom} winning ${r} and damage vs ${vic} every single game`,
            ]),
          ),
        ],
      })
    } else if (laneDuel.wonLaneEveryGame) {
      const lanePhrase =
        laneDuel.role === 'jungle'
          ? ` — ${dom} ${adv} ${vic} every game`
          : ` — ${dom} ${adv} ${vic} in ${r} every game`
      insights.push({
        kind: 'lane_sweep',
        priority: 88,
        segments: [
          segText(lanePhrase + (onWinnerSide ? '' : ` (still lost the series)`)),
        ],
      })
    } else if (laneDuel.wonDmgEveryGame) {
      insights.push({
        kind: 'dmg_sweep',
        priority: 82,
        segments: [
          segText(` — ${dom} had more damage than ${vic} in every game`),
        ],
      })
    }
  }

  const carries = winPlayers
    .filter((p) => p.wins >= 2 && p.avgDmg >= 30 && p.avgKda >= 3.5)
    .sort((a, b) => b.avgDmg * b.avgKda - a.avgDmg * a.avgKda)

  if (carries.length >= 1) {
    const c = carries[0]!
    const winGames = bucket.games.filter((g) => g.winner === dominant).length
    insights.push({
      kind: 'dmg_carry',
      priority: 85 + c.avgDmg,
      segments: [
        segText(
          ledger.pick(`${id}-dc`, salt, [
            ` — ${playerLabel(c.name)} 1v9'd in the wins (${c.avgDmg.toFixed(0)}% dmg avg)`,
            ` — ${playerLabel(c.name)} was unkillable when it mattered (${c.avgDmg.toFixed(0)}% dmg across ${c.wins}W)`,
            ` with ${playerLabel(c.name)} popping off (${c.avgKda.toFixed(1)} kda, ${c.avgDmg.toFixed(0)}% dmg in ${winGames} wins)`,
          ]),
        ),
      ],
    })
  }

  // Pocket picks: bottom-5% presence (not a recent riser) or off-role surprise only.
  const playerChampGames = buildPlayerChampGameIndex(players)
  const pocketHit = findPocketPick(
    winPlayers.map((p) => ({
      name: p.name,
      champions: p.champions,
      role: p.role,
      avgKda: p.avgKda,
    })),
    championMeta,
    asOfDate || bucket.games[bucket.games.length - 1]?.date || '',
    playerChampGames,
  )

  if (pocketHit) {
    const r = pocketHit.role ? ROLE_CHAT[pocketHit.role] : ''
    const offRoleNote = pocketHit.reason === 'off_role' ? ' off-role' : ''
    insights.push({
      kind: 'pocket_pick',
      priority: 78,
      segments: [
        segText(
          ledger.pick(`${id}-pp`, salt, [
            ` — ${playerLabel(pocketHit.name)} pulled out the rare${offRoleNote} ${champLabel(pocketHit.champion)}${r ? ` ${r}` : ''}`,
            `, ${playerLabel(pocketHit.name)} whipped out unexpected ${champLabel(pocketHit.champion)}${r ? ` ${r}` : ''} and it worked`,
            ` with ${playerLabel(pocketHit.name)}'s rare ${champLabel(pocketHit.champion)} pocket pick paying off`,
          ]),
        ),
      ],
    })
  }

  if (flags.reverseSweep && flags.vicSplitWr >= flags.domSplitWr) {
    const tried = losePlayers
      .filter((p) => p.avgKda >= 3.2 || p.avgDmg >= 28)
      .sort((a, b) => b.avgKda * 0.5 + b.avgDmg * 0.5 - (a.avgKda * 0.5 + a.avgDmg * 0.5))[0]
    const horrors = losePlayers
      .filter((p) => p.avgKda < 2.2)
      .sort((a, b) => a.avgKda - b.avgKda)
      .slice(0, 2)

    if (tried && horrors.length >= 2) {
      insights.push({
        kind: 'reverse_horror',
        priority: 92,
        segments: [
          segText(
            ` — ${playerLabel(tried.name)} tried his best but ${playerLabel(horrors[0]!.name)} and ${playerLabel(horrors[1]!.name)} had a horror series`,
          ),
        ],
      })
    } else if (horrors.length >= 2) {
      insights.push({
        kind: 'horror_series',
        priority: 86,
        segments: [
          segText(
            ` — ${playerLabel(horrors[0]!.name)} and ${playerLabel(horrors[1]!.name)} had a nightmare series`,
          ),
        ],
      })
    } else if (tried) {
      insights.push({
        kind: 'loser_effort',
        priority: 75,
        segments: [
          segText(
            ` — ${playerLabel(tried.name)} tried to 1v9 (${tried.avgKda.toFixed(1)} kda) but got no help`,
          ),
        ],
      })
    }
  }

  if (gap && gap.gap >= 75 && !laneDuel?.wonLaneEveryGame) {
    if (!gapOnWinner) {
      insights.push({
        kind: 'lane_comeback',
        priority: 72 + gap.gap / 100,
        segments: [
          segText(
            ` — ${playerLabel(gapper)} won ${role} vs ${playerLabel(gapped)} but the team still closed it`,
          ),
        ],
      })
    } else {
      insights.push({
        kind: 'lane_dom',
        priority: 68 + gap.gap / 100,
        segments: [
          segText(
            ` — ${playerLabel(gapper)} owned ${playerLabel(gapped)} in the ${role} matchup`,
          ),
        ],
      })
    }
  }

  if (avgGd >= 400 && bucket.games.length >= 2 && flags.blowout) {
    insights.push({
      kind: 'early_lead',
      priority: 62,
      segments: [
        segText(` — up +${avgGd.toFixed(0)} gd@15 on average, never close`),
      ],
    })
  }

  const jg = winPlayers
    .filter((p) => p.role === 'jungle' && p.avgKp >= 72)
    .sort((a, b) => b.avgKp - a.avgKp)[0]

  if (jg) {
    insights.push({
      kind: 'jungle_kp',
      priority: 58,
      segments: [
        segText(` — ${playerLabel(jg.name)} had the map on a leash (${jg.avgKp.toFixed(0)}% kp)`),
      ],
    })
  }

  const feeder = losePlayers
    .filter((p) => p.avgKda < 1.5 && p.avgKda > 0)
    .sort((a, b) => a.avgKda - b.avgKda)[0]

  if (feeder && !flags.reverseSweep) {
    insights.push({
      kind: 'feed',
      priority: 48,
      segments: [
        segText(
          ` — ${playerLabel(feeder.name)} had a rough series on ${champLabel(feeder.champions[0] ?? 'their pick')} (${feeder.avgKda.toFixed(1)} kda avg)`,
        ),
      ],
    })
  }

  const pop = winPlayers
    .filter((p) => p.avgKda >= 4.5 && p.avgDmg < 30)
    .sort((a, b) => b.avgKda - a.avgKda)[0]

  if (pop && (!carries.length || pop.name !== carries[0]!.name)) {
    insights.push({
      kind: 'popoff',
      priority: 56,
      segments: [
        segText(` — ${playerLabel(pop.name)} went off (${pop.avgKda.toFixed(1)} kda avg)`),
      ],
    })
  }

  if (flags.domSplitWr >= 65 && flags.blowout) {
    insights.push({
      kind: 'split_form',
      priority: 52,
      segments: [
        segText(` — ${flags.domSplitWr.toFixed(0)}% on the split, looking like title contenders`),
      ],
    })
  }

  insights.push(...buildSeriesAdvancedInsights(bucket, players, ledger, id, salt))

  return insights.sort((a, b) => b.priority - a.priority)
}

function summarizeSeries(
  bucket: SeriesBucket,
  teams: Team[],
  players: Player[],
  weekCounts: Map<string, number>,
  lineIndex: number,
  ledger: RecapLedger,
  gameCatalog?: Record<string, GameCatalogEntry>,
  championMeta: import('../hooks/useDashboardData').Champion[] = [],
): Omit<WeeklyRecapLine, 'score'> | null {
  const { teamA, teamB, games } = bucket
  if (!games.length) return null

  const id = seriesKey(teamA, teamB)
  const salt = lineIndex * 31 + hashKey(id)

  const winsA = games.filter((g) => g.winner === teamA).length
  const winsB = games.length - winsA
  const dominant = winsA >= winsB ? teamA : teamB
  const victim = dominant === teamA ? teamB : teamA
  let domWins = Math.max(winsA, winsB)
  let vicWins = Math.min(winsA, winsB)

  const region = teamLeague(teams, dominant)
  const domSplitWr = splitWinrate(teams, dominant)
  const vicSplitWr = splitWinrate(teams, victim)

  const ordered = [...games].sort(compareSeriesGames)
  const latestDate = ordered[ordered.length - 1]?.date ?? games[0]!.date
  const firstGameDate = ordered[0]!.date
  const momentum = analyzeSeriesMomentum(games, dominant)
  const { reverseSweep, droppedGame1, leadBlownBy } = momentum
  if (droppedGame1 && vicWins === 0 && domWins >= 2) {
    vicWins = 1
  }
  const blowout = domWins >= 2 && vicWins === 0
  const upset = upsetFromWr(domSplitWr, vicSplitWr)

  const eventKey = eventKeyForGame(games[0] ?? {})
  const domHistory = groupTeamSeriesHistory(
    collectTeamGames(players, dominant, gameCatalog),
    dominant,
    eventKey,
  )
  const vicHistory = groupTeamSeriesHistory(
    collectTeamGames(players, victim, gameCatalog),
    victim,
    eventKey,
  )
  const seriesStreak =
    countSeriesWinStreak(domHistory, firstGameDate, victim) +
    (domWins > vicWins ? 1 : 0)
  const victimSlump = countSeriesLossStreak(vicHistory, firstGameDate)

  const gap = findBestLaneGap(bucket)
  const laneDuel = findLaneDuelDomination(bucket)
  const playerStats = aggregateSeriesPlayerStats(bucket)

  const formFlags = {
    reverseSweep,
    droppedGame1,
    leadBlownBy,
    blowout,
    upset,
    domSplitWr,
    vicSplitWr,
    seriesStreak: domWins > vicWins ? seriesStreak : 0,
    victimSlump: vicWins > domWins ? 0 : victimSlump,
  }

  const prefix = buildFormPrefix(
    dominant,
    victim,
    domWins,
    vicWins,
    formFlags,
    players,
    region,
    ledger,
    id,
    salt,
  )

  const segments: WeeklyRecapSegment[] = prefix ? [...prefix] : []
  segments.push(
    ...buildResultSegments(
      dominant,
      victim,
      domWins,
      vicWins,
      region,
      {
        reverseSweep,
        droppedGame1,
        blowout,
        upset,
        domSplitWr,
        vicSplitWr,
        hasPrefix: Boolean(prefix),
        victimSlump: formFlags.victimSlump,
      },
      ledger,
      id,
      salt,
    ),
  )

  const insights = buildContextInsights(
    bucket,
    dominant,
    victim,
    gap,
    laneDuel,
    playerStats,
    weekCounts,
    { reverseSweep, blowout, domSplitWr, vicSplitWr },
    players,
    ledger,
    id,
    salt,
    championMeta,
    latestDate,
  )

  let added = 0
  for (const insight of insights) {
    if (added >= MAX_CONTEXT_CLAUSES) break
    if (ledger.claim(insight.kind)) {
      segments.push(...insight.segments)
      added++
    }
  }

  if (added === 0 && insights.length) {
    for (const insight of insights.slice(0, MAX_CONTEXT_CLAUSES)) {
      segments.push(...insight.segments)
    }
  }

  return {
    id,
    date: latestDate,
    dateLabel: formatRecapDate(latestDate),
    segments,
  }
}

function citoSeriesInWindow(
  row: CitoSeriesResult,
  window: WeeklyRecapWindow,
): boolean {
  const day = (row.scheduledAt ?? '').slice(0, 10)
  if (!day) return false
  const d = parseCalendarDate(day)
  if (!d) return false
  const start = new Date(window.start)
  start.setHours(0, 0, 0, 0)
  const end = new Date(window.end)
  end.setHours(23, 59, 59, 999)
  return d >= start && d <= end
}

function buildCitoShellRecapLine(row: CitoSeriesResult): WeeklyRecapLine | null {
  if (typeof row.scoreA !== 'number' || typeof row.scoreB !== 'number') return null
  if (!isValidSeriesScore(row.scoreA, row.scoreB)) return null
  const aWins = row.scoreA > row.scoreB
  const winner = aWins ? row.teamA : row.teamB
  const loser = aWins ? row.teamB : row.teamA
  const score = `${Math.max(row.scoreA, row.scoreB)}-${Math.min(row.scoreA, row.scoreB)}`
  const date = (row.scheduledAt ?? '').slice(0, 10)
  if (!date) return null
  const league = (row.league || 'T1').toUpperCase()
  const tournamentLabel = row.tournamentName ?? row.blockName ?? league
  return {
    id: `cito-${row.matchId || `${row.teamA}-${row.teamB}-${date}`}`,
    seriesId: stableSeriesId(row.teamA, row.teamB, date),
    date,
    dateLabel: formatGameDate(date),
    segments: [
      segTeam(winner),
      segText(' beat '),
      segTeam(loser),
      segText(` ${score} (${league})`),
    ],
    score: {
      winner: resolveTeamCanonicalName(winner),
      loser: resolveTeamCanonicalName(loser),
      winnerAbbr: recapTeamTag(winner),
      loserAbbr: recapTeamTag(loser),
      score,
      tournamentLabel,
      tournamentLeague: league,
    },
  }
}

function seriesCoverageKey(teamA: string, teamB: string, date: string): string {
  return `${seriesKey(resolveTeamCanonicalName(teamA), resolveTeamCanonicalName(teamB))}|${date.slice(0, 10)}`
}

/**
 * Hub recap lines: OE-enriched when box scores exist; Cito-complete shells when OE lags.
 * V3-1: Cito results can invent series rows the OE week is missing.
 */
function liftResolvedWithBoxEvidence(
  resolved: import('./citoSeriesVerify').ResolvedSeriesScore,
  oeGameCount: number,
  teamA: string,
  teamB: string,
  date: string,
  citoPlayerStats?: CitoPlayerStatsBundle | null,
): import('./citoSeriesVerify').ResolvedSeriesScore {
  const matchRows = resolved.cito?.matchId
    ? rowsForMatch(citoPlayerStats ?? null, resolved.cito.matchId)
    : []
  const dateRows = rowsForTeamsDate(citoPlayerStats ?? null, teamA, teamB, date)
  const evidence = Math.max(
    oeGameCount,
    uniqueCitoGameCount(matchRows),
    uniqueCitoGameCount(dateRows),
  )
  return liftStaleSweepIfOvermapped(resolved, evidence)
}

export function buildWeeklyRecapLines(
  players: Player[],
  teams: Team[],
  window: WeeklyRecapWindow | null,
  _league: string,
  gameCatalog?: Record<string, GameCatalogEntry>,
  citoResults?: CitoSeriesResult[],
  citoPlayerStats?: CitoPlayerStatsBundle | null,
): WeeklyRecapLine[] {
  if (!window) return []
  const games = collectWeeklyGames(players, window, gameCatalog)
  const cito = citoResults ?? []
  const weekCounts = games.length ? buildWeekChampionCounts(games) : new Map()
  const allGamesForMeta = collectParsedGames(players, { gameCatalog })
  const championMeta = buildChampionMetaFromGames(
    allGamesForMeta.length ? allGamesForMeta : games,
  )
  const series = games.length ? groupSeries(games) : []
  const ledger = new RecapLedger()
  const lines: WeeklyRecapLine[] = []
  const covered = new Set<string>()

  for (let i = 0; i < series.length; i++) {
    const bucket = series[i]!
    if (bucket.games.length < 1) continue

    const winsA = bucket.games.filter((g) => g.winner === bucket.teamA).length
    const winsB = bucket.games.length - winsA
    const ordered = [...bucket.games].sort(compareSeriesGames)
    const latestDate = ordered[ordered.length - 1]?.date ?? bucket.games[0]!.date
    const firstGame = bucket.games[0]!
    const yearHint = firstGame.oeYear ?? latestDate.slice(0, 4)
    const tournamentHint = intlTournamentLabel(
      (firstGame.league ?? 'LCK').toUpperCase(),
      yearHint,
      firstGame.split,
    )
    const resolvedRaw = resolveSeriesScoreWithCito(
      bucket.teamA,
      bucket.teamB,
      winsA,
      winsB,
      latestDate,
      cito,
      seriesResolveOpts(firstGame.league, firstGame.split, firstGame.playoffs, tournamentHint),
    )
    const resolved = liftResolvedWithBoxEvidence(
      resolvedRaw,
      bucket.games.length,
      bucket.teamA,
      bucket.teamB,
      latestDate,
      citoPlayerStats,
    )
    // Allow OE mid-Bo5 stubs (e.g. 2-2) when Cito already has the final score.
    // Weekly hub + recaps only show concluded series.
    if (!isSeriesReadyForRecap(resolved)) continue
    if (!isValidSeriesScore(resolved.winsA, resolved.winsB)) continue

    covered.add(seriesCoverageKey(bucket.teamA, bucket.teamB, latestDate))
    const neededGames = resolved.winsA + resolved.winsB
    // OE lag: schedule already final but box scores incomplete — still list the series.
    if (bucket.games.length < neededGames) {
      const shell = buildCitoShellRecapLine({
        matchId: resolved.cito?.matchId ?? '',
        league: firstGame.league ?? resolved.cito?.league ?? 'T1',
        tournamentName: resolved.cito?.tournamentName ?? null,
        blockName: resolved.blockName,
        teamA: bucket.teamA,
        teamB: bucket.teamB,
        scheduledAt: latestDate,
        status: 'completed',
        scoreA: resolved.winsA,
        scoreB: resolved.winsB,
        winnerTeam: resolved.winner,
        bestOf: resolved.bestOf,
      })
      if (shell) lines.push(shell)
      continue
    }

    const line = summarizeSeries(
      bucket,
      teams,
      players,
      weekCounts,
      i,
      ledger,
      gameCatalog,
      championMeta,
    )
    if (!line) continue

    const tournamentLabel = resolveTournamentDisplay(
      firstGame.league,
      firstGame.split,
      firstGame.playoffs,
      { rawSplit: firstGame.rawSplit, oeYear: firstGame.oeYear },
    )
    const tournamentLeague = buildTournamentIdentity(
      firstGame.league ?? '',
      firstGame.split ?? '',
      Boolean(firstGame.playoffs),
      { rawSplit: firstGame.rawSplit, oeYear: firstGame.oeYear },
    ).league

    lines.push({
      ...line,
      seriesId: stableSeriesId(bucket.teamA, bucket.teamB, latestDate, bucket.sessionIndex),
      score: {
        winner: resolved.winner,
        loser: resolved.loser,
        winnerAbbr: recapTeamTag(resolved.winner),
        loserAbbr: recapTeamTag(resolved.loser),
        score: resolved.score,
        tournamentLabel,
        tournamentLeague,
      },
    })
  }

  // Cito-only series OE never ingested — still require completed status + recap gate.
  for (const row of cito) {
    if (!citoSeriesInWindow(row, window)) continue
    if (!isCitoRowCompletedForRecap(row)) continue
    if (typeof row.scoreA !== 'number' || typeof row.scoreB !== 'number') continue
    if (!isValidSeriesScore(row.scoreA, row.scoreB)) continue
    const resolvedShell = liftResolvedWithBoxEvidence(
      resolveSeriesScoreWithCito(
        row.teamA,
        row.teamB,
        row.scoreA,
        row.scoreB,
        (row.scheduledAt ?? '').slice(0, 10),
        cito,
        seriesResolveOpts(row.league, null, false, row.tournamentName ?? row.blockName),
      ),
      0,
      row.teamA,
      row.teamB,
      (row.scheduledAt ?? '').slice(0, 10),
      citoPlayerStats,
    )
    if (!isSeriesReadyForRecap(resolvedShell)) continue
    const date = (row.scheduledAt ?? '').slice(0, 10)
    const key = seriesCoverageKey(row.teamA, row.teamB, date)
    if (covered.has(key)) continue
    // Also match ±1 day OE coverage (timezone / start-date drift).
    const targetPair = seriesKey(
      resolveTeamCanonicalName(row.teamA),
      resolveTeamCanonicalName(row.teamB),
    )
    const nearCovered = [...covered].some((k) => {
      const idx = k.lastIndexOf('|')
      if (idx < 0) return false
      const pair = k.slice(0, idx)
      const d = k.slice(idx + 1)
      if (pair !== targetPair) return false
      return Math.abs(daysBetweenDates(date, d)) <= 1
    })
    if (nearCovered) continue
    const shell = buildCitoShellRecapLine({
      ...row,
      scoreA: resolvedShell.winsA,
      scoreB: resolvedShell.winsB,
    })
    if (!shell) continue
    covered.add(key)
    lines.push(shell)
  }

  return lines.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

function daysBetweenDates(a: string, b: string): number {
  const da = parseCalendarDate(a)
  const db = parseCalendarDate(b)
  if (!da || !db) return 999
  return Math.round(Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24))
}

export function recapLineToText(line: WeeklyRecapLine): string {
  return line.segments
    .map((s) => (s.kind === 'text' ? s.value : s.label))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Template segments through score/league — excludes stat/context clauses (for AI detail append). */
export function extractRecapShellSegments(
  templateLine: WeeklyRecapLine,
  score: string,
): WeeklyRecapSegment[] {
  const shell: WeeklyRecapSegment[] = []
  for (const seg of templateLine.segments) {
    if (seg.kind === 'team') {
      shell.push(seg)
      continue
    }
    const idx = seg.value.indexOf(score)
    if (idx === -1) {
      shell.push(seg)
      continue
    }
    const afterScore = seg.value.slice(idx + score.length)
    const leagueSuffix = afterScore.match(/^\s*\([A-Z]+\)/)?.[0] ?? ''
    const shellText = seg.value.slice(0, idx + score.length + leagueSuffix.length)
    if (shellText) shell.push({ kind: 'text', value: shellText })
    return shell
  }
  return shell
}

export function buildFallbackRecapShell(brief: SeriesBrief): WeeklyRecapSegment[] {
  return [
    segTeam(brief.facts.winner),
    segText(' beat '),
    segTeam(brief.facts.loser),
    segText(` ${brief.facts.score} (${brief.facts.league})`),
  ]
}

export interface SeriesBrief {
  seriesId: string
  date: string
  dateLabel: string
  league: string
  teamA: string
  teamB: string
  facts: SeriesFacts
  templateLine: WeeklyRecapLine
  /** oe = box-score facts; cito = schedule/score + tournament context only (OE lag). */
  dataSource?: 'oe' | 'cito'
}

/** True when the brief has no per-player box scores (Cito-complete, OE lagging). */
export const isScoreOnlyBrief = (brief: SeriesBrief): boolean =>
  brief.dataSource === 'cito' ||
  (!brief.facts.winnerStars.length &&
    !brief.facts.winnerConcerns.length &&
    !brief.facts.loserBrightSpots.length &&
    !brief.facts.loserStinkers.length &&
    brief.facts.gameCount === 0)

export function stableSeriesId(
  teamA: string,
  teamB: string,
  latestDate: string,
  sessionIndex = 0,
): string {
  const a = resolveTeamCanonicalName(teamA)
  const b = resolveTeamCanonicalName(teamB)
  const base = `${seriesKey(a, b)}|${latestDate}`
  return sessionIndex > 0 ? `${base}|${sessionIndex}` : base
}

function teamSplitWr(teams: Team[], name: string): number {
  return findTeamByName(teams, name)?.winrate ?? 50
}

/** Build ParsedGame[] from Cito player box scores for a single series. */
export function parsedGamesFromCitoPlayerRows(
  rows: CitoPlayerStatCacheRow[],
  leagueHint?: string,
): ParsedGame[] {
  if (!rows.length) return []
  const byGame = new Map<string, CitoPlayerStatCacheRow[]>()
  for (const r of rows) {
    const list = byGame.get(r.citoGameId) ?? []
    list.push(r)
    byGame.set(r.citoGameId, list)
  }

  const games: ParsedGame[] = []
  for (const [gameId, players] of byGame) {
    if (players.length < 8) continue
    const teamKills = new Map<string, number>()
    for (const p of players) {
      const t = resolveTeamCanonicalName(p.teamName)
      teamKills.set(t, (teamKills.get(t) ?? 0) + p.kills)
    }
    const teamsInGame = [...teamKills.keys()]
    if (teamsInGame.length < 2) continue

    const winnerTeam =
      players.find((p) => p.result === 1)?.teamName ??
      teamsInGame[0]!
    const winner = resolveTeamCanonicalName(winnerTeam)
    const loser =
      teamsInGame.find((t) => t !== winner) ?? teamsInGame[1] ?? teamsInGame[0]!
    const date = players[0]!.gameDate
    const league = (players[0]!.league || leagueHint || 'T1').toUpperCase()
    const length = players[0]!.gameLengthMinutes ?? 30
    const gameNumber = players[0]!.gameNumber ?? null

    const roster: GamePlayer[] = players.map((p) => {
      const team = resolveTeamCanonicalName(p.teamName)
      const tk = teamKills.get(team) ?? 0
      const kp = tk > 0 ? ((p.kills + p.assists) / tk) * 100 : 0
      const dmgShare = p.damageShare <= 1.5 ? p.damageShare * 100 : p.damageShare
      const goldShare = p.goldShare <= 1.5 ? p.goldShare * 100 : p.goldShare
      return {
        team,
        name: p.playerName,
        champion: p.champion || 'Unknown',
        role: p.role,
        kda: p.kda,
        gd15: p.gd15,
        xpd15: p.xpd15,
        csd15: p.csd15,
        kp,
        dmgShare,
        goldShare,
        kaPerMin: length > 0 ? (p.kills + p.assists) / length : 0,
        dmgGoldRatio: goldShare > 0 ? dmgShare / goldShare : dmgShare,
        dmgPerGold: p.gold > 0 ? p.damage / p.gold : 0,
        won: p.result === 1,
      }
    })

    games.push({
      id: gameId,
      date,
      winner,
      loser,
      players: roster,
      league,
      split: 'Summer',
      playoffs: false,
      oeYear: date.slice(0, 4),
      // Used by compareSeriesGames when present on catalog-backed games; keep for sorting.
      ...(typeof gameNumber === 'number' ? { gameNumber } : {}),
    } as ParsedGame)
  }
  return games.sort((a, b) => {
    const ga = (a as { gameNumber?: number }).gameNumber
    const gb = (b as { gameNumber?: number }).gameNumber
    if (typeof ga === 'number' && typeof gb === 'number' && ga !== gb) return ga - gb
    return a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  })
}

/**
 * Score + tournament-context SeriesBrief when Cito has a completed series but OE
 * box scores are missing. Uses Cito player-stats for full facts when available.
 */
export function buildCitoOnlySeriesBrief(
  row: CitoSeriesResult,
  teams: Team[],
  powerRanks?: PowerRankMap,
  citoPeers: CitoSeriesResult[] = [],
  citoPlayerStats?: CitoPlayerStatsBundle | null,
): SeriesBrief | null {
  if (!isCitoRowCompletedForRecap(row)) return null
  if (typeof row.scoreA !== 'number' || typeof row.scoreB !== 'number') return null
  if (!isValidSeriesScore(row.scoreA, row.scoreB)) return null
  const date = (row.scheduledAt ?? '').slice(0, 10)
  if (!date) return null

  const resolved = resolveSeriesScoreWithCito(
    row.teamA,
    row.teamB,
    row.scoreA,
    row.scoreB,
    date,
    [row, ...citoPeers],
    seriesResolveOpts(row.league, null, false, row.tournamentName ?? row.blockName),
  )
  if (!isCitoRowCompletedForRecap(row)) return null
  if (!isSeriesReadyForRecap(resolved)) return null
  const boxRows = rowsForMatch(citoPlayerStats ?? null, row.matchId)
  const boxGames = uniqueCitoGameCount(boxRows)
  if (
    !recapHasFullSeriesEvidence({
      resolved,
      oeGameCount: 0,
      citoBoxGameCount: boxGames,
    })
  ) {
    return null
  }

  const winner = resolved.winner
  const loser = resolved.loser
  const domWins = Math.max(resolved.winsA, resolved.winsB)
  const vicWins = Math.min(resolved.winsA, resolved.winsB)
  const league = (row.league || 'T1').toUpperCase()
  const tournamentLabel =
    row.tournamentName ?? row.blockName ?? intlTournamentLabel(league, date.slice(0, 4), null)
  const format = resolveTournamentFormat({
    league: row.league,
    tournamentLabel,
    blockName: row.blockName ?? resolved.blockName,
  })
  const bracketEvent = isBracketContextEvent({
    league: row.league,
    tournamentLabel,
    blockName: row.blockName ?? resolved.blockName,
    format,
  })
  const citoPeersFull = citoPeers.length ? citoPeers : [row]
  const loserContinues = bracketEvent
    ? teamHasUpcomingInTournament(loser, date, tournamentLabel, citoPeersFull)
    : false
  const winnerContinues = bracketEvent
    ? teamHasUpcomingInTournament(winner, date, tournamentLabel, citoPeersFull)
    : false
  const scheduleContext = buildScheduleContextHint(
    winner,
    loser,
    date,
    tournamentLabel,
    citoPeersFull,
    bracketEvent,
  )

  const domSplitWr = teamSplitWr(teams, winner)
  const vicSplitWr = teamSplitWr(teams, loser)

  // Prefer full box-score facts from Cito player-stats when available.
  let statRows = row.matchId
    ? rowsForMatch(citoPlayerStats ?? null, row.matchId)
    : []
  if (!statRows.length) {
    statRows = rowsForTeamsDate(
      citoPlayerStats ?? null,
      row.teamA,
      row.teamB,
      date,
    )
  }
  const citoGames = hasSufficientCitoBoxScores(statRows)
    ? parsedGamesFromCitoPlayerRows(statRows, league)
    : []

  if (citoGames.length >= Math.max(1, domWins + vicWins - 1)) {
    const bucket: SeriesBucket = {
      teamA: resolveTeamCanonicalName(row.teamA),
      teamB: resolveTeamCanonicalName(row.teamB),
      games: citoGames,
      sessionIndex: 0,
    }
    const weekCounts = buildWeekChampionCounts(citoGames)
    const facts = buildSeriesFacts(bucket, teams, weekCounts, {
      blowout: domWins >= 2 && vicWins === 0,
      seriesStreak: 0,
      victimSlump: 0,
      powerRanks,
      scheduleContext,
      bracketContext: bracketEvent
        ? {
            blockName: resolved.blockName,
            bracket: resolved.bracket,
            loserContinues,
            winnerContinues,
            formatId: format?.id ?? null,
            structure: format?.structure ?? null,
            lossCanEliminateWithoutLower: format?.lossCanEliminateWithoutLower ?? null,
          }
        : {
            blockName: resolved.blockName ?? row.blockName,
            bracket: 'unknown',
            loserContinues: false,
            winnerContinues: false,
            formatId: null,
            structure: null,
            lossCanEliminateWithoutLower: null,
          },
    })
    facts.score = resolved.score
    facts.domWins = domWins
    facts.vicWins = vicWins
    facts.winner = resolveTeamCanonicalName(winner)
    facts.loser = resolveTeamCanonicalName(loser)
    facts.winnerAbbr = recapTeamTag(winner)
    facts.loserAbbr = recapTeamTag(loser)
    facts.tournamentLabel = tournamentLabel
    facts.isBracketEvent = bracketEvent
    facts.scheduleContext = scheduleContext
    facts.narrativeHints = [
      `tournament: ${tournamentLabel}`,
      `box scores from warehouse / Cito player-stats (${citoGames.length} games)`,
      ...facts.narrativeHints.filter((h) => !h.startsWith('tournament:')),
    ]

    const shell = buildCitoShellRecapLine(row)
    if (!shell) return null
    return {
      seriesId: stableSeriesId(row.teamA, row.teamB, date),
      date,
      dateLabel: formatRecapDate(date),
      league,
      teamA: resolveTeamCanonicalName(row.teamA),
      teamB: resolveTeamCanonicalName(row.teamB),
      facts,
      templateLine: shell,
      dataSource: 'cito',
    }
  }

  const narrativeHints: string[] = [
    `tournament: ${tournamentLabel}`,
    bracketEvent
      ? 'event type: bracket / playoffs / international — bracket language OK when narrativeHints say so'
      : 'event type: regular season — NEVER say lower bracket, upper bracket, eliminated, or sent home',
    `score verified from schedule (${resolved.score}) — player-stats not yet synced`,
  ]
  if (bracketEvent && loserContinues) {
    narrativeHints.push(
      `${recapTeamTag(loser)} continues in ${tournamentLabel} (not eliminated)`,
    )
  } else if (bracketEvent && format?.lossCanEliminateWithoutLower) {
    narrativeHints.push(`${recapTeamTag(loser)} is eliminated from ${tournamentLabel}`)
  }
  if (bracketEvent && winnerContinues) {
    narrativeHints.push(`${recapTeamTag(winner)} advances / continues in ${tournamentLabel}`)
  }
  if (scheduleContext) narrativeHints.push(scheduleContext)
  if (domWins >= 2 && vicWins === 0) narrativeHints.push('clean sweep')

  const rankW = powerRanks?.get(resolveTeamCanonicalName(winner))
  const rankL = powerRanks?.get(resolveTeamCanonicalName(loser))
  if (rankW != null && rankL != null && rankL + 5 <= rankW) {
    narrativeHints.push(
      `upset watch: ${recapTeamTag(winner)} (#${rankW}) beat higher-ranked ${recapTeamTag(loser)} (#${rankL})`,
    )
  }

  const facts: SeriesFacts = {
    winner: resolveTeamCanonicalName(winner),
    loser: resolveTeamCanonicalName(loser),
    winnerAbbr: recapTeamTag(winner),
    loserAbbr: recapTeamTag(loser),
    score: resolved.score,
    league,
    tournamentLabel,
    isBracketEvent: bracketEvent,
    scheduleContext,
    domWins,
    vicWins,
    gameCount: 0,
    gameSequence: '',
    seriesArc: domWins >= 2 && vicWins === 0 ? 'sweep' : 'standard',
    reverseSweep: false,
    blowout: domWins >= 2 && vicWins === 0,
    upset: vicSplitWr > domSplitWr + 8,
    messySeries: false,
    leadBlownBy: null,
    leadBlownByAbbr: null,
    domSplitWr,
    vicSplitWr,
    seriesStreak: 0,
    victimSlump: 0,
    avgGd15Winner: 0,
    laneDuel: null,
    topCarry: null,
    pocketPick: null,
    winnerStars: [],
    winnerConcerns: [],
    loserBrightSpots: [],
    loserStinkers: [],
    gameFlow: [],
    narrativeHints,
    participants: [],
    loserHorrors: [],
    highlights: [],
    loserStandout: null,
  }

  const shell = buildCitoShellRecapLine(row)
  if (!shell) return null

  return {
    seriesId: stableSeriesId(row.teamA, row.teamB, date),
    date,
    dateLabel: formatRecapDate(date),
    league,
    teamA: resolveTeamCanonicalName(row.teamA),
    teamB: resolveTeamCanonicalName(row.teamB),
    facts,
    templateLine: {
      ...shell,
      segments: [
        ...shell.segments,
        segText(
          bracketEvent && loserContinues
            ? ` — ${recapTeamTag(loser)} continues`
            : bracketEvent && winnerContinues
              ? ` — ${recapTeamTag(winner)} advances`
              : !bracketEvent && scheduleContext
                ? ''
                : '',
        ),
      ].filter((s) => s.kind !== 'text' || s.value.length > 0),
    },
    dataSource: 'cito',
  }
}

function citoRowMatchesCollectFilter(
  row: CitoSeriesResult,
  window: WeeklyRecapWindow | null,
  gameFilter?: (g: PlayerGameLog) => boolean,
): boolean {
  const date = (row.scheduledAt ?? '').slice(0, 10)
  if (!date) return false
  if (window) return citoSeriesInWindow(row, window)
  if (gameFilter) {
    // Score-only path: only honor date-based filters (e.g. recent 14d).
    // Playoff/year filters need OE flags — skip Cito-only for those.
    return gameFilter({ date } as PlayerGameLog)
  }
  return false
}

/** All series in the window with deterministic facts + template fallback line. */
export function collectSeriesBriefs(
  players: Player[],
  teams: Team[],
  window: WeeklyRecapWindow | null,
  options?: {
    gameFilter?: (g: PlayerGameLog) => boolean
    gameCatalog?: Record<string, GameCatalogEntry>
    powerRanks?: PowerRankMap
    citoResults?: CitoSeriesResult[]
    citoPlayerStats?: CitoPlayerStatsBundle | null
  },
): SeriesBrief[] {
  const cito = options?.citoResults ?? []
  if (!window && !options?.gameFilter && !cito.length) return []
  const gameCatalog = options?.gameCatalog
  const citoPlayerStats = options?.citoPlayerStats ?? null
  const games = collectParsedGames(players, { window, gameFilter: options?.gameFilter, gameCatalog })

  const weekCounts = games.length ? buildWeekChampionCounts(games) : new Map()
  const playerChampGames = buildPlayerChampGameIndex(players)
  // Presence/meta + tournament peers from full player logs (not just the recap window).
  const allGamesForMeta = collectParsedGames(players, { gameCatalog })
  const championMeta = buildChampionMetaFromGames(
    allGamesForMeta.length ? allGamesForMeta : games,
  )
  const series = games.length ? groupSeries(games) : []
  const peerSeries = allGamesForMeta.length
    ? groupSeries(allGamesForMeta)
    : series
  const ledger = new RecapLedger()
  const briefs: SeriesBrief[] = []

  // First pass: lightweight refs for tournament advancement / elimination hints.
  const tournamentPeers: import('./recapFacts').TournamentSeriesRef[] = []
  for (const bucket of peerSeries) {
    if (!bucket.games.length) continue
    const winsA = bucket.games.filter((g) => g.winner === bucket.teamA).length
    const winsB = bucket.games.length - winsA
    const ordered = [...bucket.games].sort(compareSeriesGames)
    const latestDate = ordered[ordered.length - 1]?.date ?? bucket.games[0]!.date
    const g0 = bucket.games[0]!
    const league = (g0.league ?? 'LCK').toUpperCase()
    const year = g0.oeYear ?? latestDate.slice(0, 4)
    const tournamentLabel = intlTournamentLabel(league, year, g0.split)
    const resolved = resolveSeriesScoreWithCito(
      bucket.teamA,
      bucket.teamB,
      winsA,
      winsB,
      latestDate,
      cito,
      seriesResolveOpts(g0.league, g0.split, g0.playoffs, tournamentLabel),
    )
    if (!isSeriesReadyForRecap(resolved)) continue
    if (!isValidSeriesScore(resolved.winsA, resolved.winsB)) continue
    tournamentPeers.push({
      date: latestDate,
      winner: resolved.winner,
      loser: resolved.loser,
      league,
      tournamentLabel,
    })
  }

  for (let i = 0; i < series.length; i++) {
    const bucket = series[i]!
    if (!bucket.games.length) continue

    const winsA = bucket.games.filter((g) => g.winner === bucket.teamA).length
    const winsB = bucket.games.length - winsA
    const ordered = [...bucket.games].sort(compareSeriesGames)
    const latestDate = ordered[ordered.length - 1]?.date ?? bucket.games[0]!.date
    const firstGameDate = ordered[0]!.date
    const g0pre = bucket.games[0]!
    const leaguePre = (g0pre.league ?? 'LCK').toUpperCase()
    const yearPre = g0pre.oeYear ?? latestDate.slice(0, 4)
    const tournamentLabelPre = intlTournamentLabel(leaguePre, yearPre, g0pre.split)
    const resolved = liftResolvedWithBoxEvidence(
      resolveSeriesScoreWithCito(
        bucket.teamA,
        bucket.teamB,
        winsA,
        winsB,
        latestDate,
        cito,
        seriesResolveOpts(g0pre.league, g0pre.split, g0pre.playoffs, tournamentLabelPre),
      ),
      bucket.games.length,
      bucket.teamA,
      bucket.teamB,
      latestDate,
      citoPlayerStats,
    )
    if (!isSeriesReadyForRecap(resolved)) {
      console.warn(
        `Skipping incomplete series for recap ${bucket.teamA} vs ${bucket.teamB} ` +
          `(OE ${Math.max(winsA, winsB)}-${Math.min(winsA, winsB)}; waiting for series conclusion)`,
      )
      continue
    }
    if (!isValidSeriesScore(resolved.winsA, resolved.winsB)) {
      console.warn(
        `Skipping invalid resolved score ${Math.max(resolved.winsA, resolved.winsB)}-${Math.min(resolved.winsA, resolved.winsB)} ` +
          `(${bucket.teamA} vs ${bucket.teamB}, OE ${bucket.games.length} games)`,
      )
      continue
    }
    const neededGames = resolved.winsA + resolved.winsB
    const boxRows = rowsForTeamsDate(
      citoPlayerStats,
      bucket.teamA,
      bucket.teamB,
      latestDate,
    )
    const boxGames = uniqueCitoGameCount(boxRows)
    if (
      !recapHasFullSeriesEvidence({
        resolved,
        oeGameCount: bucket.games.length,
        citoBoxGameCount: boxGames,
      })
    ) {
      console.warn(
        `Skipping ${bucket.teamA} vs ${bucket.teamB}: schedule ${resolved.score} needs ` +
          `${neededGames} maps, have OE ${bucket.games.length} / Cito ${boxGames}`,
      )
      continue
    }

    const dominant = resolved.winner
    const victim = resolved.loser
    const domWins = Math.max(resolved.winsA, resolved.winsB)
    const vicWins = Math.min(resolved.winsA, resolved.winsB)

    const eventKey = eventKeyForGame(bucket.games[0] ?? {})
    const domHistory = groupTeamSeriesHistory(
      collectTeamGames(players, dominant, gameCatalog),
      dominant,
      eventKey,
    )
    const vicHistory = groupTeamSeriesHistory(
      collectTeamGames(players, victim, gameCatalog),
      victim,
      eventKey,
    )
    const seriesStreak =
      countSeriesWinStreak(domHistory, firstGameDate, victim) + (domWins > vicWins ? 1 : 0)
    const victimSlump = countSeriesLossStreak(vicHistory, firstGameDate)

    const g0 = bucket.games[0]!
    const tournamentLabel = tournamentLabelPre

    const format = resolveTournamentFormat({
      league: g0.league,
      tournamentLabel,
      split: g0.split,
      playoffs: g0.playoffs,
      blockName: resolved.blockName,
    })
    const bracketEvent = isBracketContextEvent({
      league: g0.league,
      tournamentLabel,
      split: g0.split,
      playoffs: g0.playoffs,
      blockName: resolved.blockName,
      format,
    })
    const loserContinues = bracketEvent
      ? teamHasUpcomingInTournament(victim, latestDate, tournamentLabel, cito)
      : false
    const winnerContinues = bracketEvent
      ? teamHasUpcomingInTournament(dominant, latestDate, tournamentLabel, cito)
      : false
    const scheduleContext = buildScheduleContextHint(
      dominant,
      victim,
      latestDate,
      tournamentLabel,
      cito,
      bracketEvent,
    )
    const modelScoresByPlayer = buildSeriesModelScores(
      players,
      bucket.games.map((g) => g.id),
    )

    const facts = buildSeriesFacts(bucket, teams, weekCounts, {
      blowout: domWins >= 2 && vicWins === 0,
      seriesStreak: domWins > vicWins ? seriesStreak : 0,
      victimSlump: vicWins > domWins ? 0 : victimSlump,
      playerChampGames,
      tournamentPeers,
      champions: championMeta,
      powerRanks: options?.powerRanks,
      modelScoresByPlayer,
      scheduleContext,
      bracketContext: {
        blockName: resolved.blockName,
        bracket: resolved.bracket,
        loserContinues,
        winnerContinues,
        formatId: format?.id ?? null,
        structure: format?.structure ?? null,
        lossCanEliminateWithoutLower: format?.lossCanEliminateWithoutLower ?? null,
      },
    })

    // Prefer Cito-verified score in facts (buildSeriesFacts used OE game counts).
    facts.score = resolved.score
    facts.domWins = domWins
    facts.vicWins = vicWins
    facts.winner = resolved.winner
    facts.loser = resolved.loser
    facts.winnerAbbr = recapTeamTag(resolved.winner)
    facts.loserAbbr = recapTeamTag(resolved.loser)
    facts.blowout = domWins >= 2 && vicWins === 0

    const templateBase = summarizeSeries(
      bucket,
      teams,
      players,
      weekCounts,
      i,
      ledger,
      gameCatalog,
      championMeta,
    )
    if (!templateBase) continue

    const templateLine: WeeklyRecapLine = {
      ...templateBase,
      score: {
        winner: resolved.winner,
        loser: resolved.loser,
        winnerAbbr: recapTeamTag(resolved.winner),
        loserAbbr: recapTeamTag(resolved.loser),
        score: resolved.score,
      },
    }

    briefs.push({
      seriesId: stableSeriesId(bucket.teamA, bucket.teamB, latestDate, bucket.sessionIndex),
      date: latestDate,
      dateLabel: formatRecapDate(latestDate),
      league: facts.league,
      teamA: resolveTeamCanonicalName(bucket.teamA),
      teamB: resolveTeamCanonicalName(bucket.teamB),
      facts,
      templateLine,
      dataSource: 'oe',
    })
  }

  // V3 current: invent Cito-complete series even when OE has zero games for them.
  const covered = new Set(
    briefs.map((b) => seriesCoverageKey(b.teamA, b.teamB, b.date)),
  )
  for (const row of cito) {
    if (!citoRowMatchesCollectFilter(row, window, options?.gameFilter)) continue
    const date = (row.scheduledAt ?? '').slice(0, 10)
    if (!date) continue
    const key = seriesCoverageKey(row.teamA, row.teamB, date)
    if (covered.has(key)) continue
    const brief = buildCitoOnlySeriesBrief(
      row,
      teams,
      options?.powerRanks,
      cito,
      citoPlayerStats,
    )
    if (!brief) continue
    covered.add(key)
    briefs.push(brief)
  }

  return briefs.sort((a, b) => b.date.localeCompare(a.date) || a.seriesId.localeCompare(b.seriesId))
}

/** 2026 canonical Spring playoff games across tier-1 leagues (budgeted bulk backfill). */
export function is2026SpringPlayoffGame(g: PlayerGameLog): boolean {
  const year = g.oeYear ?? g.date?.slice(0, 4) ?? ''
  if (year !== '2026') return false
  if (!g.playoffs) return false
  return (g.split ?? '').toLowerCase().includes('spring')
}

export function isRecentCompletedGame(g: PlayerGameLog, lookbackDays = 14): boolean {
  const d = new Date(g.date)
  if (Number.isNaN(d.getTime())) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - lookbackDays)
  cutoff.setHours(0, 0, 0, 0)
  return d >= cutoff
}

export { recapTeamTag } from './recapTeamTag'
