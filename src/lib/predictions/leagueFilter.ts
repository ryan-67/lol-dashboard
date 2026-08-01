import type { CitoScheduleRow } from '../loadCitoSchedule'

export type PredictionLeagueFilter = 'all' | 'LCK' | 'LPL' | 'LEC' | 'LCS'

export const PREDICTION_LEAGUE_FILTERS: { id: PredictionLeagueFilter; label: string }[] = [
  { id: 'all', label: 'All Tier-1' },
  { id: 'LCK', label: 'LCK' },
  { id: 'LPL', label: 'LPL' },
  { id: 'LEC', label: 'LEC' },
  { id: 'LCS', label: 'LCS' },
]

const DOMESTIC_CODES: Record<Exclude<PredictionLeagueFilter, 'all'>, Set<string>> = {
  LCK: new Set(['LCK']),
  LPL: new Set(['LPL']),
  LEC: new Set(['LEC']),
  // LTA / LTA N = 2025 NA rebrand of LCS. LTA S = CBLOL/LLA merge — NOT LCS.
  LCS: new Set(['LCS', 'LTA', 'LTA N']),
}

const INTERNATIONAL_LEAGUE_CODES = new Set([
  'MSI',
  'WLDs',
  'FST',
  'EWC',
  'Worlds',
  'First Stand',
  'Esports World Cup',
])

/** Non–tier-1 league codes sometimes mixed into Cito / external caches. */
const EXCLUDED_LEAGUE_CODES = new Set([
  'LCK CL',
  'LCKC',
  'LCK CHALLENGERS',
  'LCK AS',
  'LDL',
  'LCS.A',
  'LCS ACADEMY',
  'LEC ACADEMY',
  'CBLOL',
  'LLA',
  'PCS',
  'VCS',
  'LJL',
  'TCL',
  'LFL',
  'NLC',
  'LCO',
  'ARAM',
])

/** Academy / Challengers / Youth orgs — Riot often nests these under LCK/LPL schedule feeds. */
const ACADEMY_TEAM_RE = /\b(academy|challengers?|youth|ama)\b/i

/** Tournament / block / league context that is never main-roster tier-1. */
const ACADEMY_CONTEXT_RE =
  /\b(academy|challengers?|lck\s*cl|lckc|ldl|lcs\.?a\b|youth|ama\b|development\s*league)\b/i

/** Shared academy/minor check for schedule rows and Cito series-result shapes. */
export function isAcademyOrMinorTeamOrContext(opts: {
  teamA: string
  teamB: string
  league: string
  tournamentName?: string | null
  blockName?: string | null
}): boolean {
  if (ACADEMY_TEAM_RE.test(opts.teamA) || ACADEMY_TEAM_RE.test(opts.teamB)) return true
  const code = opts.league.trim().toUpperCase()
  if (EXCLUDED_LEAGUE_CODES.has(code)) return true
  const hay = `${opts.league} ${opts.tournamentName ?? ''} ${opts.blockName ?? ''}`
  return ACADEMY_CONTEXT_RE.test(hay)
}

export function isAcademyOrMinorScheduleRow(row: CitoScheduleRow): boolean {
  return isAcademyOrMinorTeamOrContext({
    teamA: row.team_a,
    teamB: row.team_b,
    league: row.league,
    tournamentName: row.tournament_name,
    blockName: row.block_name,
  })
}

export function isInternationalScheduleLeague(row: CitoScheduleRow): boolean {
  const hay = `${row.league} ${row.tournament_name ?? ''} ${row.block_name ?? ''}`.toLowerCase()
  return (
    INTERNATIONAL_LEAGUE_CODES.has(row.league) ||
    /\bmsi\b|\bworlds\b|first\s*stand|esports\s*world\s*cup|\bewc\b/.test(hay)
  )
}

/** Tier-1 domestics + internationals (MSI, Worlds, EWC, First Stand, future). */
export function isTier1PredictionRow(row: CitoScheduleRow): boolean {
  if (isAcademyOrMinorScheduleRow(row)) return false
  if (isInternationalScheduleLeague(row)) return true
  const code = row.league.trim().toUpperCase()
  return (
    DOMESTIC_CODES.LCK.has(row.league) ||
    DOMESTIC_CODES.LPL.has(row.league) ||
    DOMESTIC_CODES.LEC.has(row.league) ||
    DOMESTIC_CODES.LCS.has(row.league) ||
    code === 'LCK' ||
    code === 'LPL' ||
    code === 'LEC' ||
    code === 'LCS'
  )
}

export function matchesPredictionLeagueFilter(
  row: CitoScheduleRow,
  filter: PredictionLeagueFilter,
): boolean {
  if (!isTier1PredictionRow(row)) return false
  if (filter === 'all') return true
  if (isInternationalScheduleLeague(row)) return false
  return DOMESTIC_CODES[filter].has(row.league)
}
