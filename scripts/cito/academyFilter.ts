/** Shared academy / minor filter for Cito CI scripts (no browser deps). */

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

const ACADEMY_TEAM_RE = /\b(academy|challengers?|youth|ama)\b/i
const ACADEMY_CONTEXT_RE =
  /\b(academy|challengers?|lck\s*cl|lckc|ldl|lcs\.?a\b|youth|ama\b|development\s*league)\b/i

export function isAcademyOrMinor(opts: {
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

export function isTier1LeagueRow(opts: {
  teamA: string
  teamB: string
  league: string
  tournamentName?: string | null
  blockName?: string | null
}): boolean {
  if (isAcademyOrMinor(opts)) return false
  const code = opts.league.trim().toUpperCase()
  const domestics = new Set(['LCK', 'LPL', 'LEC', 'LCS', 'LTA', 'LTA N'])
  const intl = /msi|worlds|first\s*stand|ewc|esports\s*world\s*cup/i.test(
    `${opts.league} ${opts.tournamentName ?? ''} ${opts.blockName ?? ''}`,
  )
  return (
    domestics.has(opts.league) ||
    domestics.has(code) ||
    intl ||
    ['MSI', 'WLDS', 'FST', 'EWC', 'WORLDS', 'FIRST STAND'].includes(code)
  )
}
