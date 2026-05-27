import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'
import { useDashboardData, DashboardData, Player, Team, Champion } from '../hooks/useDashboardData'

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

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh, lastUpdated } = useDashboardData()

  const leagues = useMemo(() => {
    if (!data) return ['All Tier 1']
    const set = new Set(data.meta.leagues)
    return ['All Tier 1', ...Array.from(set)]
  }, [data])

  const splits = useMemo(() => {
    if (!data?.meta.splits?.length) return ['2025-2026']
    return data.meta.splits
  }, [data])

  const [league, setLeagueState] = useState('All Tier 1')
  const [split, setSplitState] = useState(splits[0])

  const setLeague = useCallback((l: string) => setLeagueState(l), [])
  const setSplit = useCallback((s: string) => setSplitState(s), [])

  const filteredPlayers = useMemo(() => {
    if (!data) return []
    if (league === 'All Tier 1') return data.players
    return data.players.filter((p) => p.league === league)
  }, [data, league])

  const filteredTeams = useMemo(() => {
    if (!data) return []
    if (league === 'All Tier 1') return data.teams
    return data.teams.filter((t) => t.league === league)
  }, [data, league])

  const filteredChampions = useMemo(() => {
    if (!data) return []
    return data.champions
  }, [data])

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
