import type { DashboardSlice, OEStoreMeta } from './mergeSlices'
import { GUEST_LEAGUE } from './mergeSlices'
import { expandSelectedLeagues } from './filterLabels'
import { resolveSplitLabelsForMerge } from './filterOptions'
import type { FetchOESlicesParams, OESliceRow } from './loadOEStore'
import { idbReadYearSlices, idbWriteYearSlices } from './oeShardIdb'

const MANIFEST_URL = `${import.meta.env.BASE_URL}data/oe_slices.json`

/** Single file or part list when a year exceeds Cloudflare's 25 MiB asset cap. */
export type YearShardRef = string | string[]

interface ShardManifest {
  meta: OEStoreMeta
  year_files: Record<string, YearShardRef>
}

interface YearShardPayload {
  slices: Record<string, DashboardSlice>
}

const manifestPromise: { current: Promise<ShardManifest | null> | null } = { current: null }
const yearSliceCache = new Map<string, Record<string, DashboardSlice>>()
const yearLoadInflight = new Map<string, Promise<Record<string, DashboardSlice>>>()

function resolveTargetSplits(
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

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function loadShardManifest(): Promise<ShardManifest | null> {
  if (!manifestPromise.current) {
    manifestPromise.current = fetchJson<ShardManifest>(MANIFEST_URL)
  }
  return manifestPromise.current
}

export async function shardsAreAvailable(): Promise<boolean> {
  const manifest = await loadShardManifest()
  return manifest != null && Object.keys(manifest.year_files ?? {}).length > 0
}

export function catalogFromShardManifest(manifest: ShardManifest): OEStoreMeta {
  return manifest.meta
}

function yearsForParams(years: string[], manifest: ShardManifest): string[] {
  if (years.includes('ALL')) return Object.keys(manifest.year_files)
  return years.filter((year) => manifest.year_files[year])
}

function filenamesForYear(ref: YearShardRef | undefined): string[] {
  if (!ref) return []
  return Array.isArray(ref) ? ref : [ref]
}

async function loadYearSlices(
  year: string,
  filenames: string[],
  stamp: string,
): Promise<Record<string, DashboardSlice>> {
  const memory = yearSliceCache.get(year)
  if (memory) return memory

  const pending = yearLoadInflight.get(year)
  if (pending) return pending

  const load = (async () => {
    const fromIdb = await idbReadYearSlices(year, stamp)
    if (fromIdb && Object.keys(fromIdb).length) {
      yearSliceCache.set(year, fromIdb)
      return fromIdb
    }

    const slices: Record<string, DashboardSlice> = {}
    const bodies = await Promise.all(
      filenames.map(async (filename) => {
        const url = `${import.meta.env.BASE_URL}data/${filename}`
        return fetchJson<YearShardPayload>(url)
      }),
    )
    for (const body of bodies) {
      if (body?.slices) Object.assign(slices, body.slices)
    }
    if (!Object.keys(slices).length) return {}

    yearSliceCache.set(year, slices)
    void idbWriteYearSlices(year, stamp, slices)
    return slices
  })()

  yearLoadInflight.set(year, load)
  try {
    return await load
  } finally {
    yearLoadInflight.delete(year)
  }
}

async function loadAllShardSlices(years: string[]): Promise<Record<string, DashboardSlice>> {
  const manifest = await loadShardManifest()
  if (!manifest) return {}

  const stamp = manifest.meta.generated_at
  const merged: Record<string, DashboardSlice> = {}

  for (const year of yearsForParams(years, manifest)) {
    const filenames = filenamesForYear(manifest.year_files[year])
    if (!filenames.length) continue
    const slices = await loadYearSlices(year, filenames, stamp)
    Object.assign(merged, slices)
  }

  return merged
}

export async function fetchOESlicesFromShards(params: FetchOESlicesParams): Promise<OESliceRow[] | null> {
  const manifest = await loadShardManifest()
  if (!manifest?.meta.splits?.length) return null

  const catalogSplits = params.catalogSplits ?? manifest.meta.splits
  const targetSplits = resolveTargetSplits(catalogSplits, params.years, params.splits)
  if (!targetSplits.length) return []

  const resolvedLeagues = new Set([...expandSelectedLeagues(params.leagues), GUEST_LEAGUE])
  const allSlices = await loadAllShardSlices(params.years)
  if (!Object.keys(allSlices).length) return null

  const stamp = manifest.meta.generated_at
  const rows: OESliceRow[] = []

  for (const split of targetSplits) {
    for (const league of resolvedLeagues) {
      const key = `${split}|${league}`
      const data = allSlices[key]
      if (data) {
        rows.push({ split, league, data, updated_at: stamp })
      }
    }
  }

  return rows.sort((a, b) => a.split.localeCompare(b.split) || a.league.localeCompare(b.league))
}

export async function fetchOESliceCatalogFromShards(): Promise<OEStoreMeta | null> {
  const manifest = await loadShardManifest()
  if (!manifest) return null
  return catalogFromShardManifest(manifest)
}

/** Clear in-memory shard cache (e.g. after manifest refresh). */
export function clearShardMemoryCache(): void {
  manifestPromise.current = null
  yearSliceCache.clear()
  yearLoadInflight.clear()
}

/** True when full year slices for `year` are already in memory (not just bootstrap). */
export function yearSlicesInMemory(year: string): boolean {
  return yearSliceCache.has(year)
}
