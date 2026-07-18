import { slugify } from './entities/slugs'
import type { PlayerGameLog } from '../hooks/useDashboardData'
import { splitSortKey } from './mergeSlices'

/** Playoff display aliases when OE reuses the regular-season raw split label (e.g. LCK Rounds 1-2). */
const LEAGUE_SEASON_NAMES: Record<
  string,
  Record<string, { regular: string; playoffs?: string }>
> = {
  LCK: {
    Winter: { regular: 'Cup' },
    Spring: { regular: 'Rounds 1-2', playoffs: 'Road to MSI' },
    Summer: { regular: 'Rounds 3-5', playoffs: 'Season Playoffs' },
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

export const INTERNATIONAL_SEASONS = new Set(['MSI', 'Worlds', 'First Stand', 'EWC'])

export function isInternationalSeason(season: string): boolean {
  return INTERNATIONAL_SEASONS.has(season)
}

export type TournamentSegment = 'regular' | 'playoffs' | 'event'

export interface TournamentIdentity {
  id: string
  displayName: string
  league: string
  year: string
  season: string
  rawSplit: string
  playoffs: boolean
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

function inferFallbackRawSplit(league: string, canonicalSplit: string, playoffs: boolean): string {
  const { season } = parseCanonicalSplit(canonicalSplit)
  if (INTERNATIONAL_SEASONS.has(season)) return season
  const config = LEAGUE_SEASON_NAMES[league]?.[season]
  if (!config) return season || canonicalSplit
  if (playoffs && config.playoffs) return config.playoffs
  return config.regular
}

function rawSplitMatchesConfigRegular(rawSplit: string, configRegular: string): boolean {
  return rawSplit.trim().toLowerCase() === configRegular.trim().toLowerCase()
}

function playoffDisplayName(
  league: string,
  year: string,
  season: string,
  rawSplit: string,
): string {
  const lg = league
  const config = LEAGUE_SEASON_NAMES[lg]?.[season]
  if (config?.playoffs && rawSplitMatchesConfigRegular(rawSplit, config.regular)) {
    return `${year} ${lg} ${config.playoffs}`
  }
  if (/playoffs?/i.test(rawSplit)) {
    return `${year} ${lg} ${rawSplit}`
  }
  return `${year} ${lg} ${rawSplit} Playoffs`
}

export function tournamentYearFromGame(game: Pick<PlayerGameLog, 'oeYear' | 'split'>): string {
  if (game.oeYear) return String(game.oeYear)
  return parseCanonicalSplit(game.split ?? '').year
}

/** Normalize OE raw split labels to tournament identity keys (playoff alias, INT events). */
export function normalizeTournamentRawSplit(
  league: string,
  canonicalSplit: string,
  rawSplit: string | undefined,
  playoffs: boolean,
): string {
  const trimmed = rawSplit?.trim()
  const { season } = parseCanonicalSplit(canonicalSplit)

  if (INTERNATIONAL_SEASONS.has(season)) return season

  if (playoffs) {
    const config = LEAGUE_SEASON_NAMES[league]?.[season]
    if (config?.playoffs && trimmed && rawSplitMatchesConfigRegular(trimmed, config.regular)) {
      return config.playoffs
    }
    if (config?.playoffs && !trimmed) return config.playoffs
  }

  if (trimmed) return trimmed
  return inferFallbackRawSplit(league, canonicalSplit, playoffs)
}

export function tournamentRawSplitFromGame(
  game: Pick<PlayerGameLog, 'league' | 'split' | 'rawSplit' | 'playoffs'>,
): string {
  return normalizeTournamentRawSplit(
    game.league ?? '',
    game.split ?? '',
    game.rawSplit,
    Boolean(game.playoffs),
  )
}

export function tournamentKey(
  league: string,
  year: string,
  rawSplit: string,
  playoffs: boolean,
): string {
  return `${league}|${year}|${rawSplit}|${playoffs ? 1 : 0}`
}

/** League label used in tournament identity keys (INT events use season name, not home region). */
export function tournamentDisplayLeagueFromGame(
  game: Pick<PlayerGameLog, 'league' | 'split'>,
): string {
  const { season } = parseCanonicalSplit(game.split ?? '')
  if (INTERNATIONAL_SEASONS.has(season)) return season
  return game.league ?? ''
}

export function tournamentKeyFromGame(game: PlayerGameLog): string {
  const { season } = parseCanonicalSplit(game.split ?? '')
  const international = INTERNATIONAL_SEASONS.has(season)
  return tournamentKey(
    tournamentDisplayLeagueFromGame(game),
    tournamentYearFromGame(game),
    tournamentRawSplitFromGame(game),
    international ? false : Boolean(game.playoffs),
  )
}

export function tournamentKeyFromIdentity(t: Pick<TournamentIdentity, 'league' | 'year' | 'rawSplit' | 'playoffs'>): string {
  return tournamentKey(t.league, t.year, t.rawSplit, t.playoffs)
}

export function resolveTournamentDisplay(
  league: string | undefined,
  canonicalSplit: string | undefined,
  playoffs?: boolean,
  opts?: { rawSplit?: string; oeYear?: string },
): string {
  if (!canonicalSplit) return '—'
  const { year: splitYear, season } = parseCanonicalSplit(canonicalSplit)
  const year = opts?.oeYear ?? splitYear
  if (!season) return canonicalSplit

  if (INTERNATIONAL_SEASONS.has(season)) {
    return `${year} ${season}`
  }

  const lg = league ?? ''
  const rawSplit = opts?.rawSplit?.trim() || inferFallbackRawSplit(lg, canonicalSplit, Boolean(playoffs))
  if (playoffs) {
    return playoffDisplayName(lg, year, season, rawSplit)
  }

  return `${year} ${lg} ${rawSplit}`
}

/** Derive a league logo key from a tournament display label (e.g. "2026 MSI" → MSI). */
export function leagueFromTournamentLabel(label: string | undefined): string | null {
  if (!label?.trim()) return null
  const match = label.trim().match(/^\d{4}\s+(.+)$/)
  if (!match) return null
  const rest = match[1]!
  if (rest.startsWith('MSI')) return 'MSI'
  if (rest.startsWith('EWC') || rest.startsWith('Esports World Cup')) return 'EWC'
  if (rest.startsWith('Worlds')) return 'Worlds'
  if (rest.startsWith('First Stand')) return 'First Stand'
  const tier1 = rest.split(/\s+/)[0]
  if (tier1 && ['LCK', 'LPL', 'LEC', 'LCS'].includes(tier1)) return tier1
  return null
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
  opts?: { rawSplit?: string; oeYear?: string },
): TournamentIdentity {
  const { year: splitYear, season } = parseCanonicalSplit(canonicalSplit)
  const year = opts?.oeYear ?? splitYear
  const international = INTERNATIONAL_SEASONS.has(season)
  const rawSplit = normalizeTournamentRawSplit(league, canonicalSplit, opts?.rawSplit, playoffs)
  const normalizedPlayoffs = international ? false : playoffs
  const segment: TournamentSegment = international ? 'event' : playoffs ? 'playoffs' : 'regular'
  const displayLeague = international ? season : league
  const displayName = resolveTournamentDisplay(league, canonicalSplit, playoffs, opts)
  const [y, seasonOrd, seasonName] = splitSortKey(canonicalSplit)

  const id = international
    ? slugify(`${year}-${season}`)
    : slugify(`${league}-${year}-${rawSplit}-${normalizedPlayoffs ? 'playoffs' : 'regular'}`)

  return {
    id,
    displayName,
    league: displayLeague,
    year,
    season,
    rawSplit,
    playoffs: normalizedPlayoffs,
    canonicalSplit,
    segment,
    sortKey: [y, seasonOrd, segmentOrder(segment), seasonName.charCodeAt(0) ?? 0],
  }
}

export function buildTournamentIdentityFromGame(game: PlayerGameLog): TournamentIdentity {
  return buildTournamentIdentity(game.league ?? '', game.split ?? '', Boolean(game.playoffs), {
    rawSplit: game.rawSplit,
    oeYear: game.oeYear,
  })
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
