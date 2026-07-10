/**
 * Cross-check OE-derived series scores against CitoAPI / lolesports schedule rows.
 *
 * OE CSVs can lag mid-series (e.g. only 2 games of a Bo5 landed when the refresh ran),
 * which made `isSeriesComplete` treat a 2-0 as a finished Bo3. Cito schedule scores +
 * status are the authoritative live source for completed series results.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient'
import { teamsShareEsportsSlug } from './entities/assets'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
import { daysBetween, isValidSeriesScore } from './seriesGrouping'
import { recapTeamTag } from './recapTeamTag'

export interface CitoSeriesResult {
  matchId: string
  league: string
  tournamentName: string | null
  blockName: string | null
  teamA: string
  teamB: string
  scheduledAt: string | null
  status: string
  scoreA: number | null
  scoreB: number | null
  winnerTeam: string | null
  bestOf: number | null
}

export type BracketKind = 'upper' | 'lower' | 'play-in' | 'grand-final' | 'final' | 'unknown'

export interface ResolvedSeriesScore {
  winsA: number
  winsB: number
  winner: string
  loser: string
  score: string
  complete: boolean
  source: 'oe' | 'cito'
  blockName: string | null
  bracket: BracketKind
  bestOf: number | null
  /** True when OE looked finished but Cito says the series is still live / incomplete. */
  provisional: boolean
  /** Skip from "completed series" surfaces (weekly recap, series lists). */
  skipCompleted: boolean
  cito: CitoSeriesResult | null
}

const COMPLETED_STATUS = new Set(['completed', 'finished', 'done', 'complete'])
const IN_PROGRESS_STATUS = new Set([
  'live',
  'inprogress',
  'in_progress',
  'in-progress',
  'started',
  'ongoing',
])

function normalizeStatus(status: string): string {
  return (status ?? '').trim().toLowerCase().replace(/\s+/g, '_')
}

function teamMatches(a: string, b: string): boolean {
  if (!a?.trim() || !b?.trim()) return false
  return (
    teamMatchesCanonical(a, b) ||
    teamMatchesCanonical(b, a) ||
    teamsShareEsportsSlug(a, b) ||
    resolveTeamCanonicalName(a).toLowerCase() === resolveTeamCanonicalName(b).toLowerCase()
  )
}

/** 2-0 / 2-1 can be a finished Bo3 OR an incomplete Bo5 — needs external confirmation. */
export function isProvisionalSeriesScore(winsA: number, winsB: number): boolean {
  const max = Math.max(winsA, winsB)
  const min = Math.min(winsA, winsB)
  return max === 2 && min <= 1
}

export function inferBracketKind(blockName: string | null | undefined): BracketKind {
  const hay = (blockName ?? '').toLowerCase()
  if (!hay.trim()) return 'unknown'
  if (/grand\s*final|championship/.test(hay)) return 'grand-final'
  if (/play[\s-]?in|qualification|qualifiers?/.test(hay)) return 'play-in'
  if (/lower\s*bracket|losers?\s*bracket/.test(hay)) return 'lower'
  if (/upper\s*bracket|winners?\s*bracket/.test(hay)) return 'upper'
  if (/\bfinals?\b/.test(hay) && !/semi|quarter|swiss/.test(hay)) return 'final'
  return 'unknown'
}

