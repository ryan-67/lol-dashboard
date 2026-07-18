import { parseCanonicalSplit } from './tournamentCatalog'

/** UI filter groups — international events merge into their regional season bucket. */
export const COMBINED_SPLIT_GROUPS = [
  { filterValue: 'Winter', label: 'Winter', catalogSeasons: ['Winter', 'First Stand'] as const },
  // EWC sits after MSI and before regional Summer on the competitive calendar.
  { filterValue: 'Spring', label: 'Spring', catalogSeasons: ['Spring', 'MSI', 'EWC'] as const },
  { filterValue: 'Summer', label: 'Summer', catalogSeasons: ['Summer', 'Worlds'] as const },
] as const

export type CombinedSplitFilter = (typeof COMBINED_SPLIT_GROUPS)[number]['filterValue']

const GROUP_BY_SEASON = new Map<string, (typeof COMBINED_SPLIT_GROUPS)[number]>()
for (const group of COMBINED_SPLIT_GROUPS) {
  for (const season of group.catalogSeasons) {
    GROUP_BY_SEASON.set(season, group)
  }
}

/** Map a catalog season (MSI, First Stand, …) to its combined filter leader (Spring, Winter, …). */
export function combinedFilterForCatalogSeason(season: string): string {
  return GROUP_BY_SEASON.get(season)?.filterValue ?? season
}

/** Expand catalog split labels to include sibling events in the same combined group. */
export function expandCombinedSplitLabels(catalogSplits: string[], labels: string[]): string[] {
  const out = new Set<string>()
  for (const label of labels) {
    if (label === 'ALL' || label === 'all') continue
    out.add(label)
    const { year, season } = parseCanonicalSplit(label)
    if (!year || !season) continue
    const group = GROUP_BY_SEASON.get(season)
    if (!group) continue
    for (const sub of group.catalogSeasons) {
      const full = `${year} ${sub}`
      if (catalogSplits.includes(full)) out.add(full)
    }
  }
  return [...out].filter((s) => catalogSplits.includes(s))
}

/** Combined split dropdown values for a single competitive year (e.g. 2026 Spring = Spring + MSI). */
export function combinedSplitFilterValues(catalogSplits: string[], year: string): string[] {
  const values: string[] = []
  for (const group of COMBINED_SPLIT_GROUPS) {
    const hasAny = group.catalogSeasons.some((season) => catalogSplits.includes(`${year} ${season}`))
    if (hasAny) values.push(`${year} ${group.filterValue}`)
  }
  return values
}

/** Normalize legacy standalone international filters to their combined group leader. */
export function normalizeToCombinedFilterValue(catalogSplits: string[], split: string): string {
  if (split === 'ALL' || split === 'all' || /^\d{4}\s+(Winter|Spring|Summer)$/.test(split)) {
    return split
  }
  const { year, season } = parseCanonicalSplit(split)
  if (!year || !season) return split
  const leader = combinedFilterForCatalogSeason(season)
  const normalized = `${year} ${leader}`
  if (leader !== season && catalogSplits.some((s) => s.startsWith(`${year} `))) {
    return normalized
  }
  return split
}
