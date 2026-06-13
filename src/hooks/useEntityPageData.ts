import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDashboard, DEFAULT_YEAR } from '../context/DashboardContext'
import { buildStoreFromSliceRows, fetchOESlices } from '../lib/loadOEStore'
import { mergeDataForFilters, type EntityFilterState } from '../lib/entities/resolvers'
import type { DashboardData } from '../hooks/useDashboardData'
import { leagueLabelToLeagues } from '../hooks/useDashboardData'
import { splitSortKey, type OEStore } from '../lib/mergeSlices'

async function findBestSplit(
  catalogSplits: string[],
  globalYear: string,
  globalSplit: string,
  league: string,
  catalog: NonNullable<ReturnType<typeof useDashboard>['catalog']>,
  hasData: (data: DashboardData) => boolean,
): Promise<{ filters: EntityFilterState; notice: string | null }> {
  const ordered = [
    globalSplit,
    ...catalogSplits.filter((s) => s.startsWith(`${globalYear} `) && s !== globalSplit),
    ...[...catalogSplits].sort((a, b) => {
      const ka = splitSortKey(a)
      const kb = splitSortKey(b)
      return kb[0] - ka[0] || kb[1] - ka[1] || kb[2].localeCompare(ka[2])
    }),
  ]

  const seen = new Set<string>()
  for (const split of ordered) {
    if (seen.has(split)) continue
    seen.add(split)
    const year = split.split(' ', 1)[0] ?? globalYear
    const rows = await fetchOESlices({
      leagues: leagueLabelToLeagues(league),
      years: [year],
      splits: [split],
      catalogSplits: catalog.splits,
    })
    const store = buildStoreFromSliceRows(catalog!, rows)
    const data = mergeDataForFilters(store, { league, year, split })
    if (hasData(data)) {
      const notice = split !== globalSplit ? `Showing ${split} — no data for ${globalSplit}` : null
      return { filters: { league, year, split }, notice }
    }
  }

  const fallback = catalogSplits[catalogSplits.length - 1] ?? globalSplit
  const year = fallback.split(' ', 1)[0] ?? globalYear
  return {
    filters: { league, year, split: fallback },
    notice: `Showing ${fallback} — limited data for this entity`,
  }
}

export function useEntityPageData(hasDataForSplit: (data: DashboardData) => boolean) {
  const {
    catalog,
    league: globalLeague,
    year: globalYear,
    split: globalSplit,
    leagues,
    years,
  } = useDashboard()

  const [filters, setFilters] = useState<EntityFilterState>({
    league: globalLeague,
    year: globalYear,
    split: globalSplit,
  })
  const [store, setStore] = useState<OEStore | null>(null)
  const [loading, setLoading] = useState(true)
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const splitsForYear = useMemo(() => {
    if (!catalog) return []
    if (filters.year === 'ALL') return catalog.splits
    return catalog.splits.filter((s) => s.startsWith(`${filters.year} `))
  }, [catalog, filters.year])

  useEffect(() => {
    if (!catalog) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { filters: chosen, notice } = await findBestSplit(
        catalog.splits,
        globalYear,
        globalSplit,
        globalLeague,
        catalog,
        hasDataForSplit,
      )
      if (cancelled) return
      setFilters(chosen)
      setFallbackNotice(notice)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [catalog, globalLeague, globalSplit, globalYear, hasDataForSplit])

  useEffect(() => {
    if (!catalog || !ready) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const rows = await fetchOESlices({
        leagues: leagueLabelToLeagues(filters.league),
        years: filters.year === 'ALL' ? ['ALL'] : [filters.year],
        splits: filters.split === 'ALL' ? ['ALL'] : [filters.split],
        catalogSplits: catalog.splits,
      })
      if (cancelled) return
      setStore(buildStoreFromSliceRows(catalog, rows))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [catalog, filters, ready])

  const data = useMemo(() => {
    if (!store) return null
    return mergeDataForFilters(store, filters)
  }, [store, filters])

  const setLeague = useCallback((league: string) => {
    setFilters((f) => ({ ...f, league }))
    setFallbackNotice(null)
  }, [])

  const setYear = useCallback(
    (year: string) => {
      const nextSplits = catalog?.splits.filter((s) => s.startsWith(`${year} `)) ?? []
      const spring = `${year} Spring`
      setFilters((f) => ({
        ...f,
        year,
        split:
          f.split === 'ALL'
            ? 'ALL'
            : nextSplits.includes(spring)
              ? spring
              : (nextSplits[0] ?? f.split),
      }))
      setFallbackNotice(null)
    },
    [catalog],
  )

  const setSplit = useCallback((split: string) => {
    if (split === 'ALL') {
      setFilters((f) => ({ ...f, split: 'ALL' }))
    } else {
      const year = split.split(' ', 1)[0] ?? DEFAULT_YEAR
      setFilters((f) => ({ ...f, split, year }))
    }
    setFallbackNotice(null)
  }, [])

  return {
    data,
    loading,
    filters,
    setLeague,
    setYear,
    setSplit,
    leagues,
    years,
    splits: splitsForYear,
    fallbackNotice,
  }
}
