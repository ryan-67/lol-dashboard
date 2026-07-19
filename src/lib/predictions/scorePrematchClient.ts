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
