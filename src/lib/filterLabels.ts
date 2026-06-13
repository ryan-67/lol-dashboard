import { TIER1_LEAGUES } from './mergeSlices'

export function expandSelectedLeagues(leagues: string[]): string[] {
  if (!leagues.length || leagues.includes('All Tier 1')) return [...TIER1_LEAGUES]
  return leagues.filter((l) => l !== 'All Tier 1')
}

export function leaguesToLeagueLabel(leagues: string[]): string {
  if (leagues.includes('All Tier 1')) return 'All Tier 1'
  const tier1 = TIER1_LEAGUES as readonly string[]
  if (leagues.length === tier1.length && tier1.every((l) => leagues.includes(l))) {
    return 'All Tier 1'
  }
  if (leagues.length === 1) return leagues[0]!
  return [...leagues].sort().join(' + ')
}

export function leagueLabelToLeagues(league: string): string[] {
  return league === 'All Tier 1' ? ['All Tier 1'] : [league]
}

export function yearsToLabel(years: string[]): string {
  if (years.includes('ALL')) return 'ALL'
  if (years.length === 1) return years[0]!
  return [...years].sort().join(' + ')
}

export function splitsToLabel(splits: string[]): string {
  if (splits.includes('ALL')) return 'ALL'
  if (splits.length === 1) return splitSeasonLabel(splits[0]!)
  return splits.map(splitSeasonLabel).join(' + ')
}

export function splitSeasonLabel(split: string): string {
  return split.replace(/^\d{4}\s+/, '')
}

export function isAllTier1Selected(leagues: string[]): boolean {
  if (leagues.includes('All Tier 1')) return true
  const tier1 = TIER1_LEAGUES as readonly string[]
  return tier1.length === leagues.length && tier1.every((l) => leagues.includes(l))
}
