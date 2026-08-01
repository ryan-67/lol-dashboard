import {
  fetchRegionStrength,
  lookupTeamElo,
  type RegionStrengthBundle,
} from '../loadRegionStrength'
import {
  fetchPlayerRatings,
  RATING_ROLES,
  type PlayerRatingsBundle,
  type PlayerPowerRow,
} from '../loadPlayerRatings'
import { teamMatchesCanonical } from '../entities/slugs'
import { eloTo100, powerScoreTo100 } from '../scoreNormalize'
import type { CitoScheduleRow } from '../loadCitoSchedule'
import { resolveTournamentFormat } from '../tournamentFormat'

const ELO_SCALE = 400

export interface PrematchModelOdds {
  winProbA: number
  winProbB: number
  eloA: number | null
  eloB: number | null
  powerA: number | null
  powerB: number | null
  rosterPowerA: number | null
  rosterPowerB: number | null
  confidence: 'high' | 'medium' | 'low'
  source: 'elo' | 'elo+roster' | 'unavailable'
  /** series = pre-draft BoX; game = post-draft single-map */
  grain?: 'series' | 'game'
}

export type PredictionGrain = 'pre-draft-series' | 'post-draft-game'

export interface DualPredictionOdds {
  /** Pre-draft series win probability (Elo + roster). */
  series: PrematchModelOdds
  /** Post-draft individual game win probability when a locked draft is available. */
  game: PrematchModelOdds | null
  mode: PredictionGrain
}

export interface PredictionBoardRow {
  matchId: string
  scheduledAt: string | null
  teamA: string
  teamB: string
  league: string
  tournament: string
  formatLabel: string
  bestOf: number | null
  kalshiOdds: string
  model: PrematchModelOdds
}

function eloWinProb(eloA: number, eloB: number): number {
  const diff = eloA - eloB
  return 1 / (1 + Math.pow(10, -diff / ELO_SCALE))
}

function clamp01(n: number): number {
  return Math.max(0.02, Math.min(0.98, n))
}

function findElo(
  bundle: RegionStrengthBundle | null,
  teamName: string,
): { elo: number; deviation?: number } | null {
  const direct = lookupTeamElo(bundle, teamName)
  if (direct != null) {
    const row = bundle?.teams[teamName] ?? Object.entries(bundle?.teams ?? {}).find(
      ([name]) => teamMatchesCanonical(name, teamName),
    )?.[1]
    return { elo: direct, deviation: row?.ratingDeviation }
  }
  if (!bundle?.teams) return null
  for (const [name, row] of Object.entries(bundle.teams)) {
    if (teamMatchesCanonical(name, teamName)) {
      return { elo: row.rating, deviation: row.ratingDeviation }
    }
  }
  return null
}

function rosterRowsForTeam(
  ratings: PlayerRatingsBundle | null,
  teamName: string,
): PlayerPowerRow[] {
  if (!ratings) return []
  const out: PlayerPowerRow[] = []
  for (const role of RATING_ROLES) {
    const hit = ratings.roles[role]?.find((r) => teamMatchesCanonical(r.team, teamName))
    if (hit) out.push(hit)
  }
  return out
}

function meanPower(rows: PlayerPowerRow[]): number | null {
  if (!rows.length) return null
  return rows.reduce((s, r) => s + r.powerScore, 0) / rows.length
}

/**
 * Client-side pre-match probability from Component 1 team Elo, optionally
 * nudged by roster power (Component 3). Kalshi is never blended in.
 */
export function scorePrematchClient(
  teamA: string,
  teamB: string,
  region: RegionStrengthBundle | null,
  ratings: PlayerRatingsBundle | null,
): PrematchModelOdds {
  const hitA = findElo(region, teamA)
  const hitB = findElo(region, teamB)
  if (!hitA || !hitB) {
    return {
      winProbA: 0.5,
      winProbB: 0.5,
      eloA: hitA?.elo ?? null,
      eloB: hitB?.elo ?? null,
      powerA: hitA ? eloTo100(hitA.elo) : null,
      powerB: hitB ? eloTo100(hitB.elo) : null,
      rosterPowerA: null,
      rosterPowerB: null,
      confidence: 'low',
      source: 'unavailable',
    }
  }

  let pA = eloWinProb(hitA.elo, hitB.elo)
  const rosterA = rosterRowsForTeam(ratings, teamA)
  const rosterB = rosterRowsForTeam(ratings, teamB)
  const meanA = meanPower(rosterA)
  const meanB = meanPower(rosterB)
  let source: PrematchModelOdds['source'] = 'elo'

  if (meanA != null && meanB != null) {
    // Soft roster nudge — max ±4pp so Elo remains the primary signal.
    const rosterEdge = clamp01(0.5 + (meanA - meanB) * 0.35) - 0.5
    pA = clamp01(pA + rosterEdge * 0.08)
    source = 'elo+roster'
  } else {
    pA = clamp01(pA)
  }

  const maxDev = Math.max(hitA.deviation ?? 140, hitB.deviation ?? 140)
  const edge = Math.abs(pA - 0.5)
  let confidence: PrematchModelOdds['confidence'] = 'medium'
  if (maxDev < 110 && edge >= 0.08) confidence = 'high'
  else if (maxDev > 170 || edge < 0.04) confidence = 'low'

  return {
    winProbA: pA,
    winProbB: 1 - pA,
    eloA: hitA.elo,
    eloB: hitB.elo,
    powerA: eloTo100(hitA.elo),
    powerB: eloTo100(hitB.elo),
    rosterPowerA: meanA != null ? powerScoreTo100(meanA) : null,
    rosterPowerB: meanB != null ? powerScoreTo100(meanB) : null,
    confidence,
    source,
    grain: 'series',
  }
}

