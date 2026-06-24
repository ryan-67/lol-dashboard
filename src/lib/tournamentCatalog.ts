import { slugify } from './entities/slugs'
import { splitSortKey } from './mergeSlices'

/** Official tournament segment names keyed by league + canonical season label. */
const LEAGUE_SEASON_NAMES: Record<
  string,
  Record<string, { regular: string; playoffs?: string }>
> = {
  LCK: {
    Winter: { regular: 'Cup' },
    Spring: { regular: 'Rounds 1-2', playoffs: 'Road to MSI' },
    Summer: { regular: 'Rounds 3-5', playoffs: 'Season Playoffs' },
  },
  LPL: {
    Spring: { regular: 'Split 1-2', playoffs: 'Split 1-2 Playoffs' },
    Summer: { regular: 'Split 3', playoffs: 'Split 3 Playoffs' },
  },
  LEC: {
    Winter: { regular: 'Versus Season' },
    Spring: { regular: 'Spring Split', playoffs: 'Spring Playoffs' },
    Summer: { regular: 'Summer Split', playoffs: 'Summer Playoffs' },
  },
  LCS: {
    Winter: { regular: 'Lock-In' },
    Spring: { regular: 'Spring Split', playoffs: 'Spring Playoffs' },
    Summer: { regular: 'Summer Split', playoffs: 'Summer Playoffs' },
  },
}

const INTERNATIONAL_SEASONS = new Set(['MSI', 'Worlds', 'First Stand'])

export type TournamentSegment = 'regular' | 'playoffs' | 'event'

export interface TournamentIdentity {
  id: string
  displayName: string
  league: string
  year: string
  season: string
  canonicalSplit: string
  segment: TournamentSegment
  sortKey: [number, number, number, number]
}

export function parseCanonicalSplit(canonicalSplit: string): { year: string; season: string } {
  const spaceIdx = canonicalSplit.indexOf(' ')
  if (spaceIdx < 0) return { year: canonicalSplit, season: '' }
  return {
    year: canonicalSplit.slice(0, spaceIdx),
    season: canonicalSplit.slice(spaceIdx + 1),
  }
}

export function resolveTournamentDisplay(
  league: string | undefined,
  canonicalSplit: string | undefined,
  playoffs?: boolean,
): string {
  if (!canonicalSplit) return '—'
  const { year, season } = parseCanonicalSplit(canonicalSplit)
  if (!season) return canonicalSplit

  if (INTERNATIONAL_SEASONS.has(season)) {
    return `${year} ${season}`
  }

  const lg = league ?? ''
  const config = LEAGUE_SEASON_NAMES[lg]?.[season]
  if (!config) {
    const suffix = playoffs ? 'Playoffs' : season
    return lg ? `${year} ${lg} ${suffix}` : `${year} ${suffix}`
  }

  const segmentName = playoffs && config.playoffs ? config.playoffs : config.regular
  return `${year} ${lg} ${segmentName}`
}

function segmentOrder(segment: TournamentSegment): number {
  if (segment === 'regular') return 0
  if (segment === 'playoffs') return 1
  return 2
}

export function buildTournamentIdentity(
  league: string,
  canonicalSplit: string,
  playoffs: boolean,
): TournamentIdentity {
  const { year, season } = parseCanonicalSplit(canonicalSplit)
  const international = INTERNATIONAL_SEASONS.has(season)
  const segment: TournamentSegment = international ? 'event' : playoffs ? 'playoffs' : 'regular'
  const displayLeague = international ? season : league
  const displayName = resolveTournamentDisplay(league, canonicalSplit, playoffs)
  const [y, seasonOrd, seasonName] = splitSortKey(canonicalSplit)

  const id = international
    ? slugify(`${year}-${season}`)
    : slugify(`${league}-${year}-${season}-${segment}`)

  return {
    id,
    displayName,
    league: displayLeague,
    year,
    season,
    canonicalSplit,
    segment,
    sortKey: [y, seasonOrd, segmentOrder(segment), seasonName.charCodeAt(0) ?? 0],
  }
}

export function compareTournamentIdentity(a: TournamentIdentity, b: TournamentIdentity): number {
  for (let i = 0; i < a.sortKey.length; i++) {
    if (a.sortKey[i] !== b.sortKey[i]) return a.sortKey[i]! - b.sortKey[i]!
  }
  return a.displayName.localeCompare(b.displayName)
}

export function tournamentPath(id: string): string {
  return `/tournaments/${id}`
}

/** Adjacent tournaments in the same competitive year (for entity page header). */
export function sequentialTournamentNeighbors(
  all: TournamentIdentity[],
  currentId: string,
): { prev: TournamentIdentity | null; next: TournamentIdentity | null } {
  const sameLeagueYear = (t: TournamentIdentity, cur: TournamentIdentity) =>
    t.league === cur.league && t.year === cur.year

  const current = all.find((t) => t.id === currentId)
  if (!current) return { prev: null, next: null }

  const chain = all
    .filter((t) => sameLeagueYear(t, current))
    .sort(compareTournamentIdentity)

  const idx = chain.findIndex((t) => t.id === currentId)
  return {
    prev: idx > 0 ? chain[idx - 1]! : null,
    next: idx >= 0 && idx < chain.length - 1 ? chain[idx + 1]! : null,
  }
}
