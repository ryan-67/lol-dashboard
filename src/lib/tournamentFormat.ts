/**
 * Tournament / split format metadata for elimination and best-of context,
 * plus shared duration formatting used by tournament/series UI.
 *
 * Prefer live Cito `block_name` + `best_of` when present; this catalog fills gaps
 * when schedule rows lack strategy/block detail (common for some internationals).
 */

export function formatDurationMinSec(minutes: number | null): string {
  if (minutes == null || Number.isNaN(minutes)) return '—'
  const totalSec = Math.round(minutes * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export type EliminationStructure =
  | 'double_elim'
  | 'single_elim'
  | 'swiss'
  | 'groups'
  | 'round_robin'
  | 'unknown'

export interface TournamentFormat {
  /** Canonical label fragment, e.g. "MSI", "Worlds", "LCK Playoffs" */
  id: string
  structure: EliminationStructure
  /** Default series length when Cito strategy is missing */
  defaultBestOf: 1 | 3 | 5 | null
  /**
   * If true, a single series loss can send a team home (no lower bracket).
   * If false, upper-bracket / early losses typically continue elsewhere.
   */
  lossCanEliminateWithoutLower: boolean
  notes: string
}

const FORMATS: TournamentFormat[] = [
  {
    id: 'MSI',
    structure: 'double_elim',
    defaultBestOf: 5,
    lossCanEliminateWithoutLower: false,
    notes: 'MSI bracket stage is double-elimination (upper/lower). Play-in may eliminate.',
  },
  {
    id: 'Worlds',
    structure: 'swiss',
    defaultBestOf: 5,
    lossCanEliminateWithoutLower: true,
    notes: 'Worlds Swiss + single-elim knockout — no lower bracket in knockout.',
  },
  {
    id: 'First Stand',
    structure: 'single_elim',
    defaultBestOf: 5,
    lossCanEliminateWithoutLower: true,
    notes: 'First Stand is single-elimination style for most stages.',
  },
  {
    id: 'LCK Playoffs',
    structure: 'double_elim',
    defaultBestOf: 5,
    lossCanEliminateWithoutLower: false,
    notes: 'LCK playoffs use a double-elimination bracket.',
  },
  {
    id: 'LPL Playoffs',
    structure: 'double_elim',
    defaultBestOf: 5,
    lossCanEliminateWithoutLower: false,
    notes: 'LPL playoffs are typically double-elimination.',
  },
  {
    id: 'LEC Playoffs',
    structure: 'double_elim',
    defaultBestOf: 5,
    lossCanEliminateWithoutLower: false,
    notes: 'LEC playoffs are typically double-elimination.',
  },
  {
    id: 'LCS Playoffs',
    structure: 'double_elim',
    defaultBestOf: 5,
    lossCanEliminateWithoutLower: false,
    notes: 'LCS/LTA playoffs are typically double-elimination.',
  },
]

export function resolveTournamentFormat(opts: {
  league?: string | null
  tournamentLabel?: string | null
  split?: string | null
  playoffs?: boolean
  blockName?: string | null
}): TournamentFormat | null {
  const hay = [opts.league, opts.tournamentLabel, opts.split, opts.blockName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/\bmsi\b/.test(hay)) return FORMATS.find((f) => f.id === 'MSI') ?? null
  if (/\bworlds\b|\bwlds\b/.test(hay)) return FORMATS.find((f) => f.id === 'Worlds') ?? null
  if (/first\s*stand|\bfst\b/.test(hay)) return FORMATS.find((f) => f.id === 'First Stand') ?? null

  const playoffs = Boolean(opts.playoffs) || /playoffs?/i.test(hay)
  if (playoffs) {
    if (/\blck\b/.test(hay)) return FORMATS.find((f) => f.id === 'LCK Playoffs') ?? null
    if (/\blpl\b/.test(hay)) return FORMATS.find((f) => f.id === 'LPL Playoffs') ?? null
    if (/\blec\b/.test(hay)) return FORMATS.find((f) => f.id === 'LEC Playoffs') ?? null
    if (/\blcs\b|\blta\b/.test(hay)) return FORMATS.find((f) => f.id === 'LCS Playoffs') ?? null
  }

  return null
}

/** Infer whether a loss in this block/tournament implies elimination. */
export function lossImpliesElimination(opts: {
  bracket: string
  blockName?: string | null
  format: TournamentFormat | null
  loserContinues: boolean
}): boolean {
  if (opts.loserContinues) return false
  if (opts.bracket === 'upper') return false
  if (opts.bracket === 'play-in') return true
  if (opts.bracket === 'lower' || opts.bracket === 'grand-final') return true
  if (opts.bracket === 'final' && opts.format?.lossCanEliminateWithoutLower) return true
  if (opts.format?.structure === 'double_elim' && opts.bracket === 'unknown') {
    // Without block_name, do not assume elimination in double-elim events.
    return false
  }
  if (opts.format?.lossCanEliminateWithoutLower && opts.bracket !== 'unknown') return true
  return false
}