function dateOnly(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/**
 * Find the best Cito schedule row for an OE series (same two teams, date within ±2 days).
 */
export function matchCitoSeriesResult(
  teamA: string,
  teamB: string,
  seriesDate: string,
  results: CitoSeriesResult[],
): CitoSeriesResult | null {
  const target = dateOnly(seriesDate)
  let best: { row: CitoSeriesResult; dist: number } | null = null

  for (const row of results) {
    const aMatch =
      (teamMatches(teamA, row.teamA) && teamMatches(teamB, row.teamB)) ||
      (teamMatches(teamA, row.teamB) && teamMatches(teamB, row.teamA))
    if (!aMatch) continue

    const rowDate = dateOnly(row.scheduledAt)
    if (!rowDate) continue
    const dist = daysBetween(target, rowDate)
    if (dist > 2) continue
    if (!best || dist < best.dist) best = { row, dist }
  }

  return best?.row ?? null
}

function scoresFromCito(
  row: CitoSeriesResult,
  teamA: string,
): { winsA: number; winsB: number } | null {
  if (typeof row.scoreA !== 'number' || typeof row.scoreB !== 'number') return null
  if (teamMatches(teamA, row.teamA)) {
    return { winsA: row.scoreA, winsB: row.scoreB }
  }
  if (teamMatches(teamA, row.teamB)) {
    return { winsA: row.scoreB, winsB: row.scoreA }
  }
  return null
}

/**
 * Resolve the display/recap score for a series, preferring Cito when available.
 */
export function resolveSeriesScoreWithCito(
  teamA: string,
  teamB: string,
  oeWinsA: number,
  oeWinsB: number,
  seriesDate: string,
  results: CitoSeriesResult[],
  opts?: { international?: boolean; defaultBestOf?: number | null },
): ResolvedSeriesScore {
  const provisionalOe = isProvisionalSeriesScore(oeWinsA, oeWinsB)
  const cito = matchCitoSeriesResult(teamA, teamB, seriesDate, results)
  const bracket = inferBracketKind(cito?.blockName)
  const status = cito ? normalizeStatus(cito.status) : ''
  const bestOf = cito?.bestOf ?? opts?.defaultBestOf ?? null

  const pickWinner = (wA: number, wB: number) => {
    const winner = wA >= wB ? teamA : teamB
    const loser = winner === teamA ? teamB : teamA
    return {
      winsA: wA,
      winsB: wB,
      winner: resolveTeamCanonicalName(winner),
      loser: resolveTeamCanonicalName(loser),
      score: `${Math.max(wA, wB)}-${Math.min(wA, wB)}`,
    }
  }

  const base = {
    blockName: cito?.blockName ?? null,
    bracket,
    bestOf,
    cito,
  }

  if (cito) {
    const mapped = scoresFromCito(cito, teamA)
    const inProgress = IN_PROGRESS_STATUS.has(status)
    const completed = COMPLETED_STATUS.has(status)

    if (inProgress) {
      const live = mapped ?? { winsA: oeWinsA, winsB: oeWinsB }
      return {
        ...pickWinner(live.winsA, live.winsB),
        ...base,
        complete: false,
        source: 'cito',
        provisional: true,
        skipCompleted: true,
      }
    }

    if (completed && mapped && isValidSeriesScore(mapped.winsA, mapped.winsB)) {
      const max = Math.max(mapped.winsA, mapped.winsB)
      // Cito "completed" with only 2 wins on a Bo5 is still not a finished series.
      if (bestOf === 5 && max < 3) {
        return {
          ...pickWinner(mapped.winsA, mapped.winsB),
          ...base,
          complete: false,
          source: 'cito',
          provisional: true,
          skipCompleted: true,
        }
      }
      return {
        ...pickWinner(mapped.winsA, mapped.winsB),
        ...base,
        complete: true,
        source: 'cito',
        provisional: false,
        skipCompleted: false,
      }
    }

    // Cito row exists but scores missing — if OE is provisional and best-of is 5, wait.
    if (provisionalOe && (bestOf === 5 || opts?.international)) {
      return {
        ...pickWinner(oeWinsA, oeWinsB),
        ...base,
        complete: false,
        source: 'oe',
        provisional: true,
        skipCompleted: true,
      }
    }
  }

  const oeMax = Math.max(oeWinsA, oeWinsB)

  // Definitive Bo5 finish from OE alone.
  if (oeMax === 3 && isValidSeriesScore(oeWinsA, oeWinsB)) {
    return {
      ...pickWinner(oeWinsA, oeWinsB),
      ...base,
      complete: true,
      source: 'oe',
      provisional: false,
      skipCompleted: false,
    }
  }

  // Provisional 2-x: never treat as complete for recaps without Cito Bo3 confirmation.
  if (provisionalOe) {
    const confirmedBo3 =
      bestOf === 3 ||
      (bestOf == null && !opts?.international && opts?.defaultBestOf === 3)
    if (!confirmedBo3) {
      return {
        ...pickWinner(oeWinsA, oeWinsB),
        ...base,
        complete: false,
        source: 'oe',
        provisional: true,
        skipCompleted: true,
      }
    }
  }

  return {
    ...pickWinner(oeWinsA, oeWinsB),
    ...base,
    complete: isValidSeriesScore(oeWinsA, oeWinsB),
    source: 'oe',
    provisional: false,
    skipCompleted: !isValidSeriesScore(oeWinsA, oeWinsB),
  }
}

/**
 * Recap blurbs must wait for series conclusion — never generate mid-series.
 * Requires a non-provisional, complete resolution (Cito completed and/or OE 3-x).
 */
export function isSeriesReadyForRecap(resolved: ResolvedSeriesScore): boolean {
  if (resolved.skipCompleted || resolved.provisional || !resolved.complete) return false
  const max = Math.max(resolved.winsA, resolved.winsB)
  const min = Math.min(resolved.winsA, resolved.winsB)
  if (max === 3 && min <= 2) return true
  if (max === 2 && min <= 1) {
    // Bo3 terminal only when best-of is known to be 3 (or Cito completed without Bo5).
    if (resolved.bestOf === 5) return false
    if (resolved.source === 'cito' && resolved.cito) {
      const st = normalizeStatus(resolved.cito.status)
      return COMPLETED_STATUS.has(st) && resolved.bestOf !== 5
    }
    return resolved.bestOf === 3
  }
  return false
}

/** Live score label for series pages (never implies a false final when in progress). */
export function formatSeriesScoreLabel(opts: {
  teamA: string
  teamB: string
  winsA: number
  winsB: number
  inProgress: boolean
  bestOf: number | null
}): string {
  const live = `${recapTeamTag(opts.teamA)} ${opts.winsA}-${opts.winsB} ${recapTeamTag(opts.teamB)}`
  const bo = opts.bestOf ? `Bo${opts.bestOf}` : null
  if (opts.inProgress) {
    return bo ? `${live} · in progress (${bo})` : `${live} · in progress`
  }
  return bo ? `${live} (${bo})` : live
}

export function isInternationalLeague(league: string | null | undefined): boolean {
  const u = (league ?? '').toUpperCase()
  return ['MSI', 'WLDS', 'WORLDS', 'FST', 'FIRST STAND'].includes(u)
}

/**
 * Load recent Cito schedule rows (completed + live) for series score verification.
 */
export async function fetchCitoSeriesResults(options?: {
  sinceDays?: number
  limit?: number
}): Promise<CitoSeriesResult[]> {
  if (!isSupabaseConfigured) return []

  const sinceDays = options?.sinceDays ?? 45
  const limit = options?.limit ?? 500
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - sinceDays)

  const { data, error } = await supabase
    .from('cito_schedules')
    .select(
      'match_id, league, tournament_name, team_a, team_b, scheduled_at, status, block_name, team_a_score, team_b_score, winner_team, best_of',
    )
    .gte('scheduled_at', since.toISOString())
    .order('scheduled_at', { ascending: false })
    .limit(limit)

  if (error) {
    // best_of column may not exist yet — retry without it.
    if (/best_of/i.test(error.message)) {
      const retry = await supabase
        .from('cito_schedules')
        .select(
          'match_id, league, tournament_name, team_a, team_b, scheduled_at, status, block_name, team_a_score, team_b_score, winner_team',
        )
        .gte('scheduled_at', since.toISOString())
        .order('scheduled_at', { ascending: false })
        .limit(limit)
      if (retry.error) {
        console.warn('[cito-series] fetch failed', retry.error.message)
        return []
      }
      return mapRows(retry.data ?? [])
    }
    console.warn('[cito-series] fetch failed', error.message)
    return []
  }

  return mapRows(data ?? [])
}

