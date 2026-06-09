import { useState, useEffect, useCallback } from 'react'
import type { OEStore, OEStoreMeta } from '../lib/mergeSlices'
import { TIER1_LEAGUES } from '../lib/mergeSlices'
import {
  buildStoreFromSliceRows,
  fetchOESliceCatalog,
  fetchOESlices,
} from '../lib/loadOEStore'
import { isSupabaseConfigured } from '../lib/supabaseClient'

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
  side?: string
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
  avgPickOrder?: number | null
}

export interface DashboardData {
  meta: DashboardMeta
  players: Player[]
  teams: Team[]
  champions: Champion[]
  matchups: Matchup[]
  teamChampions: TeamChampion[]
}

export const DEFAULT_SPLIT = '2026 Spring'
export const DEFAULT_LEAGUES: string[] = [...TIER1_LEAGUES]

export function leaguesToLeagueLabel(leagues: string[]): string {
  const tier1 = TIER1_LEAGUES as readonly string[]
  if (leagues.length === tier1.length && tier1.every((l) => leagues.includes(l))) {
    return 'All Tier 1'
  }
  return leagues[0] ?? 'All Tier 1'
}

export function leagueLabelToLeagues(league: string): string[] {
  return league === 'All Tier 1' ? [...TIER1_LEAGUES] : [league]
}

interface UseDashboardDataReturn {
  store: OEStore | null
  catalog: OEStoreMeta | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
  selectedSplit: string
  selectedLeagues: string[]
  setSelectedSplit: (split: string) => void
  setSelectedLeagues: (leagues: string[]) => void
}

export function useDashboardData(): UseDashboardDataReturn {
  const [catalog, setCatalog] = useState<OEStoreMeta | null>(null)
  const [store, setStore] = useState<OEStore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedSplit, setSelectedSplit] = useState(DEFAULT_SPLIT)
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(DEFAULT_LEAGUES)
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (!isSupabaseConfigured) {
      setCatalog(null)
      setStore(null)
      setError(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart the dev server.',
      )
      setLoading(false)
      return
    }

    try {
      const meta = catalog ?? (await fetchOESliceCatalog())
      if (!catalog) {
        setCatalog(meta)
      }

      const rows = await fetchOESlices({
        split: selectedSplit,
        leagues: selectedLeagues,
      })
      const nextStore = buildStoreFromSliceRows(meta, rows)
      setStore(nextStore)
      setLastUpdated(new Date(nextStore.meta.generated_at))
    } catch (err) {
      setStore(null)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [catalog, selectedSplit, selectedLeagues])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const setSelectedLeaguesSafe = useCallback((leagues: string[]) => {
    setSelectedLeagues(leagues.length ? leagues : [...DEFAULT_LEAGUES])
  }, [])

  return {
    store,
    catalog,
    loading,
    error,
    lastUpdated,
    selectedSplit,
    selectedLeagues,
    setSelectedSplit,
    setSelectedLeagues: setSelectedLeaguesSafe,
  }
}
