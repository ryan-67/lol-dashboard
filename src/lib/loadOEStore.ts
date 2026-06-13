import type { DashboardSlice, OEStore, OEStoreMeta } from './mergeSlices'
import { sliceKey, splitSortKey, TIER1_LEAGUES } from './mergeSlices'
import { isSupabaseConfigured, supabase } from './supabaseClient'

const TABLE = 'oe_slices'

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

function resolveTargetSplits(
  catalogSplits: string[],
  years: string[],
  splits: string[],
): string[] {
  let result = catalogSplits
  const allYears = years.includes('ALL')
  const allSplits = splits.includes('ALL')

  if (!allYears) {
    result = result.filter((s) => years.some((y) => s.startsWith(`${y} `)))
  }
  if (!allSplits) {
    result = result.filter((s) => splits.includes(s))
  }
  return result
}

function buildMetaFromCatalogRows(
  rows: Array<{ split: string; league: string; updated_at: string | null }>,
): OEStoreMeta {
  const splitSet = new Set<string>()
  const leagueSet = new Set<string>()
  let latestUpdated: string | null = null

  for (const row of rows) {
    if (row.split) splitSet.add(row.split)
    if (row.league) leagueSet.add(row.league)
    if (row.updated_at && (!latestUpdated || row.updated_at > latestUpdated)) {
      latestUpdated = row.updated_at
    }
  }

  const splits = [...splitSet].sort((a, b) => {
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
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart the dev server.',
    )
  }

  const { data, error } = await supabase.from(TABLE).select('split, league, updated_at')

  if (error) {
    throw new Error(error.message)
  }

  const rows = data ?? []
  if (!rows.length) {
    throw new Error(
      'No rows in oe_slices. Run `python scripts/seed_supabase.py` to load dashboard data.',
    )
  }

  return buildMetaFromCatalogRows(rows)
}

/**
 * Fetch slices for active league/year/split filters (small batched jsonb load).
 */
export async function fetchOESlices({
  leagues,
  years,
  splits,
  catalogSplits,
}: FetchOESlicesParams): Promise<OESliceRow[]> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart the dev server.',
    )
  }

  if (!leagues.length || !catalogSplits?.length) {
    return []
  }

  const targetSplits = resolveTargetSplits(catalogSplits, years, splits)
  if (!targetSplits.length) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select('split, league, data, updated_at')
    .in('split', targetSplits)
    .in('league', leagues)

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as OESliceRow[]).sort(
    (a, b) => a.split.localeCompare(b.split) || a.league.localeCompare(b.league),
  )
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