/**
 * Invert a BoX series win probability into an implied per-game win rate
 * (independent games, first-to-ceil(bo/2) wins). Used as the post-draft game prior.
 */
export function seriesProbToGameProb(seriesProb: number, bestOf: number | null): number {
  const pSeries = clamp01(seriesProb)
  const bo = bestOf === 5 ? 5 : bestOf === 1 ? 1 : 3
  if (bo === 1) return pSeries

  const need = Math.ceil(bo / 2)
  // Binary search game win p such that P(win series) ≈ pSeries
  let lo = 0.05
  let hi = 0.95
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const got = seriesWinFromGame(mid, need, bo)
    if (got < pSeries) lo = mid
    else hi = mid
  }
  return clamp01((lo + hi) / 2)
}

function seriesWinFromGame(pGame: number, need: number, bestOf: number): number {
  // Enumerate decisive scorelines for Bo3/Bo5.
  let total = 0
  for (let losses = 0; losses < need; losses++) {
    const games = need + losses
    if (games > bestOf) break
    // Binomial: exactly `need` wins and `losses` losses, last game a win.
    const prior = games - 1
    const ways = binomial(prior, need - 1)
    total += ways * pGame ** need * (1 - pGame) ** losses
  }
  return total
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

/**
 * Post-draft individual-game odds: series-implied game prior, softly nudged when
 * blue/red side labels are known (full champ blend lives in agent-chat draft model).
 */
export function scorePostDraftGameClient(
  series: PrematchModelOdds,
  opts: {
    bestOf: number | null
    /** +1 if team A is on blue, -1 if on red, 0 unknown */
    sideBiasA?: number
    draftComplete?: boolean
  },
): PrematchModelOdds | null {
  if (!opts.draftComplete) return null
  if (series.source === 'unavailable') return null

  let pGame = seriesProbToGameProb(series.winProbA, opts.bestOf)
  // Tiny side nudge — blue historically slight edge in pro; keep ≤2pp.
  const side = opts.sideBiasA ?? 0
  if (side !== 0) pGame = clamp01(pGame + side * 0.015)

  return {
    ...series,
    winProbA: pGame,
    winProbB: 1 - pGame,
    confidence: series.confidence === 'high' ? 'medium' : series.confidence,
    source: series.source,
    grain: 'game',
  }
}

export function buildDualPredictionOdds(
  series: PrematchModelOdds,
  opts: {
    bestOf: number | null
    draftComplete?: boolean
    sideBiasA?: number
  },
): DualPredictionOdds {
  const game = scorePostDraftGameClient(series, opts)
  return {
    series,
    game,
    mode: game ? 'post-draft-game' : 'pre-draft-series',
  }
}

export function formatBestOfLabel(bestOf: number | null | undefined): string {
  if (bestOf === 1 || bestOf === 3 || bestOf === 5) return `Bo${bestOf}`
  if (typeof bestOf === 'number' && bestOf > 0) return `Bo${bestOf}`
  return '—'
}

export function resolveSeriesBestOf(row: CitoScheduleRow): number | null {
  if (typeof row.best_of === 'number' && row.best_of > 0) return row.best_of
  const format = resolveTournamentFormat({
    league: row.league,
    tournamentLabel: row.tournament_name,
    blockName: row.block_name,
  })
  return format?.defaultBestOf ?? null
}

export function tournamentDisplayName(row: CitoScheduleRow): string {
  return row.tournament_name?.trim() || row.block_name?.trim() || row.league
}

export async function buildPredictionBoard(
  rows: CitoScheduleRow[],
  opts?: { forceArtifacts?: boolean },
): Promise<PredictionBoardRow[]> {
  const [region, ratings] = await Promise.all([
    fetchRegionStrength({ force: opts?.forceArtifacts }),
    fetchPlayerRatings({ force: opts?.forceArtifacts }),
  ])
  return rows.map((row) => {
    const bestOf = resolveSeriesBestOf(row)
    return {
      matchId: row.match_id,
      scheduledAt: row.scheduled_at,
      teamA: row.team_a,
      teamB: row.team_b,
      league: row.league,
      tournament: tournamentDisplayName(row),
      formatLabel: formatBestOfLabel(bestOf),
      bestOf,
      kalshiOdds: '—',
      model: scorePrematchClient(row.team_a, row.team_b, region, ratings),
    }
  })
}

export function formatModelOdds(model: PrematchModelOdds): string {
  if (model.source === 'unavailable') return '—'
  const a = Math.round(model.winProbA * 100)
  const b = Math.round(model.winProbB * 100)
  return `${a}–${b}`
}
