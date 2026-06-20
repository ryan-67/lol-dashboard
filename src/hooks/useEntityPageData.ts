import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDashboard, DEFAULT_YEAR } from '../context/DashboardContext'
import { buildStoreFromSliceRows, fetchOESlices } from '../lib/loadOEStore'
import { mergeDataForFilters, type EntityFilterState } from '../lib/entities/resolvers'
import type { DashboardData } from '../hooks/useDashboardData'
import { leagueLabelToLeagues } from '../hooks/useDashboardData'
import type { OEStore } from '../lib/mergeSlices'
import { pickNewestSplitWithData, splitsNewestFirst, yearFromSplitLabel } from '../lib/splitSelection'

async function findBestSplit(
  catalogSplits: string[],
  globalYear: string,
  _globalSplit: string,
  league: string,
  catalog: NonNullable<ReturnType<typeof useDashboard>['catalog']>,
  hasData: (data: DashboardData) => boolean,
): Promise<{ filters: EntityFilterState; notice: string | null }> {
  const trySplit = async (split: string): Promise<boolean> => {
    const year = yearFromSplitLabel(split, globalYear)
    const rows = await fetchOESlices({
      leagues: leagueLabelToLeagues(league),
      years: [year],
      splits: [split],
      catalogSplits: catalog.splits,
    })
    const store = buildStoreFromSliceRows(catalog!, rows)
    const data = mergeDataForFilters(store, { league, year, split })
    return hasData(data)
  }

  const ordered = splitsNewestFirst(catalogSplits)
  const yearPref = [
    ...ordered.filter((s) => s.startsWith(`${globalYear} `)),
    ...ordered.filter((s) => !s.startsWith(`${globalYear} `)),
  ]

  for (const split of yearPref) {
    if (await trySplit(split)) {
      const year = yearFromSplitLabel(split, globalYear)
      return { filters: { league, year, split }, notice: null }
    }
  }

  const fallback = pickNewestSplitWithData(catalogSplits, () => false) ?? catalogSplits[0] ?? `${globalYear} Spring`
  const year = yearFromSplitLabel(fallback, globalYear)
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
      if (year === 'ALL') {
        setFilters((f) => ({ ...f, year: 'ALL' }))
        setFallbackNotice(null)
        return
      }
      const nextSplits = catalog?.splits.filter((s) => s.startsWith(`${year} `)) ?? []
      const newest = splitsNewestFirst(nextSplits)[0]
      setFilters((f) => ({
        ...f,
        year,
        split:
          f.split === 'ALL'
            ? 'ALL'
            : newest ?? nextSplits.find((s) => s.endsWith(' Spring')) ?? nextSplits[0] ?? f.split,
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
