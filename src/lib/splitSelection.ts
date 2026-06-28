import { selectSliceKeysFromFilters, splitSortKey, type OEStore } from './mergeSlices'
import { DEFAULT_SPLIT, DEFAULT_YEAR } from './constants'

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

export function defaultMainTabSplit(splits: string[], year = DEFAULT_YEAR, fallback = DEFAULT_SPLIT): string {
  const ordered = splitsNewestFirst(splits)
  return (
    ordered.find((s) => s.startsWith(`${year} `)) ??
    ordered.find((s) => s.endsWith(' Spring')) ??
    ordered[0] ??
    fallback
  )
}

/** True when a split has at least one player game log or team row in the store. */
export function splitHasGameData(store: OEStore, split: string, year = DEFAULT_YEAR): boolean {
  const keys = selectSliceKeysFromFilters(store, ['All Tier 1'], [year], [split])
  for (const key of keys) {
    const slice = store.slices[key]
    if (!slice) continue
    if ((slice.players ?? []).some((p) => (p.gameLog?.length ?? 0) > 0)) return true
    if ((slice.teams ?? []).some((t) => (t.games ?? 0) > 0)) return true
  }
  return false
}

/** Default split for main tabs — newest split with actual data, else catalog order. */
export function pickDefaultDashboardSplit(
  catalogSplits: string[],
  store: OEStore | null,
  year = DEFAULT_YEAR,
  fallback = DEFAULT_SPLIT,
): string {
  if (store) {
    const withData = pickNewestSplitWithData(
      catalogSplits,
      (split) => splitHasGameData(store, split, year),
      year,
    )
    if (withData) return withData
  }
  return defaultMainTabSplit(catalogSplits, year, fallback)
}

export function yearFromSplitLabel(split: string, fallback = '2026'): string {
  return split.split(' ', 1)[0] ?? fallback
}
