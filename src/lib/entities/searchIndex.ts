import type { Player } from '../../hooks/useDashboardData'
import type { OEStoreMeta } from '../mergeSlices'
import { TIER1_LEAGUES, splitSortKey } from '../mergeSlices'
import { buildStoreFromSliceRows, fetchOESlices } from '../loadOEStore'
import { mergeSlices } from '../mergeSlices'
import { buildPlayerSearchSlug } from './resolvers'
import { championSlug, resolveTeamCanonicalName, teamSlugFromName } from './slugs'
import { TEAM_ENTITIES, teamSearchAbbreviation } from './entityMap'

export type EntitySearchType = 'player' | 'team' | 'champion'

export interface EntitySearchEntry {
  type: EntitySearchType
  slug: string
  label: string
  searchText: string
  meta?: string
}

let cachedIndex: EntitySearchEntry[] | null = null
let cacheCatalogStamp: string | null = null
let cachePromise: Promise<EntitySearchEntry[]> | null = null

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function splitsNewestFirst(splits: string[]): string[] {
  return [...splits].sort((a, b) => {
    const ka = splitSortKey(a)
    const kb = splitSortKey(b)
    if (ka[0] !== kb[0]) return kb[0] - ka[0]
    if (ka[1] !== kb[1]) return kb[1] - ka[1]
    return kb[2].localeCompare(ka[2])
  })
}

function latestGameDate(player: Player): string {
  const dates = (player.gameLog ?? []).map((g) => g.date).filter(Boolean)
  if (!dates.length) return ''
  return dates.reduce((max, d) => (d > max ? d : max))
}

function compareSplitRecency(a: string, b: string): number {
  const ka = splitSortKey(a)
  const kb = splitSortKey(b)
  if (ka[0] !== kb[0]) return ka[0] - kb[0]
  if (ka[1] !== kb[1]) return ka[1] - kb[1]
  return ka[2].localeCompare(kb[2])
}

function isMoreRecentPlayer(
  candidate: { latestDate: string; split: string },
  current: { latestDate: string; split: string },
): boolean {
  if (candidate.latestDate !== current.latestDate) {
    return candidate.latestDate > current.latestDate
  }
  return compareSplitRecency(candidate.split, current.split) > 0
}

function playerMeta(player: Player): string {
  const abbr = teamSearchAbbreviation(player.team)
  return `${abbr} ${player.league}`
}

function playerSearchText(player: Player): string {
  const abbr = teamSearchAbbreviation(player.team)
  const canonical = resolveTeamCanonicalName(player.team)
  return normalizeSearch(`${player.name} ${player.team} ${canonical} ${abbr} ${player.league}`)
}

export async function buildEntitySearchIndex(catalog: OEStoreMeta): Promise<EntitySearchEntry[]> {
  if (cachedIndex && cacheCatalogStamp === catalog.generated_at) return cachedIndex
  if (cachePromise && cacheCatalogStamp === catalog.generated_at) return cachePromise

  cacheCatalogStamp = catalog.generated_at
  cachedIndex = null

  cachePromise = (async () => {
    const playerBest = new Map<string, { player: Player; split: string; latestDate: string }>()
    const teamBest = new Map<string, { entry: EntitySearchEntry; split: string }>()
    const championMap = new Map<string, EntitySearchEntry>()

    for (const split of splitsNewestFirst(catalog.splits)) {
      const rows = await fetchOESlices({
        leagues: [...TIER1_LEAGUES],
        years: [split.split(' ', 1)[0] ?? '2026'],
        splits: [split],
        catalogSplits: catalog.splits,
      })
      const store = buildStoreFromSliceRows(catalog, rows)
      const data = mergeSlices(store, 'All Tier 1', split)

      for (const player of data.players) {
        const latestDate = latestGameDate(player)
        const candidate = { player, split, latestDate }
        const existing = playerBest.get(player.name)
        if (!existing || isMoreRecentPlayer(candidate, existing)) {
          playerBest.set(player.name, candidate)
        }
      }

      for (const team of data.teams) {
        const slug = teamSlugFromName(team.name)
        const existing = teamBest.get(slug)
        const abbr = teamSearchAbbreviation(team.name)
        const entry: EntitySearchEntry = {
          type: 'team',
          slug,
          label: resolveTeamCanonicalName(team.name),
          searchText: normalizeSearch(`${team.name} ${abbr} ${team.league}`),
          meta: team.league,
        }
        if (!existing || compareSplitRecency(split, existing.split) > 0) {
          teamBest.set(slug, { entry, split })
        }
      }

      for (const champ of data.champions) {
        const slug = championSlug(champ.name)
        if (!championMap.has(slug)) {
          championMap.set(slug, {
            type: 'champion',
            slug,
            label: champ.name,
            searchText: normalizeSearch(champ.name),
          })
        }
      }
    }

    const currentPlayers = [...playerBest.values()].map((v) => v.player)
    const playerEntries: EntitySearchEntry[] = []
    for (const { player } of playerBest.values()) {
      const slug = buildPlayerSearchSlug(player, currentPlayers)
      playerEntries.push({
        type: 'player',
        slug,
        label: player.name,
        searchText: playerSearchText(player),
        meta: playerMeta(player),
      })
    }

    const teamEntries = [...teamBest.values()].map((v) => v.entry)

    const entries = [...playerEntries, ...teamEntries, ...championMap.values()]

    for (const team of TEAM_ENTITIES) {
      const existing = entries.find((e) => e.type === 'team' && e.slug === team.slug)
      if (existing) {
        for (const abbr of team.abbreviations) {
          existing.searchText += normalizeSearch(abbr)
        }
      }
    }

    cachedIndex = entries.sort((a, b) => a.label.localeCompare(b.label))
    return cachedIndex
  })()

  return cachePromise
}

export function searchEntities(index: EntitySearchEntry[], query: string, limit = 12): EntitySearchEntry[] {
  const q = normalizeSearch(query.trim())
  if (!q) return []

  const scored = index
    .map((entry) => {
      const labelNorm = normalizeSearch(entry.label)
      let score = 0
      if (labelNorm === q) score = 100
      else if (labelNorm.startsWith(q)) score = 80
      else if (entry.searchText.includes(q)) score = 60
      else if (labelNorm.includes(q)) score = 40
      return { entry, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))

  const deduped: EntitySearchEntry[] = []
  const seen = new Set<string>()
  for (const { entry } of scored) {
    const key =
      entry.type === 'player'
        ? `player|${normalizeSearch(entry.label)}`
        : `${entry.type}|${entry.slug}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(entry)
    if (deduped.length >= limit) break
  }
  return deduped
}

export function entityPath(entry: EntitySearchEntry): string {
  return `/${entry.type}s/${entry.slug}`
}

export function clearEntitySearchCache() {
  cachedIndex = null
  cacheCatalogStamp = null
  cachePromise = null
}
