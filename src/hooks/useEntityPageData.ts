import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard, DEFAULT_YEAR } from '../context/DashboardContext'
import { buildStoreFromSliceRows, fetchOESlices } from '../lib/loadOEStore'
import { entityFetchFilters, mergeDataForFilters, type EntityFilterState, isLifetimeYearFilter } from '../lib/entities/resolvers'
import type { DashboardData } from '../hooks/useDashboardData'
import { leagueLabelToLeagues } from '../hooks/useDashboardData'
import type { OEStore } from '../lib/mergeSlices'
import { pickNewestSplitWithData, splitsNewestFirst, yearFromSplitLabel } from '../lib/splitSelection'
import { combinedFilterForCatalogSeason, combinedSplitFilterValues } from '../lib/splitGroups'
import { parseCanonicalSplit } from '../lib/tournamentCatalog'
import { entitySplitOptions } from '../lib/filterOptions'

async function tryLifetimeFilters(
  catalog: NonNullable<ReturnType<typeof useDashboard>['catalog']>,
  league: string,
  hasData: (data: DashboardData) => boolean,
): Promise<{ filters: EntityFilterState; notice: string | null } | null> {
  const rows = await fetchOESlices({
    leagues: leagueLabelToLeagues(league),
    years: ['ALL'],
    splits: ['ALL'],
    catalogSplits: catalog.splits,
  })
  const store = buildStoreFromSliceRows(catalog, rows)
  const lifetimeFilters: EntityFilterState = { league, year: 'ALL', split: 'ALL' }
  const data = mergeDataForFilters(store, lifetimeFilters)
  if (!hasData(data)) return null
  return { filters: lifetimeFilters, notice: null }
}

async function findBestSplit(
  catalogSplits: string[],
  globalYear: string,
  globalSplit: string,
  league: string,
  catalog: NonNullable<ReturnType<typeof useDashboard>['catalog']>,
  hasData: (data: DashboardData) => boolean,
): Promise<{ filters: EntityFilterState; notice: string | null }> {
  const tryLeague = async (leagueLabel: string): Promise<EntityFilterState | null> => {
    if (isLifetimeYearFilter(globalYear)) {
      const lifetime = await tryLifetimeFilters(catalog, leagueLabel, hasData)
      if (lifetime) return lifetime.filters
    }

    const trySplit = async (split: string): Promise<boolean> => {
      const year = yearFromSplitLabel(split, globalYear)
      const rows = await fetchOESlices({
        leagues: leagueLabelToLeagues(leagueLabel),
        years: [year],
        splits: [split],
        catalogSplits: catalog.splits,
      })
      const store = buildStoreFromSliceRows(catalog!, rows)
      const data = mergeDataForFilters(store, { league: leagueLabel, year, split })
      return hasData(data)
    }

    const yearSplits = catalogSplits.filter((s) => s.startsWith(`${globalYear} `))
    const tryOrder: string[] = []
    const seen = new Set<string>()

    // Prefer the dashboard's current split first so entity pages open on the
    // same context the user was browsing (not lifetime / ALL).
    if (globalSplit && globalSplit !== 'ALL') {
      tryOrder.push(globalSplit)
      seen.add(globalSplit)
      const { season } = parseCanonicalSplit(globalSplit)
      const leader = `${globalYear} ${combinedFilterForCatalogSeason(season)}`
      if (!seen.has(leader)) {
        seen.add(leader)
        tryOrder.push(leader)
      }
    }

    for (const catalogSplit of splitsNewestFirst(yearSplits)) {
      const { season } = parseCanonicalSplit(catalogSplit)
      const leader = `${globalYear} ${combinedFilterForCatalogSeason(season)}`
      if (!seen.has(leader)) {
        seen.add(leader)
        tryOrder.push(leader)
      }
    }
    for (const leader of combinedSplitFilterValues(catalogSplits, globalYear)) {
      if (!seen.has(leader)) tryOrder.push(leader)
    }

    for (const split of tryOrder) {
      if (await trySplit(split)) {
        const year = yearFromSplitLabel(split, globalYear)
        return { league: leagueLabel, year, split }
      }
    }
    return null
  }

  const primary = await tryLeague(league)
  if (primary) return { filters: primary, notice: null }

  if (league !== 'All Tier 1') {
    const allTier1 = await tryLeague('All Tier 1')
    if (allTier1) {
      return {
        filters: allTier1,
        notice: 'Showing tier-1 data — entity not found in the selected league filter',
      }
    }
  }

  const fallback = pickNewestSplitWithData(catalogSplits, () => false) ?? catalogSplits[0] ?? `${globalYear} Spring`
  const year = yearFromSplitLabel(fallback, globalYear)
  return {
    filters: { league: 'All Tier 1', year, split: fallback },
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
    years: dashboardYears,
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
  const userAdjustedFilters = useRef(false)

  const entityYears = useMemo(
    () => ['ALL', ...dashboardYears.filter((y) => y !== 'ALL')],
    [dashboardYears],
  )

  const splitsForYear = useMemo(() => {
    if (!catalog) return []
    return entitySplitOptions(catalog.splits, filters.year).map((o) => o.value)
  }, [catalog, filters.year])

  useEffect(() => {
    if (!catalog || userAdjustedFilters.current) return
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
      const { years, splits } = entityFetchFilters(filters)
      const rows = await fetchOESlices({
        leagues: leagueLabelToLeagues(filters.league),
        years,
        splits,
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
    userAdjustedFilters.current = true
    setFilters((f) => ({ ...f, league }))
    setFallbackNotice(null)
  }, [])

  const setYear = useCallback(
    (year: string) => {
      userAdjustedFilters.current = true
      if (isLifetimeYearFilter(year)) {
        setFilters((f) => ({ ...f, year: 'ALL', split: 'ALL' }))
        setFallbackNotice(null)
        return
      }
      const nextSplits = catalog?.splits.filter((s) => s.startsWith(`${year} `)) ?? []
      const combined = combinedSplitFilterValues(catalog?.splits ?? [], year)
      const newest = combined[combined.length - 1]
      setFilters((f) => ({
        ...f,
        year,
        split:
          f.split === 'ALL' || !/^\d{4}/.test(f.split)
            ? newest ?? nextSplits.find((s) => s.endsWith(' Spring')) ?? nextSplits[0] ?? f.split
            : newest ?? nextSplits.find((s) => s.endsWith(' Spring')) ?? nextSplits[0] ?? f.split,
      }))
      setFallbackNotice(null)
    },
    [catalog],
  )

  const setSplit = useCallback(
    (split: string) => {
      userAdjustedFilters.current = true
      if (split === 'ALL') {
        setFilters((f) => ({ ...f, split: 'ALL' }))
      } else if (/^\d{4}/.test(split)) {
        const year = split.split(' ', 1)[0] ?? DEFAULT_YEAR
        setFilters((f) => ({ ...f, split, year }))
      } else {
        setFilters((f) => ({ ...f, split, year: f.year === 'ALL' ? 'ALL' : f.year }))
      }
      setFallbackNotice(null)
    },
    [],
  )

  return {
    data,
    loading,
    filters,
    setLeague,
    setYear,
    setSplit,
    leagues,
    years: entityYears,
    splits: splitsForYear,
    catalogSplits: catalog?.splits ?? [],
    fallbackNotice,
  }
}
