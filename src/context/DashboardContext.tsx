import { createContext, useContext, useMemo, useEffect, ReactNode } from 'react'
import {
  useDashboardData,
  DashboardData,
  Player,
  Team,
  Champion,
  DEFAULT_SPLIT,
  leaguesToLeagueLabel,
  leagueLabelToLeagues,
  yearsToLabel,
  splitsToLabel,
  splitSeasonLabel,
  isAllTier1Selected,
} from '../hooks/useDashboardData'
import { mergeSlicesFromFilters, TIER1_LEAGUES, type OEStoreMeta } from '../lib/mergeSlices'

interface DashboardContextValue {
  data: DashboardData | null
  catalog: OEStoreMeta | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null

  league: string
  setLeague: (l: string) => void
  year: string
  setYear: (y: string) => void
  split: string
  setSplit: (s: string) => void

  selectedLeagues: string[]
  selectedYears: string[]
  selectedSplits: string[]
  toggleLeague: (league: string) => void
  toggleYear: (year: string) => void
  toggleSplit: (split: string) => void

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
    selectedYears,
    selectedSplits,
    selectedLeagues,
    setSelectedYears,
    setSelectedSplits,
    setSelectedLeagues,
    toggleYear,
    toggleSplit,
    toggleLeague,
  } = useDashboardData()

  const meta = catalog ?? store?.meta ?? null

  const leagues = useMemo(() => {
    if (!meta) return ['All Tier 1', ...TIER1_LEAGUES]
    return ['All Tier 1', ...TIER1_LEAGUES.filter((l) => meta.leagues.includes(l))]
  }, [meta])

  const years = useMemo(() => {
    if (!meta) return ['ALL', DEFAULT_YEAR]
    const set = new Set<string>()
    for (const splitLabel of meta.splits) {
      const [year] = splitLabel.split(' ', 1)
      if (year) set.add(year)
    }
    return ['ALL', ...[...set].sort()]
  }, [meta])

  const league = leaguesToLeagueLabel(selectedLeagues)
  const year = yearsToLabel(selectedYears)
  const split = splitsToLabel(selectedSplits)

  const splitOptions = useMemo(() => {
    if (!meta) return []
    if (selectedYears.includes('ALL')) return meta.splits
    return meta.splits.filter((splitLabel) =>
      selectedYears.some((y) => splitLabel.startsWith(`${y} `)),
    )
  }, [meta, selectedYears])

  const setLeague = (l: string) => {
    setSelectedLeagues(leagueLabelToLeagues(l))
  }

  const setYear = (y: string) => {
    setSelectedYears(y === 'ALL' ? ['ALL'] : [y])
  }

  const setSplit = (s: string) => {
    setSelectedSplits(s === 'ALL' ? ['ALL'] : [s])
  }

  useEffect(() => {
    if (!meta) return
    if (!selectedYears.includes('ALL') && !selectedYears.some((y) => years.includes(y))) {
      setSelectedYears([DEFAULT_YEAR])
    }
    if (selectedSplits.includes('ALL')) return
    const valid = selectedSplits.filter((s) => splitOptions.includes(s))
    if (!valid.length && splitOptions.length) {
      const spring = splitOptions.find((s) => s.endsWith(' Spring')) ?? splitOptions[0]!
      setSelectedSplits([spring])
    } else if (valid.length !== selectedSplits.length) {
      setSelectedSplits(valid)
    }
  }, [meta, years, selectedYears, selectedSplits, splitOptions, setSelectedYears, setSelectedSplits])

  const data = useMemo(() => {
    if (!store) return null
    return mergeSlicesFromFilters(store, selectedLeagues, selectedYears, selectedSplits)
  }, [store, selectedLeagues, selectedYears, selectedSplits])

  const filteredPlayers = data?.players ?? []
  const filteredTeams = data?.teams ?? []
  const filteredChampions = data?.champions ?? []

  return (
    <DashboardContext.Provider
      value={{
        data,
        catalog: meta,
        loading,
        error,
        lastUpdated,
        league,
        setLeague,
        year,
        setYear,
        split,
        setSplit,
        selectedLeagues,
        selectedYears,
        selectedSplits,
        toggleLeague,
        toggleYear,
        toggleSplit,
        filteredPlayers,
        filteredTeams,
        filteredChampions,
        leagues,
        years,
        splits: splitOptions,
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

export { splitSeasonLabel, isAllTier1Selected }
