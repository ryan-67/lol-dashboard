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
  split: string
  leagues: string[]
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
 * Fetch only the slices for the active split + leagues (1–4 rows with jsonb).
 * On-demand loads stay small and avoid statement timeouts from bulk selects.
 */
export async function fetchOESlices({
  split,
  leagues,
}: FetchOESlicesParams): Promise<OESliceRow[]> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart the dev server.',
    )
  }

  if (!split || !leagues.length) {
    return []
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('split, league, data, updated_at')
    .eq('split', split)
    .in('league', leagues)

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as OESliceRow[]).sort((a, b) => a.league.localeCompare(b.league))
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
