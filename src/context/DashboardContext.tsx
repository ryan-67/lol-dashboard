import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'
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
  split: string
  setSplit: (s: string) => void

  filteredPlayers: Player[]
  filteredTeams: Team[]
  filteredChampions: Champion[]

  leagues: string[]
  splits: string[]
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export const DEFAULT_SPLIT = '2026 Spring'

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { store, loading, error, refresh, lastUpdated } = useDashboardData()

  const leagues = useMemo(() => {
    if (!store) return ['All Tier 1']
    return ['All Tier 1', ...TIER1_LEAGUES.filter((l) => store.meta.leagues.includes(l))]
  }, [store])

  const splits = useMemo(() => {
    if (!store) return ['all']
    return ['all', ...store.meta.splits]
  }, [store])

  const [league, setLeagueState] = useState('All Tier 1')
  const [split, setSplitState] = useState(DEFAULT_SPLIT)

  const setLeague = useCallback((l: string) => setLeagueState(l), [])
  const setSplit = useCallback((s: string) => setSplitState(s), [])

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
        split,
        setSplit,
        filteredPlayers,
        filteredTeams,
        filteredChampions,
        leagues,
        splits,
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
