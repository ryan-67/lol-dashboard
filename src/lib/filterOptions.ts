import { splitSeasonLabel } from './filterLabels'
import {
  COMBINED_SPLIT_GROUPS,
  combinedSplitFilterValues,
  expandCombinedSplitLabels,
} from './splitGroups'
import { parseCanonicalSplit } from './tournamentCatalog'

/** Canonical season labels shown when year = ALL (deduped across years). */
export const CANONICAL_SEASON_ORDER = [
  'Winter',
  'Spring',
  'Summer',
] as const

export type CanonicalSeason = (typeof CANONICAL_SEASON_ORDER)[number]

export function seasonFromSplitLabel(split: string): string {
  return splitSeasonLabel(split)
}

/** Combined group leaders present in catalog (Winter / Spring / Summer). */
export function canonicalSeasonsInCatalog(catalogSplits: string[]): CanonicalSeason[] {
  const present = new Set<string>()
  for (const split of catalogSplits) {
    const { season } = parseCanonicalSplit(split)
    for (const group of COMBINED_SPLIT_GROUPS) {
      if ((group.catalogSeasons as readonly string[]).includes(season)) {
        present.add(group.filterValue)
      }
    }
  }
  return CANONICAL_SEASON_ORDER.filter((s) => present.has(s))
}

export interface SplitOption {
  value: string
  label: string
}

/** Entity pages: combined Winter/Spring/Summer (international events included). */
export function entitySplitOptions(catalogSplits: string[], year: string): SplitOption[] {
  if (year === 'ALL') {
    return canonicalSeasonsInCatalog(catalogSplits).map((season) => ({
      value: season,
      label: season,
    }))
  }
  return combinedSplitFilterValues(catalogSplits, year).map((value) => ({
    value,
    label: splitSeasonLabel(value),
  }))
}

/** Main dashboard split filter — combined groups when a single year is selected. */
export function mainTabSplitOptions(
  catalogSplits: string[],
  selectedYears: string[],
): SplitOption[] {
  if (selectedYears.includes('ALL')) {
    return canonicalSeasonsInCatalog(catalogSplits).map((season) => ({
      value: season,
      label: season,
    }))
  }
  if (selectedYears.length === 1) {
    return combinedSplitFilterValues(catalogSplits, selectedYears[0]!).map((value) => ({
      value,
      label: splitSeasonLabel(value),
    }))
  }
  return catalogSplits.map((s) => ({
    value: s,
    label: s,
  }))
}

/** Resolve split filter to concrete catalog split labels for merging. */
export function resolveSplitLabelsForMerge(
  catalogSplits: string[],
  year: string | undefined,
  split: string,
): string[] {
  const isAllYear = !year || year === 'ALL' || year === 'all'
  const isAllSplit = split === 'ALL' || split === 'all'

  if (isAllSplit) {
    if (isAllYear) return [...catalogSplits]
    return catalogSplits.filter((s) => s.startsWith(`${year} `))
  }

  let base: string[] = []

  // Combined group leader when year is ALL (e.g. "Spring" → all Spring+MSI across years).
  if (!/^\d{4}/.test(split) && isAllYear) {
    for (const group of COMBINED_SPLIT_GROUPS) {
      if (group.filterValue !== split) continue
      base = catalogSplits.filter((s) =>
        (group.catalogSeasons as readonly string[]).includes(parseCanonicalSplit(s).season),
      )
      break
    }
    if (!base.length) {
      base = catalogSplits.filter((s) => parseCanonicalSplit(s).season === split)
    }
  } else if (!/^\d{4}/.test(split)) {
    // Canonical season name with a specific year (e.g. "Spring" + year 2026).
    base = catalogSplits.filter((s) => {
      if (!isAllYear && !s.startsWith(`${year} `)) return false
      const { season } = parseCanonicalSplit(s)
      const group = COMBINED_SPLIT_GROUPS.find((g) => g.filterValue === split)
      if (group) return (group.catalogSeasons as readonly string[]).includes(season)
      return season === split
    })
  } else if (catalogSplits.includes(split)) {
    base = [split]
  } else {
    base = [split]
  }

  return expandCombinedSplitLabels(catalogSplits, base)
}
