import { useState, useEffect, useCallback } from 'react'
import type { OEStore } from '../lib/mergeSlices'

export interface DashboardMeta {
  source: string
  generated_at: string
  leagues: string[]
  splits?: string[]
  schema_version: string
  csv_files?: string[]
}

export interface PlayerGameLog {
  date: string
  result: number
  champion: string
  opponent?: string
  kda: number
  kp: number
  dmgShare: number
  gd15: number
  csd15: number
  xpd15: number
  dpm: number
  visionScore?: number
  goldShare?: number
  firstBloodRate?: number
  objControl?: number
}

export interface PlayerChampionPoolEntry {
  champion: string
  games: number
  wins: number
  losses: number
  winrate: number
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
  dpm?: number
  visionScore?: number
  goldShare?: number
  firstBloodRate?: number
  objControl?: number
  kills?: number
  deaths?: number
  assists?: number
  gameLog?: PlayerGameLog[]
  championPool?: PlayerChampionPoolEntry[]
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
  dragonsPerGame?: number
  baronsPerGame?: number
  towersPerGame?: number
  heraldsPerGame?: number
  objPerGame?: number
  avgGameLength?: number
  goldPerMin?: number
  wardsPerMin?: number
  firstBloodRate?: number
  kills?: number
  deaths?: number
  assists?: number
}

export interface ChampionWeekStat {
  weekStart: string
  picks: number
  bans: number
  wins?: number
  winrate?: number
  presence: number
}

export interface Champion {
  name: string
  positions: string[]
  picks: number
  bans: number
  presence: number
  pickRate?: number
  banRate?: number
  winrate: number
  avgKda: number
  games?: number
  avgCsd15?: number
  avgDpm?: number
  avgGoldPerMin?: number
  sparkline?: number[]
  primaryRole?: string
  weeklyStats?: ChampionWeekStat[]
  gameDates?: string[]
  wins?: number
  kills?: number
  deaths?: number
  assists?: number
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
  matchups: Matchup[]
  teamChampions: TeamChampion[]
}

interface UseDashboardDataReturn {
  store: OEStore | null
  loading: boolean
  error: string | null
  refresh: () => void
  lastUpdated: Date | null
}

const DATA_URL = (import.meta.env.BASE_URL || '/') + 'data/oe_slices.json'

export function useDashboardData(): UseDashboardDataReturn {
  const [store, setStore] = useState<OEStore | null>(null)
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
        throw new Error(
          res.status === 404
            ? 'Data store not found. Run `npm run ingest` to build oe_slices.json from lol/ CSV files.'
            : `HTTP ${res.status} loading dashboard data`
        )
      }
      const json = (await res.json()) as OEStore
      if (!json?.meta?.splits?.length || !json?.slices) {
        throw new Error('Malformed data store: missing meta.splits or slices')
      }
      setStore(json)
      setLastUpdated(new Date())
    } catch (err) {
      setStore(null)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
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

  return { store, loading, error, refresh, lastUpdated }
}
