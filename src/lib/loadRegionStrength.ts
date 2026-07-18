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
  eloScale?: number
  baseRating?: number
  methodology?: string
  regions: Record<string, number>
  teams: Record<string, RegionStrengthTeam>
}

let cache: RegionStrengthBundle | null = null
let inflight: Promise<RegionStrengthBundle | null> | null = null

export async function fetchRegionStrength(): Promise<RegionStrengthBundle | null> {
  if (cache) return cache
  if (inflight) return inflight

  inflight = fetch('/data/region_strength.json')
    .then(async (res) => {
      if (!res.ok) return null
      const data = (await res.json()) as RegionStrengthBundle
      cache = data
      return data
    })
    .catch(() => null)
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
