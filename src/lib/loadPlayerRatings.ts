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
let inflight: Promise<PlayerRatingsBundle | null> | null = null

export async function fetchPlayerRatings(): Promise<PlayerRatingsBundle | null> {
  if (cache) return cache
  if (inflight) return inflight

  inflight = fetch('/data/player_ratings.json')
    .then(async (res) => {
      if (!res.ok) return null
      const data = (await res.json()) as PlayerRatingsBundle
      cache = data
      return data
    })
    .catch(() => null)
    .finally(() => {
      inflight = null
    })

  return inflight
}

export const RATING_ROLES: RatingRole[] = ['top', 'jungle', 'mid', 'adc', 'support']
