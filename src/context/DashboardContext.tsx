import { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react'
import {
  useDashboardData,
  DashboardData,
  Player,
  Team,
  Champion,
  DEFAULT_SPLIT,
  leagueLabelToLeagues,
  leaguesToLeagueLabel,
} from '../hooks/useDashboardData'
import { mergeSlices, TIER1_LEAGUES } from '../lib/mergeSlices'

interface DashboardContextValue {
  data: DashboardData | null
  loading: boolean
  error: string | null
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

export const DEFAULT_YEAR = '2026'
export { DEFAULT_SPLIT }

export function DashboardProvider({ children }: { children: ReactNode }) {
  const {
    store,
    catalog,
    loading,
    error,
    lastUpdated,
    selectedSplit,
    selectedLeagues,
    setSelectedSplit,
    setSelectedLeagues,
  } = useDashboardData()

  const meta = catalog ?? store?.meta ?? null

  const leagues = useMemo(() => {
    if (!meta) return ['All Tier 1']
    return ['All Tier 1', ...TIER1_LEAGUES.filter((l) => meta.leagues.includes(l))]
  }, [meta])

  const years = useMemo(() => {
    if (!meta) return [DEFAULT_YEAR]
    const set = new Set<string>()
    for (const splitLabel of meta.splits) {
      const [year] = splitLabel.split(' ', 1)
      if (year) set.add(year)
    }
    return [...set].sort()
  }, [meta])

  const [year, setYearState] = useState(DEFAULT_YEAR)

  const league = leaguesToLeagueLabel(selectedLeagues)
  const split = selectedSplit

  const splitOptionsByYear = useMemo(() => {
    if (!meta) return []
    return meta.splits.filter((splitLabel) => splitLabel.startsWith(`${year} `))
  }, [meta, year])

  const setLeague = useCallback(
    (l: string) => {
      setSelectedLeagues(leagueLabelToLeagues(l))
    },
    [setSelectedLeagues],
  )

  const setYear = useCallback((y: string) => setYearState(y), [])

  const setSplit = useCallback(
    (s: string) => {
      setSelectedSplit(s)
    },
    [setSelectedSplit],
  )

  useEffect(() => {
    if (!meta) return
    if (!years.includes(year)) {
      setYearState(DEFAULT_YEAR)
      return
    }
    if (!splitOptionsByYear.includes(split)) {
      const spring = `${year} Spring`
      setSelectedSplit(
        splitOptionsByYear.includes(spring) ? spring : (splitOptionsByYear[0] ?? spring),
      )
    }
  }, [meta, years, year, split, splitOptionsByYear, setSelectedSplit])

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
