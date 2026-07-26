import { TIER1_LEAGUES } from './mergeSlices'
import { expandSelectedLeagues, isAllTier1Selected } from './filterLabels'

export type PowerRegionId = 'LCK' | 'LPL' | 'LEC' | 'LCS'
export type PowerRegions = 'all' | readonly PowerRegionId[]

/** Map dashboard LEAGUE selection → model board region filter. */
export function powerRegionsFromSelectedLeagues(selectedLeagues: string[]): PowerRegions {
  if (isAllTier1Selected(selectedLeagues)) return 'all'
  const expanded = expandSelectedLeagues(selectedLeagues)
  const regions = (TIER1_LEAGUES as readonly string[]).filter((l) =>
    expanded.includes(l),
  ) as PowerRegionId[]
  if (regions.length === 0 || regions.length === TIER1_LEAGUES.length) return 'all'
  return regions
}

/** Match a model row's home region against the active power-region filter. */
export function matchPowerRegion(
  homeRegion: string | undefined,
  regions: PowerRegions | 'all' | readonly string[],
): boolean {
  if (regions === 'all') return true
  const r = (homeRegion ?? '').toUpperCase()
  return regions.some((f) => {
    const filter = String(f).toUpperCase()
    // LTA N / bare LTA = 2025 NA. LTA S = CBLOL/LLA — never treat as LCS.
    if (filter === 'LCS') return r === 'LCS' || r === 'LTA' || r === 'LTA N'
    return r === filter
  })
}

export function isTier1HomeRegion(homeRegion: string | undefined): boolean {
  const r = (homeRegion ?? '').toUpperCase()
  return r === 'LCK' || r === 'LPL' || r === 'LEC' || r === 'LCS' || r === 'LTA' || r === 'LTA N'
}
