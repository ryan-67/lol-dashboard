import type { Champion, Player, Team, GameCatalogEntry } from '../hooks/useDashboardData'
import type { DashboardSlice, OEStore, OEStoreMeta } from './mergeSlices'
import { TIER1_LEAGUES, GUEST_LEAGUE } from './mergeSlices'

export interface HubBootstrapPayload {
  version: number
  generatedAt: string
  year: string
  formDays: number
  asOf: string
  cutoff: string
  meta: OEStoreMeta
  players: Player[]
  teams: Team[]
  champions: Champion[]
  gameCatalog: Record<string, GameCatalogEntry>
  stats?: {
    playerCount: number
    teamCount: number
    championCount: number
    catalogGames: number
  }
}

/** Synthetic split so ALL-splits merge hits each player once (not N× per season label). */
export const hubBootstrapSplit = (year: string): string => `${year} Hub`

let cache: HubBootstrapPayload | null = null
let inflight: Promise<HubBootstrapPayload | null> | null = null

export async function fetchHubBootstrap(opts?: {
  force?: boolean
}): Promise<HubBootstrapPayload | null> {
  if (cache && !opts?.force) return cache
  if (inflight) return inflight

  inflight = fetch(`${import.meta.env.BASE_URL}data/hub_bootstrap.json`, {
    cache: opts?.force ? 'reload' : 'default',
  })
    .then(async (res) => {
      if (!res.ok) return null
      const data = (await res.json()) as HubBootstrapPayload
      if (!data?.players?.length || !data.meta) return null
      cache = data
      return data
    })
    .catch(() => null)
    .finally(() => {
      inflight = null
    })

  return inflight
}

/**
 * Expand lean bootstrap into an OEStore so existing mergeSlices paths work.
 * One synthetic split per year — avoids duplicating players across every
 * Winter/Spring/Summer key (which multiplied games and froze the main thread).
 */
export function storeFromHubBootstrap(boot: HubBootstrapPayload): OEStore {
  const year = boot.year
  const hubSplit = hubBootstrapSplit(year)

  const playersByLeague = new Map<string, Player[]>()
  for (const p of boot.players) {
    const league = p.league || GUEST_LEAGUE
    const list = playersByLeague.get(league) ?? []
    list.push(p)
    playersByLeague.set(league, list)
  }

  const teamsByLeague = new Map<string, Team[]>()
  for (const t of boot.teams) {
    const league = t.league || GUEST_LEAGUE
    const list = teamsByLeague.get(league) ?? []
    list.push(t)
    teamsByLeague.set(league, list)
  }

  const champions = boot.champions
  const catalog = boot.gameCatalog ?? {}
  const emptyMatchups: DashboardSlice['matchups'] = []
  const emptyTeamChamps: DashboardSlice['teamChampions'] = []

  const leagues = [
    ...TIER1_LEAGUES.filter((l) => playersByLeague.has(l) || teamsByLeague.has(l)),
    ...[...playersByLeague.keys()].filter(
      (l) => !(TIER1_LEAGUES as readonly string[]).includes(l),
    ),
  ]

  const slices: Record<string, DashboardSlice> = {}
  for (const league of leagues) {
    const key = `${hubSplit}|${league}`
    slices[key] = {
      players: playersByLeague.get(league) ?? [],
      teams: teamsByLeague.get(league) ?? [],
      champions,
      matchups: emptyMatchups,
      teamChampions: emptyTeamChamps,
      rosterDepth: [],
      gameCatalog: catalog,
    }
  }

  return {
    meta: {
      ...boot.meta,
      // Keep catalog filters elsewhere; store meta drives merge key selection.
      splits: [hubSplit],
      generated_at: boot.meta.generated_at || boot.generatedAt,
      hub_bootstrap: true,
    },
    slices,
  }
}

export function isHubBootstrapStore(store: OEStore | null | undefined): boolean {
  return Boolean(store?.meta?.hub_bootstrap)
}

export function invalidateHubBootstrapCache(): void {
  cache = null
}
