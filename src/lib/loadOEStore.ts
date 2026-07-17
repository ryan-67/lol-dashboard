import type { DashboardSlice, OEStore, OEStoreMeta } from './mergeSlices'
import { sliceKey, splitSortKey, TIER1_LEAGUES, GUEST_LEAGUE } from './mergeSlices'
import { expandSelectedLeagues } from './filterLabels'
import { resolveSplitLabelsForMerge } from './filterOptions'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import {
  fetchOESliceCatalogFromShards,
  fetchOESlicesFromShards,
} from './loadOEShards'

const TABLE = 'oe_slices'
const CATALOG_PAGE_SIZE = 1000
const SLICE_FETCH_CONCURRENCY = 4

export interface OESliceRow {
  split: string
  league: string
  data: DashboardSlice
  updated_at: string | null
}

export interface FetchOESlicesParams {
  leagues: string[]
  years: string[]
  splits: string[]
  catalogSplits?: string[]
}

export function resolveTargetSplits(
  catalogSplits: string[],
  years: string[],
  splits: string[],
): string[] {
  const allYears = years.includes('ALL')
  const allSplits = splits.includes('ALL')

  if (allSplits) {
    if (allYears) return [...catalogSplits]
    return catalogSplits.filter((s) => years.some((y) => s.startsWith(`${y} `)))
  }

  const expanded = new Set<string>()
  if (allYears) {
    for (const split of splits) {
      for (const label of resolveSplitLabelsForMerge(catalogSplits, undefined, split)) {
        expanded.add(label)
      }
    }
  } else {
    for (const year of years) {
      for (const split of splits) {
        for (const label of resolveSplitLabelsForMerge(catalogSplits, year, split)) {
          expanded.add(label)
        }
      }
    }
  }
  return [...expanded]
}

function buildMetaFromCatalogRows(
  rows: Array<{ split: string; league: string; updated_at: string | null }>,
): OEStoreMeta {
  // Only splits that have at least one tier-1 league slice belong in the filter
  // catalog. INT-only leftovers (e.g. a mis-bucketed guest "2026 Summer" with
  // FURIA) must not surface as selectable seasons or become the default.
  const tier1Splits = new Set<string>()
  const intlSplits = new Set<string>()
  const leagueSet = new Set<string>()
  let latestUpdated: string | null = null

  for (const row of rows) {
    if (row.league) leagueSet.add(row.league)
    if (row.updated_at && (!latestUpdated || row.updated_at > latestUpdated)) {
      latestUpdated = row.updated_at
    }
    if (!row.split) continue
    if ((TIER1_LEAGUES as readonly string[]).includes(row.league)) {
      tier1Splits.add(row.split)
    } else if (row.league === GUEST_LEAGUE) {
      intlSplits.add(row.split)
    }
  }

  // Keep international event labels (MSI / Worlds / First Stand) even when a
  // given year only has guest teams on that slice — still needed for Spring/
  // Winter combined groups — but never promote an INT-only *regional* season
  // (Summer/Spring/Winter) into the catalog.
  const REGIONAL = new Set(['Winter', 'Spring', 'Summer'])
  for (const split of intlSplits) {
    const season = split.includes(' ') ? split.slice(split.indexOf(' ') + 1) : split
    if (!REGIONAL.has(season)) tier1Splits.add(split)
  }

  const splits = [...tier1Splits].sort((a, b) => {
    const ka = splitSortKey(a)
    const kb = splitSortKey(b)
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2])
  })

  const leagues = TIER1_LEAGUES.filter((l) => leagueSet.has(l))

  return {
    source: "Oracle's Elixir",
    generated_at: latestUpdated ?? new Date().toISOString(),
    leagues: [...leagues],
    splits,
    schema_version: '2.1',
  }
}

/** Lightweight index of all split/league keys (no jsonb) for filter dropdowns. */
export async function fetchOESliceCatalog(): Promise<OEStoreMeta> {
  const fromShards = await fetchOESliceCatalogFromShards()
  if (fromShards) return fromShards

  if (!isSupabaseConfigured) {
    throw new Error('Dashboard data is unavailable.')
  }

  const rows = await fetchOESliceCatalogRows()
  if (!rows.length) {
    throw new Error('Dashboard data is unavailable.')
  }

  return buildMetaFromCatalogRows(rows)
}

