/**
 * Cross-check OE-derived series scores against CitoAPI / lolesports schedule rows.
 *
 * OE CSVs can lag mid-series (e.g. only 2 games of a Bo5 landed when the refresh ran),
 * which made `isSeriesComplete` treat a 2-0 as a finished Bo3. Cito schedule scores +
 * status are the authoritative live source for completed series results.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { teamsShareEsportsSlug } from './entities/assets'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
import {
  isAcademyOrMinorTeamOrContext,
  isTier1PredictionRow,
} from './predictions/leagueFilter'
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

function isTbdTeam(name: string | null | undefined): boolean {
  return !name?.trim() || /^tbd$/i.test(name.trim()) || /^tba$/i.test(name.trim())
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

/**
 * When Leaguepedia/Cito still has TBD teams for a finals slot, match by date + finals block
 * so we still pick up best_of=5 (e.g. EWC Grand Final) before OE has all games.
 */
export function matchFinalsScheduleHint(
  seriesDate: string,
  results: CitoSeriesResult[],
  opts?: { league?: string | null; tournamentLabel?: string | null },
): CitoSeriesResult | null {
  const target = dateOnly(seriesDate)
  if (!target) return null
  let best: { row: CitoSeriesResult; dist: number } | null = null

  for (const row of results) {
    const bracket = inferBracketKind(row.blockName)
    if (bracket !== 'grand-final' && bracket !== 'final') continue
    const rowDate = dateOnly(row.scheduledAt)
    if (!rowDate) continue
    const dist = daysBetween(target, rowDate)
    if (dist > 1) continue

    const hay = `${row.league} ${row.tournamentName ?? ''}`.toLowerCase()
    const ctx = `${opts?.league ?? ''} ${opts?.tournamentLabel ?? ''}`.toLowerCase()
    const leagueOk =
      !opts?.league ||
      isInternationalContext({ league: row.league, tournamentLabel: row.tournamentName }) ||
      hay.includes((opts.league ?? '').toLowerCase()) ||
      ctx.split(/\s+/).some((t) => t.length > 2 && hay.includes(t))
    if (!leagueOk && !isInternationalContext({ league: row.league, tournamentLabel: row.tournamentName })) {
      continue
    }

    // Prefer TBD finals slots (pre-lock) or any finals on that day.
    const tbdSlot = isTbdTeam(row.teamA) || isTbdTeam(row.teamB)
    const score = dist + (tbdSlot ? 0 : 0.25)
    if (!best || score < best.dist) best = { row, dist: score }
  }

  return best?.row ?? null
}

