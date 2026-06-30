import type { LeagueFilter } from './types'

export const LEAGUE_FILTERS: LeagueFilter[] = ['ALL', 'LCK', 'LPL', 'LEC', 'LCS']

/** Tier-1 regional leagues that get their own filter tab. */
const TIER1: Record<Exclude<LeagueFilter, 'ALL'>, { slugs: string[]; names: string[] }> = {
  LCK: { slugs: ['lol-lck', 'lck'], names: ['lck'] },
  LPL: { slugs: ['lol-lpl', 'lpl'], names: ['lpl'] },
  LEC: { slugs: ['lol-lec', 'lec'], names: ['lec'] },
  LCS: { slugs: ['lol-lcs', 'lcs', 'lol-lta', 'lta', 'lta-n', 'lta-s'], names: ['lcs', 'lta'] },
}

/** International events shown only under the ALL filter. */
const INTERNATIONAL = {
  slugs: ['lol-msi', 'msi', 'lol-worlds', 'worlds', 'lol-first-stand', 'first-stand', 'first_stand'],
  names: ['msi', 'worlds', 'first stand', 'first-stand'],
}

function norm(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim()
}

export function isInternationalLeague(slug: string | null, name: string | null): boolean {
  const s = norm(slug)
  const n = norm(name)
  return INTERNATIONAL.slugs.includes(s) || INTERNATIONAL.names.some((m) => n.includes(m))
}

/** Which region tab a league belongs to, or null if it is not a tracked tier-1 region. */
export function regionForLeague(slug: string | null, name: string | null): Exclude<LeagueFilter, 'ALL'> | null {
  const s = norm(slug)
  const n = norm(name)
  for (const region of Object.keys(TIER1) as Array<Exclude<LeagueFilter, 'ALL'>>) {
    const cfg = TIER1[region]
    if (cfg.slugs.includes(s) || cfg.names.some((m) => n === m || n.includes(m))) {
      return region
    }
  }
  return null
}

/**
 * Whether a match belongs in the hub at all (tier-1 region OR international).
 * Minor / academy leagues are excluded from the Live hub.
 */
export function isTrackedLeague(slug: string | null, name: string | null): boolean {
  return regionForLeague(slug, name) !== null || isInternationalLeague(slug, name)
}

/** Whether a match passes the active league filter. */
export function matchesLeagueFilter(
  filter: LeagueFilter,
  slug: string | null,
  name: string | null,
): boolean {
  if (!isTrackedLeague(slug, name)) return false
  if (filter === 'ALL') return true
  return regionForLeague(slug, name) === filter
}