async function fetchOESliceCatalogRows(): Promise<
  Array<{ split: string; league: string; updated_at: string | null }>
> {
  const rows: Array<{ split: string; league: string; updated_at: string | null }> = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('split, league, updated_at')
      .order('split', { ascending: true })
      .order('league', { ascending: true })
      .range(offset, offset + CATALOG_PAGE_SIZE - 1)

    if (error) {
      throw new Error(error.message)
    }

    const page = data ?? []
    rows.push(...page)
    if (page.length < CATALOG_PAGE_SIZE) break
    offset += CATALOG_PAGE_SIZE
  }

  return rows
}

async function fetchSingleOESlice(split: string, league: string): Promise<OESliceRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('split, league, data, updated_at')
    .eq('split', split)
    .eq('league', league)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.split || !data.league || !data.data) return null
  return data as OESliceRow
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index]!, index)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

/**
 * Fetch slices for active league/year/split filters (one jsonb row per request).
 */
export async function fetchOESlices({
  leagues,
  years,
  splits,
  catalogSplits,
}: FetchOESlicesParams): Promise<OESliceRow[]> {
  const fromShards = await fetchOESlicesFromShards({
    leagues,
    years,
    splits,
    catalogSplits,
  })
  if (fromShards !== null) return fromShards

  if (!isSupabaseConfigured) {
    throw new Error('Dashboard data is unavailable.')
  }

  if (!leagues.length || !catalogSplits?.length) {
    return []
  }

  const resolvedLeagues = [...new Set([...expandSelectedLeagues(leagues), GUEST_LEAGUE])]
  const targetSplits = resolveTargetSplits(catalogSplits, years, splits)
  if (!targetSplits.length) return []

  const sliceKeys: Array<{ split: string; league: string }> = []
  const SPLIT_KEY_BATCH = 20
  for (let i = 0; i < targetSplits.length; i += SPLIT_KEY_BATCH) {
    const splitBatch = targetSplits.slice(i, i + SPLIT_KEY_BATCH)
    const { data: keyRows, error: keysError } = await supabase
      .from(TABLE)
      .select('split, league')
      .in('split', splitBatch)
      .in('league', resolvedLeagues)

    if (keysError) {
      throw new Error(keysError.message)
    }

    for (const row of keyRows ?? []) {
      const split = String(row.split ?? '')
      const league = String(row.league ?? '')
      if (split && league) sliceKeys.push({ split, league })
    }
  }

  const loaded = await mapWithConcurrency(
    sliceKeys,
    SLICE_FETCH_CONCURRENCY,
    async ({ split, league }) => fetchSingleOESlice(split, league),
  )

  return loaded
    .filter((row): row is OESliceRow => row != null)
    .sort((a, b) => a.split.localeCompare(b.split) || a.league.localeCompare(b.league))
}

/** @deprecated use fetchOESlices with years/splits arrays */
export async function fetchOESlicesLegacy(params: {
  split: string
  leagues: string[]
  year?: string
  catalogSplits?: string[]
}): Promise<OESliceRow[]> {
  const years = params.year ? [params.year] : ['ALL']
  const splits = params.split === 'ALL' ? ['ALL'] : [params.split]
  return fetchOESlices({
    leagues: params.leagues,
    years,
    splits,
    catalogSplits: params.catalogSplits,
  })
}

export function buildStoreFromSliceRows(
  catalog: OEStoreMeta,
  rows: OESliceRow[],
): OEStore {
  const slices: OEStore['slices'] = {}
  let latestUpdated = catalog.generated_at

  for (const row of rows) {
    if (!row.split || !row.league || !row.data) continue
    slices[sliceKey(row.split, row.league)] = row.data
    if (row.updated_at && row.updated_at > latestUpdated) {
      latestUpdated = row.updated_at
    }
  }

  return {
    meta: { ...catalog, generated_at: latestUpdated },
    slices,
  }
}