/** Stage-aware best-of from block name (EWC GF = Bo5, groups/SF = Bo3, …). */
export function resolveStageBestOf(
  formatId: string | null | undefined,
  blockName: string | null | undefined,
): number | null {
  const hay = (blockName ?? '').toLowerCase()
  if (!hay) return null
  const bracket = inferBracketKind(blockName)
  if (bracket === 'grand-final') return 5
  if (bracket === 'final' && !/third|3rd|bronze/.test(hay)) return 5
  if (formatId === 'EWC') {
    if (/semi|quarter|group|swiss|play[\s-]?in|third|3rd/.test(hay)) return 3
  }
  return null
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
 * True when the scoreline already decides the series for the known format.
 * Schedule feeds often lag on status (still "in progress" at 0-2 Bo3).
 */
function seriesScoreClinches(
  winsA: number,
  winsB: number,
  bestOf: number | null,
  requiresThreeWins: boolean,
): boolean {
  if (!isValidSeriesScore(winsA, winsB)) return false
  const max = Math.max(winsA, winsB)
  if (requiresThreeWins || bestOf === 5) return max >= 3
  if (bestOf === 3) return max >= 2
  // Unknown best-of while status is still live: only 3-x is unambiguous.
  return max >= 3
}

/**
 * Resolve the display/recap score for a series, preferring Cito / external schedule when available.
 */
export function resolveSeriesScoreWithCito(
  teamA: string,
  teamB: string,
  oeWinsA: number,
  oeWinsB: number,
  seriesDate: string,
  results: CitoSeriesResult[],
  opts?: {
    international?: boolean
    defaultBestOf?: number | null
    formatId?: string | null
    league?: string | null
    tournamentLabel?: string | null
  },
): ResolvedSeriesScore {
  const provisionalOe = isProvisionalSeriesScore(oeWinsA, oeWinsB)
  const teamMatch = matchCitoSeriesResult(teamA, teamB, seriesDate, results)
  const finalsHint =
    teamMatch ??
    matchFinalsScheduleHint(seriesDate, results, {
      league: opts?.league,
      tournamentLabel: opts?.tournamentLabel,
    })
  const cito = teamMatch ?? finalsHint
  const bracket = inferBracketKind(cito?.blockName)
  const status = cito ? normalizeStatus(cito.status) : ''
  const international =
    Boolean(opts?.international) ||
    isInternationalContext({
      league: cito?.league ?? opts?.league,
      tournamentLabel: cito?.tournamentName ?? opts?.tournamentLabel,
      blockName: cito?.blockName,
    })
  const bestOf = effectiveBestOf({
    citoBestOf: cito?.bestOf,
    defaultBestOf: opts?.defaultBestOf,
    international,
    formatId: opts?.formatId ?? null,
    blockName: cito?.blockName ?? null,
  })
  const requiresThreeWins =
    bestOf === 5 || bracket === 'grand-final' || (bracket === 'final' && bestOf !== 3)

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
    cito: teamMatch,
  }

  if (cito && teamMatch) {
    const mapped = scoresFromCito(cito, teamA)
    const inProgress = IN_PROGRESS_STATUS.has(status)
    const completed = COMPLETED_STATUS.has(status)

    if (inProgress) {
      const live = mapped ?? { winsA: oeWinsA, winsB: oeWinsB }
      // Status lag: feed still says live after a clinching score (e.g. 0-2 Bo3).
      if (seriesScoreClinches(live.winsA, live.winsB, bestOf, requiresThreeWins)) {
        return {
          ...pickWinner(live.winsA, live.winsB),
          ...base,
          complete: true,
          source: 'cito',
          provisional: false,
          skipCompleted: false,
        }
      }
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
      // Bo5 / finals: schedule feeds often mark "completed" after each game day.
      if (requiresThreeWins && max < 3) {
        return {
          ...pickWinner(mapped.winsA, mapped.winsB),
          ...base,
          bestOf: bestOf ?? 5,
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

    // Schedule row exists but scores missing — wait when Bo5/finals or provisional intl.
    if (provisionalOe && (requiresThreeWins || (international && bestOf !== 3))) {
      return {
        ...pickWinner(oeWinsA, oeWinsB),
        ...base,
        bestOf: bestOf ?? (requiresThreeWins ? 5 : bestOf),
        complete: false,
        source: 'oe',
        provisional: true,
        skipCompleted: true,
      }
    }
  }

  // Finals hint without locked teams (TBD TBD) — still gate Bo5.
  if (!teamMatch && finalsHint && provisionalOe && requiresThreeWins) {
    return {
      ...pickWinner(oeWinsA, oeWinsB),
      ...base,
      bestOf: bestOf ?? 5,
      complete: false,
      source: 'oe',
      provisional: true,
      skipCompleted: true,
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

  // Provisional 2-x:
  // - Bo5 / grand final → always wait
  // - Explicit Bo3 (incl. EWC SF/groups) → accept
  // - Unknown best-of on international → wait
  if (provisionalOe) {
    if (requiresThreeWins || bestOf === 5) {
      return {
        ...pickWinner(oeWinsA, oeWinsB),
        ...base,
        bestOf: bestOf ?? 5,
        complete: false,
        source: 'oe',
        provisional: true,
        skipCompleted: true,
      }
    }
    if (bestOf === 3) {
      // confirmed Bo3 stage — fall through to complete
    } else if (international) {
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

  // Mid-Bo5 OE stubs (1-1, 2-2, 0-1, …) — wait for remaining games.
  if (!isValidSeriesScore(oeWinsA, oeWinsB) || (requiresThreeWins && oeMax < 3)) {
    return {
      ...pickWinner(oeWinsA, oeWinsB),
      ...base,
      complete: false,
      source: 'oe',
      provisional: true,
      skipCompleted: true,
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
 * Recap blurbs wait until the schedule confirms a concluded series.
 *
 * Workflow: ingest games → confirm Bo3/Bo5 from tier-1 schedule/split →
 * require a clinching completed score. Never treat a scheduled row with a
 * placeholder 2-0 as done. Never accept Bo5 2-x. Regular-season 3-x is invalid.
 */
export function isSeriesReadyForRecap(resolved: ResolvedSeriesScore): boolean {
  if (resolved.skipCompleted || resolved.provisional || !resolved.complete) return false
  const max = Math.max(resolved.winsA, resolved.winsB)
  const min = Math.min(resolved.winsA, resolved.winsB)
  if (max === 3 && min <= 2) {
    if (resolved.bestOf === 3) return false
    return resolved.bestOf === 5 || resolved.source === 'cito'
  }
  if (max === 2 && min <= 1) {
    if (resolved.bestOf === 5) return false
    if (resolved.bestOf === 3) return true
    // Null best-of: only when the schedule row itself confirmed completion.
    return resolved.source === 'cito' && Boolean(resolved.cito)
  }
  return false
}

/** Schedule row is actually finished — status completed + a clinching score. */
export function isCitoRowCompletedForRecap(row: CitoSeriesResult): boolean {
  const status = normalizeStatus(row.status)
  if (!COMPLETED_STATUS.has(status)) return false
  if (typeof row.scoreA !== 'number' || typeof row.scoreB !== 'number') return false
  return isValidSeriesScore(row.scoreA, row.scoreB)
}

/**
 * Box scores must cover every map in the resolved scoreline.
 * Extra games vs a 2-0 (e.g. 3 maps ingested, score still 2-0) means the score
 * is stale — wait until schedule/OE catch up to 2-1 / 2-0 with matching maps.
 */
export function recapHasFullSeriesEvidence(opts: {
  resolved: ResolvedSeriesScore
  oeGameCount: number
  citoBoxGameCount?: number
}): boolean {
  const needed = opts.resolved.winsA + opts.resolved.winsB
  if (needed < 2) return false
  const evidence = Math.max(opts.oeGameCount, opts.citoBoxGameCount ?? 0)
  if (evidence < needed) return false
  if (needed === 2 && evidence >= 3) return false
  return true
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
  const u = (league ?? '').toUpperCase().replace(/\s+/g, ' ')
  return [
    'MSI',
    'WLDS',
    'WORLDS',
    'FST',
    'FIRST STAND',
    'EWC',
    'ESPORTS WORLD CUP',
    'INT',
  ].includes(u)
}

/** True when league/split/block context is an international event (MSI games are often tagged LCK/LEC/…). */
export function isInternationalContext(opts: {
  league?: string | null
  split?: string | null
  tournamentLabel?: string | null
  blockName?: string | null
}): boolean {
  if (isInternationalLeague(opts.league)) return true
  const hay = [opts.league, opts.split, opts.tournamentLabel, opts.blockName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return /\bmsi\b|\bworlds\b|\bwlds\b|first\s*stand|\bfst\b|\bewc\b|esports\s*world\s*cup/.test(
    hay,
  )
}

/**
 * Resolve effective best-of.
 * Prefer stage (grand final → 5) and explicit schedule best_of; do NOT force every
 * international series to Bo5 (EWC groups/SF are Bo3).
 */
export function effectiveBestOf(opts: {
  citoBestOf?: number | null
  defaultBestOf?: number | null
  international?: boolean
  formatId?: string | null
  blockName?: string | null
}): number | null {
  const stage = resolveStageBestOf(opts.formatId, opts.blockName)
  if (stage != null) return stage

  const catalog = opts.defaultBestOf ?? null
  const cito = opts.citoBestOf ?? null

  // Catalog Bo5 (MSI / Worlds / playoffs) must win over a stale schedule best_of=3.
  if (catalog === 5) return 5
  if (cito != null) return cito
  if (catalog != null) return catalog

  // Unknown international without catalog/stage → assume Bo5 (safer for recaps).
  if (opts.international && opts.formatId !== 'EWC') return 5
  return null
}

/** Drop academy / challengers pollution nested under parent league IDs. */
export function filterTier1CitoSeriesResults(rows: CitoSeriesResult[]): CitoSeriesResult[] {
  return rows.filter((row) => {
    if (
      isAcademyOrMinorTeamOrContext({
        teamA: row.teamA,
        teamB: row.teamB,
        league: row.league,
        tournamentName: row.tournamentName,
        blockName: row.blockName,
      })
    ) {
      return false
    }
    return isTier1PredictionRow({
      match_id: row.matchId,
      league: row.league,
      tournament_name: row.tournamentName,
      team_a: row.teamA,
      team_b: row.teamB,
      scheduled_at: row.scheduledAt,
      status: row.status,
      block_name: row.blockName,
    })
  })
}

/**
 * Load recent Cito schedule rows (completed + live) for series score verification.
 * Pass `client` from Node/CI (service role) — browser callers omit it and use the anon client.
 *
 * The browser supabase client is loaded lazily so Node/CI scripts that pass `client`
 * never import it (avoids Node 20 WebSocket / missing anon-key issues).
 *
 * Results are academy-filtered (V3-1) so Hub/Board never list Challengers under LCK/LPL.
 */
export async function fetchCitoSeriesResults(options?: {
  sinceDays?: number
  limit?: number
  client?: SupabaseClient
  /** Include Leaguepedia external cache (EWC, etc.). Default true. */
  includeExternal?: boolean
  /** Skip academy/minor filter (audit scripts). Default false. */
  includeAcademy?: boolean
}): Promise<CitoSeriesResult[]> {
  let db: SupabaseClient | null = options?.client ?? null
  if (!db) {
    const { supabase, isSupabaseConfigured } = await import('./supabaseClient')
    if (!isSupabaseConfigured) {
      // Still try external schedule (EWC) when Supabase is unavailable.
      const externalOnly =
        options?.includeExternal === false ? [] : await loadExternalScheduleAsCitoResults()
      return options?.includeAcademy ? externalOnly : filterTier1CitoSeriesResults(externalOnly)
    }
    db = supabase
  }

  const sinceDays = options?.sinceDays ?? 45
  const limit = options?.limit ?? 500
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - sinceDays)

  let rows: CitoSeriesResult[] = []
  const { data, error } = await db
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
      const retry = await db
        .from('cito_schedules')
        .select(
          'match_id, league, tournament_name, team_a, team_b, scheduled_at, status, block_name, team_a_score, team_b_score, winner_team',
        )
        .gte('scheduled_at', since.toISOString())
        .order('scheduled_at', { ascending: false })
        .limit(limit)
      if (retry.error) {
        console.warn('[cito-series] fetch failed', retry.error.message)
      } else {
        rows = mapRows(retry.data ?? [])
      }
    } else {
      console.warn('[cito-series] fetch failed', error.message)
    }
  } else {
    rows = mapRows(data ?? [])
  }

  let merged = rows
  if (options?.includeExternal !== false) {
    const external = await loadExternalScheduleAsCitoResults()
    if (external.length) {
      // Prefer Cito/lolesports rows; fill gaps with Leaguepedia (EWC).
      const byId = new Map<string, CitoSeriesResult>()
      for (const row of external) byId.set(row.matchId, row)
      for (const row of rows) byId.set(row.matchId, row)
      merged = [...byId.values()]
    }
  }

  return options?.includeAcademy ? merged : filterTier1CitoSeriesResults(merged)
}

/** Map schedule-cache row shapes into CitoSeriesResult (browser or Node). */
export function mapExternalScheduleRows(
  rows: Array<Record<string, unknown>>,
): CitoSeriesResult[] {
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

/** Browser: load Leaguepedia external cache via fetch. */
export async function loadExternalScheduleAsCitoResults(): Promise<CitoSeriesResult[]> {
  try {
    const { fetchExternalScheduleRows } = await import('./loadExternalSchedule')
    const rows = await fetchExternalScheduleRows()
    return mapExternalScheduleRows(rows as unknown as Array<Record<string, unknown>>)
  } catch {
    return []
  }
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
  return Boolean(nextOpponentInContext(team, afterDate, tournamentLabel, results))
}

/**
 * Next opponent for `team` after `afterDate` within the same event context.
 * For regular season, matches by league (e.g. LCK) — not "lower bracket".
 * For bracket events, prefers same tournament name / block tokens.
 */
export function nextOpponentInContext(
  team: string,
  afterDate: string,
  tournamentLabel: string,
  results: CitoSeriesResult[],
): { opponent: string; date: string; blockName: string | null; tournamentName: string | null } | null {
  const after = dateOnly(afterDate)
  const label = tournamentLabel.toLowerCase()
  const isIntl = /\b(msi|worlds|wlds|first\s*stand|fst|ewc|esports\s*world\s*cup)\b/.test(label)
  const isPlayoffs = /\bplayoffs?\b/.test(label)
  const leagueToken = label.match(/\b(lck|lpl|lec|lcs|lta)\b/)?.[1] ?? null

  let best: {
    opponent: string
    date: string
    blockName: string | null
    tournamentName: string | null
  } | null = null

  for (const row of results) {
    const rowDate = dateOnly(row.scheduledAt)
    if (!rowDate || rowDate <= after) continue
    if (!teamMatches(team, row.teamA) && !teamMatches(team, row.teamB)) continue

    const hay = `${row.league} ${row.tournamentName ?? ''} ${row.blockName ?? ''}`.toLowerCase()
    let matches = false
    if (isIntl) {
      matches =
        /msi|worlds|first\s*stand|\bewc\b|esports\s*world\s*cup/.test(hay) ||
        (row.tournamentName ?? '').toLowerCase().includes(label.split(/\s+/).slice(-1)[0] ?? '')
    } else if (isPlayoffs) {
      matches = /\bplayoffs?\b/.test(hay) && (!leagueToken || hay.includes(leagueToken))
    } else if (leagueToken) {
      // Regular season: same league is enough (next week fixture).
      matches = hay.includes(leagueToken) || (row.league ?? '').toLowerCase().includes(leagueToken)
    } else {
      const tokens = label.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && t !== '2026' && t !== '2025')
      matches = tokens.some((t) => hay.includes(t))
    }
    if (!matches) continue

    const st = normalizeStatus(row.status)
    if (
      !(
        COMPLETED_STATUS.has(st) ||
        IN_PROGRESS_STATUS.has(st) ||
        st === 'scheduled' ||
        st === 'unstarted'
      )
    ) {
      continue
    }

    const opponent = teamMatches(team, row.teamA) ? row.teamB : row.teamA
    if (!best || rowDate < best.date) {
      best = {
        opponent,
        date: rowDate,
        blockName: row.blockName ?? null,
        tournamentName: row.tournamentName ?? null,
      }
    }
  }
  return best
}
