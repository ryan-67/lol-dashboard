export interface RegionStrengthTeam {
  homeRegion: string
  rating: number
  teamEloOnly?: number
  regionRating?: number
  ratingDeviation?: number
  daysSinceLastSeries?: number
}

export interface RegionStrengthBundle {
  generatedAt: string
  /** Last series date included in OE/Riot walk-forward (YYYY-MM-DD). */
  eloAsOf?: string
  eloScale?: number
  baseRating?: number
  methodology?: string
  regions: Record<string, number>
  teams: Record<string, RegionStrengthTeam>
  citoEloBump?: {
    appliedAt: string
    seriesApplied: number
    lookbackDays: number
    matchIds: string[]
  } | null
}

let cache: RegionStrengthBundle | null = null
let cacheAt = 0
let inflight: Promise<RegionStrengthBundle | null> | null = null

/** Re-fetch model artifacts periodically so Predictions odds track retrain exports. */
const ARTIFACT_TTL_MS = 5 * 60_000

export function invalidateRegionStrengthCache(): void {
  cache = null
  cacheAt = 0
}

export async function fetchRegionStrength(opts?: {
  force?: boolean
}): Promise<RegionStrengthBundle | null> {
  const stale = !cache || Date.now() - cacheAt > ARTIFACT_TTL_MS
  if (cache && !stale && !opts?.force) return cache
  if (inflight) return inflight

  inflight = fetch('/data/region_strength.json', { cache: opts?.force ? 'reload' : 'default' })
    .then(async (res) => {
      if (!res.ok) return cache
      const data = (await res.json()) as RegionStrengthBundle
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

export function lookupTeamElo(
  bundle: RegionStrengthBundle | null,
  teamName: string,
): number | null {
  if (!bundle?.teams) return null
  const direct = bundle.teams[teamName]
  if (direct) return direct.rating
  const lower = teamName.toLowerCase()
  for (const [name, row] of Object.entries(bundle.teams)) {
    if (name.toLowerCase() === lower) return row.rating
  }
  return null
}
