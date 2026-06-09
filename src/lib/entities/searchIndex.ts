import type { OEStoreMeta } from '../mergeSlices'
import { TIER1_LEAGUES } from '../mergeSlices'
import { buildStoreFromSliceRows, fetchOESlices } from '../loadOEStore'
import { mergeSlices } from '../mergeSlices'
import { buildPlayerSearchSlug } from './resolvers'
import { championSlug, teamSlugFromName } from './slugs'
import { TEAM_ENTITIES } from './entityMap'

export type EntitySearchType = 'player' | 'team' | 'champion'

export interface EntitySearchEntry {
  type: EntitySearchType
  slug: string
  label: string
  searchText: string
  meta?: string
}

let cachedIndex: EntitySearchEntry[] | null = null
let cachePromise: Promise<EntitySearchEntry[]> | null = null

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export async function buildEntitySearchIndex(catalog: OEStoreMeta): Promise<EntitySearchEntry[]> {
  if (cachedIndex) return cachedIndex
  if (cachePromise) return cachePromise

  cachePromise = (async () => {
    const entries: EntitySearchEntry[] = []
    const seen = new Set<string>()

    for (const split of catalog.splits) {
      const rows = await fetchOESlices({ split, leagues: [...TIER1_LEAGUES] })
      const store = buildStoreFromSliceRows(catalog, rows)
      const data = mergeSlices(store, 'All Tier 1', split)

      for (const player of data.players) {
        const slug = buildPlayerSearchSlug(player, data.players)
        const key = `player|${slug}`
        if (seen.has(key)) continue
        seen.add(key)
        entries.push({
          type: 'player',
          slug,
          label: player.name,
          searchText: normalizeSearch(`${player.name} ${player.team} ${player.league}`),
          meta: `${player.team} · ${player.league}`,
        })
      }

      for (const team of data.teams) {
        const slug = teamSlugFromName(team.name)
        const key = `team|${slug}`
        if (seen.has(key)) continue
        seen.add(key)
        entries.push({
          type: 'team',
          slug,
          label: team.name,
          searchText: normalizeSearch(`${team.name} ${team.league}`),
          meta: team.league,
        })
      }

      for (const champ of data.champions) {
        const slug = championSlug(champ.name)
        const key = `champion|${slug}`
        if (seen.has(key)) continue
        seen.add(key)
        entries.push({
          type: 'champion',
          slug,
          label: champ.name,
          searchText: normalizeSearch(champ.name),
        })
      }
    }

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
    const key = `${entry.type}|${entry.slug}`
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
  cachePromise = null
}
