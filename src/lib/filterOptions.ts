import { splitSeasonLabel } from './filterLabels'
import { splitSortKey } from './mergeSlices'

/** Canonical season labels shown when year = ALL (deduped across years). */
export const CANONICAL_SEASON_ORDER = [
  'Winter',
  'First Stand',
  'Spring',
  'MSI',
  'Summer',
  'Worlds',
] as const

export type CanonicalSeason = (typeof CANONICAL_SEASON_ORDER)[number]

export function seasonFromSplitLabel(split: string): string {
  return splitSeasonLabel(split)
}

/** Seasons present in catalog (one entry per canonical name). */
export function canonicalSeasonsInCatalog(catalogSplits: string[]): CanonicalSeason[] {
  const present = new Set<string>()
  for (const split of catalogSplits) {
    present.add(seasonFromSplitLabel(split))
  }
  return CANONICAL_SEASON_ORDER.filter((s) => present.has(s))
}

export interface SplitOption {
  value: string
  label: string
}

/** Entity pages: when year is ALL, show deduped canonical seasons only. */
export function entitySplitOptions(catalogSplits: string[], year: string): SplitOption[] {
  if (year === 'ALL') {
    return canonicalSeasonsInCatalog(catalogSplits).map((season) => ({
      value: season,
      label: season,
    }))
  }
  return catalogSplits
    .filter((s) => s.startsWith(`${year} `))
    .sort((a, b) => {
      const ka = splitSortKey(a)
      const kb = splitSortKey(b)
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2])
    })
    .map((s) => ({ value: s, label: splitSeasonLabel(s) }))
}

/** Main dashboard: use full split label when multiple years are selected (avoids duplicate "Spring"). */
export function mainTabSplitOptions(
  catalogSplits: string[],
  selectedYears: string[],
): SplitOption[] {
  const useFullLabel = selectedYears.length > 1
  return catalogSplits.map((s) => ({
    value: s,
    label: useFullLabel ? s : splitSeasonLabel(s),
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

  // Canonical season name (e.g. "Spring") when year is ALL or specific year
  if (!/^\d{4}/.test(split)) {
    return catalogSplits.filter((s) => {
      if (!isAllYear && !s.startsWith(`${year} `)) return false
      return seasonFromSplitLabel(s) === split
    })
  }

  return catalogSplits.includes(split) ? [split] : [split]
}
