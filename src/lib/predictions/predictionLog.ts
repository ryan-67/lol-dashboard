/**
 * Predictions → Log tab: completed tier-1 series with model calls vs results
 * and per-game team/player performance scores.
 */
import type { DashboardData, Player } from '../../hooks/useDashboardData'
import { resolveTeamCanonicalName, teamMatchesCanonical } from '../entities/slugs'
import { isDisplayablePlayer, normalizePosition, computeGameScore, type RoleKey } from '../playerRadar'
import { collectParsedGames } from '../weeklyRecap'
import {
  groupGamesIntoSeries,
  isValidSeriesScore,
  seriesKey,
  countSeriesWins,
  orderSeriesGames,
} from '../seriesGrouping'
import { formatPatch } from '../format'
import { unitIntervalTo100 } from '../scoreNormalize'
import { teamGamePerformanceScore } from './matchHistoryPerf'
import {
  isAcademyOrMinorScheduleRow,
  isInternationalScheduleLeague,
  matchesPredictionLeagueFilter,
  type PredictionLeagueFilter,
} from './leagueFilter'
import {
  scorePrematchClient,
  type PrematchModelOdds,
} from './scorePrematchClient'
import type { RegionStrengthBundle } from '../loadRegionStrength'
import type { PlayerRatingsBundle } from '../loadPlayerRatings'
import type { CitoScheduleRow } from '../loadCitoSchedule'

export interface HoldoutLogEntry {
  seriesId: string
  seriesKey: string
  date: string
  league: string
  patch: string
  teamA: string
  teamB: string
  winsA: number
  winsB: number
  winner: string
  modelProbA: number
  baselineProbA: number
  predictedWinner: string
  correct: boolean
  bestOf: number | null
}

export interface HoldoutLogFile {
  generatedAt: string
  source: string
  seriesCount: number
  correctCount: number
  accuracy: number | null
  entries: HoldoutLogEntry[]
}

export interface PredictionLogPlayerScore {
  name: string
  role: RoleKey | null
  champion: string
  score: number
  won: boolean
}

export interface PredictionLogGame {
  gameId: string
  gameNumber: number
  date: string
  winner: string
  patch: string
  teamAPerf: number | null
  teamBPerf: number | null
  playersA: PredictionLogPlayerScore[]
  playersB: PredictionLogPlayerScore[]
}

export type PredictionSource = 'holdout' | 'retrospective'

export interface PredictionLogRow {
  seriesId: string
  seriesKey: string
  date: string
  league: string
  patch: string
  teamA: string
  teamB: string
  winsA: number
  winsB: number
  winner: string
  scoreLabel: string
  /** P(teamA wins series) from model */
  modelProbA: number | null
  baselineProbA: number | null
  predictedWinner: string | null
  correct: boolean | null
  predictionSource: PredictionSource
  model: PrematchModelOdds | null
  games: PredictionLogGame[]
}

function patchForGame(
  gameId: string,
  catalog: DashboardData['gameCatalog'] | undefined,
): string {
  const p = catalog?.[gameId]?.patch
  return p ? formatPatch(p) : '—'
}

function playerScoresForSide(
  players: Player[],
  teamName: string,
  gameId: string,
  cohort: Player[],
): PredictionLogPlayerScore[] {
  const out: PredictionLogPlayerScore[] = []
  for (const p of players) {
    if (!teamMatchesCanonical(p.team, teamName)) continue
    const role = normalizePosition(p.position)
    const game = p.gameLog?.find((g) => g.gameId === gameId)
    if (!game || !role) continue
    out.push({
      name: p.name,
      role,
      champion: game.champion ?? '—',
      score: unitIntervalTo100(computeGameScore(game, role, cohort)),
      won: game.result === 1,
    })
  }
  out.sort((a, b) => {
    const order: RoleKey[] = ['top', 'jungle', 'mid', 'adc', 'support']
    return order.indexOf(a.role ?? 'mid') - order.indexOf(b.role ?? 'mid')
  })
  return out
}

function toScheduleRow(league: string, teamA: string, teamB: string, tournament?: string): CitoScheduleRow {
  return {
    match_id: '',
    league,
    tournament_name: tournament ?? null,
    team_a: teamA,
    team_b: teamB,
    scheduled_at: null,
    status: 'completed',
    block_name: null,
  }
}

function holdoutIndex(file: HoldoutLogFile | null): Map<string, HoldoutLogEntry> {
  const map = new Map<string, HoldoutLogEntry>()
  if (!file?.entries?.length) return map
  for (const e of file.entries) {
    map.set(e.seriesKey.toLowerCase(), e)
    // Also index by date + unsorted pair for fuzzy join
    const a = resolveTeamCanonicalName(e.teamA)
    const b = resolveTeamCanonicalName(e.teamB)
    map.set(`${seriesKey(a, b)}|${e.date}`.toLowerCase(), e)
  }
  return map
}

