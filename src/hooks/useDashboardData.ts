import { useState, useEffect, useCallback } from 'react'
import { normalizeDashboardData } from '../lib/dashboardNormalize'

export interface DashboardMeta {
  source: string
  generated_at: string
  leagues: string[]
  splits?: string[]
  schema_version: string
}

export interface Player {
  name: string
  team: string
  league: string
  position: string
  games: number
  kda: number
  kp: number
  dmgShare: number
  gd15: number
  csd15: number
  xpd15: number
}

export interface Team {
  name: string
  league: string
  games: number
  wins: number
  losses: number
  winrate: number
  avgKda: number
  avgGd15: number
  towers: number
  dragons: number
  barons: number
  heralds: number
}

export interface Champion {
  name: string
  positions: string[]
  picks: number
  bans: number
  presence: number
  winrate: number
  avgKda: number
}

export interface Matchup {
  teamA: string
  teamB: string
  games: number
  winsA: number
  winsB: number
}

export interface TeamChampion {
  team: string
  champion: string
  picks: number
  winrate: number
}

export interface DashboardData {
  meta: DashboardMeta
  players: Player[]
  teams: Team[]
  champions: Champion[]
  /** Per-league champion stats when present in JSON (from process_oe_csv). */
  championsByLeague?: Record<string, Champion[]>
  matchups: Matchup[]
  teamChampions: TeamChampion[]
}

interface UseDashboardDataReturn {
  data: DashboardData | null
  loading: boolean
  error: string | null
  refresh: () => void
  lastUpdated: Date | null
}

const DATA_URL = (import.meta.env.BASE_URL || '/') + 'dashboard_data.json'

export function useDashboardData(): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [cacheBust, setCacheBust] = useState(Date.now())

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = `${DATA_URL}?v=${cacheBust}`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(normalizeDashboardData(json as Record<string, unknown>))
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [cacheBust])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refresh = useCallback(() => {
    setCacheBust(Date.now())
  }, [])

  return { data, loading, error, refresh, lastUpdated }
}
