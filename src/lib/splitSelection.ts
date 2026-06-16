import { splitSortKey } from './mergeSlices'

/** Newest split labels first (year desc, season desc). */
export function splitsNewestFirst(splits: string[]): string[] {
  return [...splits].sort((a, b) => {
    const ka = splitSortKey(a)
    const kb = splitSortKey(b)
    if (ka[0] !== kb[0]) return kb[0] - ka[0]
    if (ka[1] !== kb[1]) return kb[1] - ka[1]
    return kb[2].localeCompare(ka[2])
  })
}

/**
 * Pick the chronologically newest split where `hasData` returns true.
 * Entity pages use this instead of inheriting the dashboard split (which may be Winter / First Stand).
 */
export function pickNewestSplitWithData(
  catalogSplits: string[],
  hasData: (split: string) => boolean,
  preferredYear?: string,
): string | null {
  const ordered = splitsNewestFirst(catalogSplits)
  if (preferredYear) {
    const yearFirst = [
      ...ordered.filter((s) => s.startsWith(`${preferredYear} `)),
      ...ordered.filter((s) => !s.startsWith(`${preferredYear} `)),
    ]
    for (const split of yearFirst) {
      if (hasData(split)) return split
    }
    return null
  }
  for (const split of ordered) {
    if (hasData(split)) return split
  }
  return null
}

export function yearFromSplitLabel(split: string, fallback = '2026'): string {
  return split.split(' ', 1)[0] ?? fallback
}
