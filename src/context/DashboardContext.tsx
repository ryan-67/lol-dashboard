import { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react'
import { useDashboardData, DashboardData, Player, Team, Champion } from '../hooks/useDashboardData'
import { mergeSlices, TIER1_LEAGUES } from '../lib/mergeSlices'

interface DashboardContextValue {
  data: DashboardData | null
  loading: boolean
  error: string | null
  refresh: () => void
  lastUpdated: Date | null

  league: string
  setLeague: (l: string) => void
  year: string
  setYear: (y: string) => void
  split: string
  setSplit: (s: string) => void

  filteredPlayers: Player[]
  filteredTeams: Team[]
  filteredChampions: Champion[]

  leagues: string[]
  years: string[]
  splits: string[]
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export const DEFAULT_SPLIT = '2026 Spring'
export const DEFAULT_YEAR = '2026'

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { store, loading, error, refresh, lastUpdated } = useDashboardData()

  const leagues = useMemo(() => {
    if (!store) return ['All Tier 1']
    return ['All Tier 1', ...TIER1_LEAGUES.filter((l) => store.meta.leagues.includes(l))]
  }, [store])

  const years = useMemo(() => {
    if (!store) return [DEFAULT_YEAR]
    const set = new Set<string>()
    for (const splitLabel of store.meta.splits) {
      const [year] = splitLabel.split(' ', 1)
      if (year) set.add(year)
    }
    return [...set].sort()
  }, [store])

  const [league, setLeagueState] = useState('All Tier 1')
  const [year, setYearState] = useState(DEFAULT_YEAR)
  const [split, setSplitState] = useState(DEFAULT_SPLIT)

  const splitOptionsByYear = useMemo(() => {
    if (!store) return []
    return store.meta.splits.filter((splitLabel) => splitLabel.startsWith(`${year} `))
  }, [store, year])

  const setLeague = useCallback((l: string) => setLeagueState(l), [])
  const setYear = useCallback((y: string) => setYearState(y), [])
  const setSplit = useCallback((s: string) => setSplitState(s), [])

  useEffect(() => {
    if (!store) return
    if (!years.includes(year)) {
      setYearState(DEFAULT_YEAR)
      return
    }
    if (!splitOptionsByYear.includes(split)) {
      const spring = `${year} Spring`
      setSplitState(splitOptionsByYear.includes(spring) ? spring : (splitOptionsByYear[0] ?? spring))
    }
  }, [store, years, year, split, splitOptionsByYear])

  const data = useMemo(() => {
    if (!store) return null
    return mergeSlices(store, league, split)
  }, [store, league, split])

  const filteredPlayers = data?.players ?? []
  const filteredTeams = data?.teams ?? []
  const filteredChampions = data?.champions ?? []

  return (
    <DashboardContext.Provider
      value={{
        data,
        loading,
        error,
        refresh,
        lastUpdated,
        league,
        setLeague,
        year,
        setYear,
        split,
        setSplit,
        filteredPlayers,
        filteredTeams,
        filteredChampions,
        leagues,
        years,
        splits: splitOptionsByYear,
      }}
    >
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used inside DashboardProvider')
  return ctx
}
