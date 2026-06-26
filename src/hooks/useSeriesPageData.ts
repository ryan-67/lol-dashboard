import { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import { buildStoreFromSliceRows, fetchOESlices } from '../lib/loadOEStore'
import type { OEStore } from '../lib/mergeSlices'
import { mergeDataForFilters } from '../lib/entities/resolvers'
import { leagueLabelToLeagues } from './useDashboardData'
import { findSeriesById, parseSeriesId } from '../lib/seriesAnalytics'

/** Load series across all splits in the series year (ignores global split filter). */
export function useSeriesPageData(seriesId: string) {
  const { catalog } = useDashboard()
  const [store, setStore] = useState<OEStore | null>(null)
  const [loading, setLoading] = useState(true)

  const parsed = useMemo(() => parseSeriesId(seriesId), [seriesId])
  const year = parsed?.date.slice(0, 4) ?? '2026'

  useEffect(() => {
    if (!catalog || !parsed) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const rows = await fetchOESlices({
        leagues: leagueLabelToLeagues('All Tier 1'),
        years: [year],
        splits: ['ALL'],
        catalogSplits: catalog.splits,
      })
      if (cancelled) return
      setStore(buildStoreFromSliceRows(catalog, rows))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [catalog, parsed, year])

  const data = useMemo(() => {
    if (!store) return null
    return mergeDataForFilters(store, {
      league: 'All Tier 1',
      year,
      split: 'ALL',
    })
  }, [store, year])

  const series = useMemo(
    () => (data ? findSeriesById(data, seriesId) : null),
    [data, seriesId],
  )

  const fallbackNotice = useMemo(() => {
    if (!parsed) return 'Invalid series link.'
    if (!loading && data && !series) return `Series not found in ${year} tier-1 data.`
    return null
  }, [parsed, loading, data, series, year])

  return {
    data,
    series,
    loading,
    fallbackNotice,
    year,
    parsed,
  }
}
