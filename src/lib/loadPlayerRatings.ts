export type RatingRole = 'top' | 'jungle' | 'mid' | 'adc' | 'support'

export interface PlayerPowerRow {
  rank: number
  player: string
  team: string
  region: string
  games: number
  effGames: number
  boxScoreZ: number
  regionShift: number
  powerScore: number
}

export interface PlayerRatingsBundle {
  version: string
  generatedAt: string
  roles: Record<RatingRole, PlayerPowerRow[]>
}

let cache: PlayerRatingsBundle | null = null
let cacheAt = 0
let inflight: Promise<PlayerRatingsBundle | null> | null = null

const ARTIFACT_TTL_MS = 5 * 60_000

export function invalidatePlayerRatingsCache(): void {
  cache = null
  cacheAt = 0
}

export async function fetchPlayerRatings(opts?: {
  force?: boolean
}): Promise<PlayerRatingsBundle | null> {
  const stale = !cache || Date.now() - cacheAt > ARTIFACT_TTL_MS
  if (cache && !stale && !opts?.force) return cache
  if (inflight) return inflight

  // Prefer HTTP/CDN cache; memory TTL still refreshes after retrain publishes.
  inflight = fetch('/data/player_ratings.json', { cache: opts?.force ? 'reload' : 'default' })
    .then(async (res) => {
      if (!res.ok) return cache
      const data = (await res.json()) as PlayerRatingsBundle
      cache = data
      cacheAt = Date.now()
      return data
    })
    .catch(() => cache)
    .finally(() => {
      inflight = null
    })

  return inflight
}

export const RATING_ROLES: RatingRole[] = ['top', 'jungle', 'mid', 'adc', 'support']