function mapRows(rows: Array<Record<string, unknown>>): CitoSeriesResult[] {
  return rows.map((row) => ({
    matchId: String(row.match_id ?? ''),
    league: String(row.league ?? ''),
    tournamentName: (row.tournament_name as string | null) ?? null,
    blockName: (row.block_name as string | null) ?? null,
    teamA: String(row.team_a ?? ''),
    teamB: String(row.team_b ?? ''),
    scheduledAt: (row.scheduled_at as string | null) ?? null,
    status: String(row.status ?? ''),
    scoreA: typeof row.team_a_score === 'number' ? row.team_a_score : null,
    scoreB: typeof row.team_b_score === 'number' ? row.team_b_score : null,
    winnerTeam: (row.winner_team as string | null) ?? null,
    bestOf: typeof row.best_of === 'number' ? row.best_of : null,
  }))
}

/** Does this team have a later Cito fixture in the same tournament context? */
export function teamHasUpcomingInTournament(
  team: string,
  afterDate: string,
  tournamentLabel: string,
  results: CitoSeriesResult[],
): boolean {
  const after = dateOnly(afterDate)
  const tokens = tournamentLabel
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)

  for (const row of results) {
    const rowDate = dateOnly(row.scheduledAt)
    if (!rowDate || rowDate <= after) continue
    if (!teamMatches(team, row.teamA) && !teamMatches(team, row.teamB)) continue
    const hay = `${row.league} ${row.tournamentName ?? ''} ${row.blockName ?? ''}`.toLowerCase()
    const matchesTournament =
      tokens.length === 0 || tokens.some((t) => hay.includes(t)) || /msi|worlds|first\s*stand/.test(hay)
    if (!matchesTournament) continue
    const st = normalizeStatus(row.status)
    if (COMPLETED_STATUS.has(st) || IN_PROGRESS_STATUS.has(st) || st === 'scheduled' || st === 'unstarted') {
      return true
    }
  }
  return false
}