export function buildPredictionLogRows(
  data: DashboardData,
  opts: {
    filter: PredictionLeagueFilter
    holdout: HoldoutLogFile | null
    region: RegionStrengthBundle | null
    ratings: PlayerRatingsBundle | null
    limit?: number
  },
): PredictionLogRow[] {
  const limit = opts.limit ?? 80
  const players = data.players.filter(isDisplayablePlayer)
  const catalog = data.gameCatalog ?? {}
  const games = collectParsedGames(players, { gameCatalog: catalog })
  const buckets = groupGamesIntoSeries(games)
  const idx = holdoutIndex(opts.holdout)
  const rows: PredictionLogRow[] = []

  for (const bucket of buckets) {
    const ordered = orderSeriesGames(bucket.games, bucket.teamA, bucket.teamB)
    if (!ordered.length) continue
    const winsA = countSeriesWins(ordered, bucket.teamA)
    const winsB = countSeriesWins(ordered, bucket.teamB)
    if (!isValidSeriesScore(winsA, winsB)) continue

    const sample = ordered[0]!
    const league = (sample.league ?? '').toUpperCase()
    const scheduleProbe = toScheduleRow(league || sample.league || '', bucket.teamA, bucket.teamB, sample.split)
    if (isAcademyOrMinorScheduleRow(scheduleProbe)) continue
    if (!matchesPredictionLeagueFilter(scheduleProbe, opts.filter)) {
      // Domestic filter excludes internationals; for 'all' still require tier-1 codes.
      if (opts.filter === 'all') {
        const ok =
          ['LCK', 'LPL', 'LEC', 'LCS'].includes(league) ||
          isInternationalScheduleLeague(scheduleProbe)
        if (!ok) continue
      } else {
        continue
      }
    }

    const lastDate = ordered[ordered.length - 1]?.date ?? sample.date
    const seriesKeyStr = `${seriesKey(
      resolveTeamCanonicalName(bucket.teamA),
      resolveTeamCanonicalName(bucket.teamB),
    )}|${lastDate}`
    const seriesId = bucket.sessionIndex > 0 ? `${seriesKeyStr}|${bucket.sessionIndex}` : seriesKeyStr

    const holdout = idx.get(seriesKeyStr.toLowerCase()) ?? null
    const winner = winsA >= winsB ? bucket.teamA : bucket.teamB
    const scoreLabel = `${Math.max(winsA, winsB)}-${Math.min(winsA, winsB)}`

    let modelProbA: number | null = null
    let baselineProbA: number | null = null
    let predictedWinner: string | null = null
    let correct: boolean | null = null
    let predictionSource: PredictionSource = 'retrospective'
    let model: PrematchModelOdds | null = null

    if (holdout) {
      // Align holdout teamA/teamB to OE bucket orientation
      const holdoutAIsBucketA = teamMatchesCanonical(holdout.teamA, bucket.teamA)
      modelProbA = holdoutAIsBucketA ? holdout.modelProbA : 1 - holdout.modelProbA
      baselineProbA = holdoutAIsBucketA ? holdout.baselineProbA : 1 - holdout.baselineProbA
      predictedWinner = holdout.predictedWinner
      correct = teamMatchesCanonical(holdout.predictedWinner, winner)
      predictionSource = 'holdout'
    } else {
      model = scorePrematchClient(bucket.teamA, bucket.teamB, opts.region, opts.ratings)
      if (model.source !== 'unavailable') {
        modelProbA = model.winProbA
        predictedWinner = model.winProbA >= 0.5 ? bucket.teamA : bucket.teamB
        correct = teamMatchesCanonical(predictedWinner, winner)
        predictionSource = 'retrospective'
      }
    }

    const gameRows: PredictionLogGame[] = ordered.map((g, i) => ({
      gameId: g.id,
      gameNumber: i + 1,
      date: g.date,
      winner: g.winner,
      patch: patchForGame(g.id, catalog),
      teamAPerf: teamGamePerformanceScore(players, bucket.teamA, g.id, players),
      teamBPerf: teamGamePerformanceScore(players, bucket.teamB, g.id, players),
      playersA: playerScoresForSide(players, bucket.teamA, g.id, players),
      playersB: playerScoresForSide(players, bucket.teamB, g.id, players),
    }))

    rows.push({
      seriesId,
      seriesKey: seriesKeyStr,
      date: lastDate,
      league: league || sample.league || '—',
      patch: gameRows[gameRows.length - 1]?.patch ?? '—',
      teamA: bucket.teamA,
      teamB: bucket.teamB,
      winsA,
      winsB,
      winner,
      scoreLabel,
      modelProbA,
      baselineProbA,
      predictedWinner,
      correct,
      predictionSource,
      model,
      games: gameRows,
    })
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.seriesId.localeCompare(b.seriesId))
  return rows.slice(0, limit)
}

export function formatLogModelOdds(probA: number | null): string {
  if (probA == null || Number.isNaN(probA)) return '—'
  const a = Math.round(probA * 100)
  const b = 100 - a
  return `${a}–${b}`
}

let holdoutCache: HoldoutLogFile | null | undefined
let holdoutAt = 0

/** Fetch walk-forward holdout ledger (true pre-series model probs). */
export async function fetchPredictionHoldoutLog(force = false): Promise<HoldoutLogFile | null> {
  const now = Date.now()
  if (!force && holdoutCache !== undefined && now - holdoutAt < 5 * 60_000) {
    return holdoutCache
  }
  try {
    const url = `${import.meta.env.BASE_URL}data/prediction_holdout_log.json`
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) {
      holdoutCache = null
      holdoutAt = now
      return null
    }
    holdoutCache = (await res.json()) as HoldoutLogFile
    holdoutAt = now
    return holdoutCache
  } catch {
    holdoutCache = null
    holdoutAt = now
    return null
  }
}
