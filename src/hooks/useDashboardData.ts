import { useState, useEffect, useCallback } from 'react'
import type { OEStore, OEStoreMeta } from '../lib/mergeSlices'
import {
  buildStoreFromSliceRows,
  fetchOESliceCatalog,
  fetchOESlices,
} from '../lib/loadOEStore'
import { sanitizeUserFacingError } from '../lib/userFacingError'
import { DEFAULT_SPLIT } from '../lib/constants'
import { expandSelectedLeagues } from '../lib/filterLabels'

export interface DashboardMeta {
  source: string
  generated_at: string
  leagues: string[]
  splits?: string[]
  schema_version: string
  csv_files?: string[]
}

export interface GoldTimelinePoint {
  minute: number
  goldDiff: number
}

export interface PlayerGameLog {
  date: string
  result: number
  champion: string
  opponent?: string
  gameId?: string
  kda: number
  kp: number
  dmgShare: number
  gd15?: number
  csd15?: number
  xpd15?: number
  dpm: number
  visionScore?: number
  goldShare?: number
  firstBloodRate?: number
  firstBloodVictim?: boolean
  objControl?: number
  turretPlates?: number
  campsStolen?: number
  soloKills?: number
  wardsDestroyed?: number
  kaPerMin?: number
  dmgGoldRatio?: number
  dmgPerGold?: number
  gpm?: number
  side?: string
  split?: string
  league?: string
  rawSplit?: string
  oeYear?: string
  goldTimeline?: GoldTimelinePoint[]
  gameLength?: number
  playoffs?: boolean
  kills?: number
  deaths?: number
  assists?: number
  totalCs?: number
}

export interface GameCatalogTeamDraft {
  bans: string[]
  picks: string[]
  side?: string
  won?: boolean
}

export interface GameCatalogEntry {
  patch: string
  gameLength?: number | null
  teams: Record<string, GameCatalogTeamDraft>
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
  gd15?: number
  csd15?: number
  xpd15?: number
  dpm?: number
  visionScore?: number
  goldShare?: number
  firstBloodRate?: number
  objControl?: number
  turretPlates?: number
  campsStolen?: number
  soloKills?: number
  wardsDestroyed?: number
  kaPerMin?: number
  dmgGoldRatio?: number
  dmgPerGold?: number
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
  avgGd15?: number
  avgCsd15?: number
  avgXpd15?: number
  avgKaAt15?: number
  firstBloodVictimRate?: number
  towers: number
  dragons: number
  barons: number
  heralds: number
  voidGrubs?: number
  dragonsPerGame?: number
  baronsPerGame?: number
  towersPerGame?: number
  heraldsPerGame?: number
  voidGrubsPerGame?: number
  killsPerGame?: number
  deathsPerGame?: number
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
  avgGd15?: number
  avgXpd15?: number
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

export interface RosterDepthEntry {
  name: string
  team: string
  league: string
  position: string
  games: number
  isStarter: boolean
  isSub: boolean
}

export interface DashboardData {
  meta: DashboardMeta
  players: Player[]
  teams: Team[]
  champions: Champion[]
  matchups: Matchup[]
  teamChampions: TeamChampion[]
  rosterDepth: RosterDepthEntry[]
  gameCatalog: Record<string, GameCatalogEntry>
}

export { DEFAULT_SPLIT } from '../lib/constants'
export {
  leaguesToLeagueLabel,
  leagueLabelToLeagues,
  expandSelectedLeagues,
  yearsToLabel,
  splitsToLabel,
  splitSeasonLabel,
  isAllTier1Selected,
} from '../lib/filterLabels'

export const DEFAULT_LEAGUES: string[] = ['All Tier 1']

interface UseDashboardDataReturn {
  store: OEStore | null
  catalog: OEStoreMeta | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
  selectedYears: string[]
  selectedSplits: string[]
  selectedLeagues: string[]
  setSelectedYears: (years: string[]) => void
  setSelectedSplits: (splits: string[]) => void
  setSelectedLeagues: (leagues: string[]) => void
  toggleYear: (year: string) => void
  toggleSplit: (split: string) => void
  toggleLeague: (league: string) => void
}

export function useDashboardData(): UseDashboardDataReturn {
  const [catalog, setCatalog] = useState<OEStoreMeta | null>(null)
  const [store, setStore] = useState<OEStore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedYears, setSelectedYearsState] = useState<string[]>(['2026'])
  const [selectedSplits, setSelectedSplitsState] = useState<string[]>([DEFAULT_SPLIT])
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(DEFAULT_LEAGUES)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const meta = catalog ?? (await fetchOESliceCatalog())
      if (!catalog) {
        setCatalog(meta)
      }

      const rows = await fetchOESlices({
        leagues: expandSelectedLeagues(selectedLeagues),
        years: selectedYears,
        // Load all splits for selected year(s) so weekly hub includes playoffs;
        // dashboard tab filters still apply selected split at merge time.
        splits: ['ALL'],
        catalogSplits: meta.splits,
      })
      const nextStore = buildStoreFromSliceRows(meta, rows)
      setStore(nextStore)
      setLastUpdated(new Date(nextStore.meta.generated_at))
    } catch (err) {
      setStore(null)
      setError(sanitizeUserFacingError(err))
    } finally {
      setLoading(false)
    }
  }, [catalog, selectedYears, selectedSplits, selectedLeagues])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const setSelectedLeaguesSafe = useCallback((leagues: string[]) => {
    const next = leagues.length ? leagues : ['All Tier 1']
    setSelectedLeagues((prev) => {
      if (prev.length === next.length && prev.every((l, i) => l === next[i])) return prev
      return next
    })
  }, [])

  const setSelectedYears = useCallback((years: string[]) => {
    const next = years.length ? years : ['2026']
    setSelectedYearsState((prev) => {
      if (prev.length === next.length && prev.every((y, i) => y === next[i])) return prev
      return next
    })
  }, [])

  const setSelectedSplits = useCallback((splits: string[]) => {
    const next = splits.length ? splits : [DEFAULT_SPLIT]
    setSelectedSplitsState((prev) => {
      if (prev.length === next.length && prev.every((s, i) => s === next[i])) return prev
      return next
    })
  }, [])

  const toggleLeague = useCallback((league: string) => {
    if (league === 'All Tier 1') {
      setSelectedLeagues(['All Tier 1'])
      return
    }
    setSelectedLeagues((prev) => {
      const base = prev.filter((l) => l !== 'All Tier 1')
      const next = base.includes(league) ? base.filter((l) => l !== league) : [...base, league]
      return next.length ? next : [league]
    })
  }, [])

  const toggleYear = useCallback((year: string) => {
    if (year === 'ALL') {
      setSelectedYearsState(['ALL'])
      return
    }
    setSelectedYearsState((prev) => {
      const base = prev.filter((y) => y !== 'ALL')
      const next = base.includes(year) ? base.filter((y) => y !== year) : [...base, year]
      return next.length ? next : ['2026']
    })
  }, [])

  const toggleSplit = useCallback((split: string) => {
    if (split === 'ALL') {
      setSelectedSplitsState(['ALL'])
      return
    }
    setSelectedSplitsState((prev) => {
      const base = prev.filter((s) => s !== 'ALL')
      const next = base.includes(split) ? base.filter((s) => s !== split) : [...base, split]
      return next.length ? next : [split]
    })
  }, [])

  return {
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
    setSelectedLeagues: setSelectedLeaguesSafe,
    toggleYear,
    toggleSplit,
    toggleLeague,
  }
}
