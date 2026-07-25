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

export function isInternationalScheduleLeague(row: CitoScheduleRow): boolean {
  const hay = `${row.league} ${row.tournament_name ?? ''} ${row.block_name ?? ''}`.toLowerCase()
  return (
    INTERNATIONAL_LEAGUE_CODES.has(row.league) ||
    /\bmsi\b|\bworlds\b|first\s*stand|esports\s*world\s*cup|\bewc\b/.test(hay)
  )
}

/** Tier-1 domestics + internationals (MSI, Worlds, EWC, First Stand, future). */
export function isTier1PredictionRow(row: CitoScheduleRow): boolean {
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
  if (filter === 'all') return isTier1PredictionRow(row)
  if (isInternationalScheduleLeague(row)) return false
  return DOMESTIC_CODES[filter].has(row.league)
}
