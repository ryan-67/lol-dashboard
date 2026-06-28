import { createContext, useContext, useMemo, useEffect, useCallback, useRef, ReactNode } from 'react'
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
import { mergeSlicesFromFilters, mergeWeeklyHubFromFilters, TIER1_LEAGUES, type OEStoreMeta } from '../lib/mergeSlices'
import { pickDefaultDashboardSplit } from '../lib/splitSelection'
import { combinedSplitFilterValues, normalizeToCombinedFilterValue } from '../lib/splitGroups'

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
  resetMainTabFilters: () => void

  filteredPlayers: Player[]
  filteredTeams: Team[]
  filteredChampions: Champion[]

  /** All splits in selected year(s) — for Overview weekly hub (includes playoffs). */
  weeklyHubPlayers: Player[]
  weeklyHubTeams: Team[]
  weeklyHubChampions: Champion[]

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
  const splitInitialized = useRef(false)
  const userPickedSplit = useRef(false)

  const leagues = useMemo(() => {
    if (!meta) return ['All Tier 1', ...TIER1_LEAGUES]
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

  const league = leaguesToLeagueLabel(selectedLeagues)
  const year = yearsToLabel(selectedYears)
  const split = splitsToLabel(selectedSplits)

  const splitOptions = useMemo(() => {
    if (!meta) return []
    if (selectedYears.includes('ALL')) {
      return ['ALL', ...combinedSplitFilterValues(meta.splits, DEFAULT_YEAR)]
    }
    if (selectedYears.length === 1) {
      return ['ALL', ...combinedSplitFilterValues(meta.splits, selectedYears[0]!)]
    }
    return meta.splits.filter((splitLabel) =>
      selectedYears.some((y) => splitLabel.startsWith(`${y} `)),
    )
  }, [meta, selectedYears])

  const setLeague = useCallback(
    (l: string) => {
      setSelectedLeagues(leagueLabelToLeagues(l))
    },
    [setSelectedLeagues],
  )

  const setYear = useCallback(
    (y: string) => {
      if (y === 'ALL') return
      setSelectedYears([y])
    },
    [setSelectedYears],
  )

  const setSplit = useCallback(
    (s: string) => {
      userPickedSplit.current = true
      setSelectedSplits(s === 'ALL' ? ['ALL'] : [s])
    },
    [setSelectedSplits],
  )

  const toggleSplitChoice = useCallback(
    (s: string) => {
      userPickedSplit.current = true
      toggleSplit(s)
    },
    [toggleSplit],
  )

  const resetMainTabFilters = useCallback(() => {
    setSelectedLeagues(['All Tier 1'])
    setSelectedYears([DEFAULT_YEAR])
    const split = pickDefaultDashboardSplit(meta?.splits ?? [], store, DEFAULT_YEAR, DEFAULT_SPLIT)
    userPickedSplit.current = false
    setSelectedSplits([split])
  }, [meta, store, setSelectedLeagues, setSelectedYears, setSelectedSplits])

  useEffect(() => {
    if (!meta) return
    if (!selectedYears.some((y) => years.includes(y))) {
      setSelectedYears([DEFAULT_YEAR])
    }
  }, [meta, years, selectedYears, setSelectedYears])

  useEffect(() => {
    if (!meta) return
    if (selectedSplits.includes('ALL')) return
    const valid = selectedSplits.filter((s) => splitOptions.includes(s))
    if (!valid.length && splitOptions.length) {
      const next = pickDefaultDashboardSplit(splitOptions, store, selectedYears[0] ?? DEFAULT_YEAR, DEFAULT_SPLIT)
      setSelectedSplits([next])
    } else if (valid.length !== selectedSplits.length) {
      setSelectedSplits(valid)
    }
  }, [meta, store, years, selectedYears, selectedSplits, splitOptions, setSelectedYears, setSelectedSplits])

  useEffect(() => {
    if (!meta || selectedSplits.includes('ALL')) return
    const current = selectedSplits[0]
    if (!current) return
    const normalized = normalizeToCombinedFilterValue(meta.splits, current)
    if (normalized !== current && splitOptions.includes(normalized)) {
      setSelectedSplits([normalized])
    }
  }, [meta, selectedSplits, splitOptions, setSelectedSplits])

  useEffect(() => {
    if (!store || !meta || splitInitialized.current || userPickedSplit.current) return
    splitInitialized.current = true
    const best = pickDefaultDashboardSplit(meta.splits, store, DEFAULT_YEAR, DEFAULT_SPLIT)
    setSelectedSplits([best])
  }, [store, meta, setSelectedSplits])

  const data = useMemo(() => {
    if (!store) return null
    return mergeSlicesFromFilters(store, selectedLeagues, selectedYears, selectedSplits)
  }, [store, selectedLeagues, selectedYears, selectedSplits])

  const filteredPlayers = data?.players ?? []
  const filteredTeams = data?.teams ?? []
  const filteredChampions = data?.champions ?? []

  const weeklyHubData = useMemo(() => {
    if (!store) return null
    return mergeWeeklyHubFromFilters(store, selectedLeagues, selectedYears)
  }, [store, selectedLeagues, selectedYears])

  const weeklyHubPlayers = weeklyHubData?.players ?? []
  const weeklyHubTeams = weeklyHubData?.teams ?? []
  const weeklyHubChampions = weeklyHubData?.champions ?? []

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
        toggleSplit: toggleSplitChoice,
        resetMainTabFilters,
        filteredPlayers,
        filteredTeams,
        filteredChampions,
        weeklyHubPlayers,
        weeklyHubTeams,
        weeklyHubChampions,
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
