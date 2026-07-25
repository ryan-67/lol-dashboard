import {
  selectSliceKeysFromFilters,
  sliceKey,
  splitSortKey,
  TIER1_LEAGUES,
  type OEStore,
} from './mergeSlices'
import { DEFAULT_SPLIT, DEFAULT_YEAR } from './constants'
import { resolveSplitLabelsForMerge } from './filterOptions'
import { combinedFilterForCatalogSeason, normalizeToCombinedFilterValue } from './splitGroups'
import { parseCanonicalSplit } from './tournamentCatalog'

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

/** True when a split filter (incl. combined groups) has tier-1 player/team data.
 * Guest/INT-only slices (e.g. a leftover "2026 Summer|INT" with FURIA) must not
 * count — otherwise Summer becomes the default before domestic Summer starts. */
export function splitHasGameData(store: OEStore, split: string, year = DEFAULT_YEAR): boolean {
  const labels = resolveSplitLabelsForMerge(store.meta.splits, year, split)
  const splitLabels = labels.length ? labels : [split]
  for (const label of splitLabels) {
    for (const league of TIER1_LEAGUES) {
      const slice = store.slices[sliceKey(label, league)]
      if (!slice) continue
      if ((slice.players ?? []).some((p) => (p.games ?? 0) > 0 || (p.gameLog?.length ?? 0) > 0)) {
        return true
      }
      if ((slice.teams ?? []).some((t) => (t.games ?? 0) > 0)) return true
      // Early-week slices may only have rosterDepth / weeklyTeamGames until
      // players clear the old sample floor — still count as "has data".
      if ((slice.rosterDepth ?? []).some((r) => (r.games ?? 0) > 0)) return true
      if (Object.keys(slice.weeklyTeamGames ?? {}).length > 0) return true
    }
  }
  // Fall back to the broader key selector only for non-year-prefixed filters.
  if (!/^\d{4}\s/.test(split) && !splitLabels.some((l) => /^\d{4}\s/.test(l))) {
    const keys = selectSliceKeysFromFilters(store, ['All Tier 1'], [year], splitLabels)
    for (const key of keys) {
      if (key.endsWith('|INT')) continue
      const slice = store.slices[key]
      if (!slice) continue
      if ((slice.players ?? []).some((p) => (p.games ?? 0) > 0 || (p.gameLog?.length ?? 0) > 0)) {
        return true
      }
      if ((slice.teams ?? []).some((t) => (t.games ?? 0) > 0)) return true
      if ((slice.rosterDepth ?? []).some((r) => (r.games ?? 0) > 0)) return true
      if (Object.keys(slice.weeklyTeamGames ?? {}).length > 0) return true
    }
  }
  return false
}

/** Default split for main tabs — combined group with the newest game data (Spring incl. MSI, not MSI alone). */
export function pickDefaultDashboardSplit(
  catalogSplits: string[],
  store: OEStore | null,
  year = DEFAULT_YEAR,
  fallback = DEFAULT_SPLIT,
): string {
  if (store) {
    const yearSplits = catalogSplits.filter((s) => s.startsWith(`${year} `))
    for (const split of splitsNewestFirst(yearSplits)) {
      if (!splitHasGameData(store, split, year)) continue
      const { season } = parseCanonicalSplit(split)
      const leader = combinedFilterForCatalogSeason(season)
      return `${year} ${leader}`
    }
  }
  const normalized = normalizeToCombinedFilterValue(catalogSplits, fallback)
  if (/^\d{4}\s+/.test(normalized)) return normalized
  return defaultMainTabSplit(catalogSplits, year, `${year} Spring`)
}

export function yearFromSplitLabel(split: string, fallback = '2026'): string {
  return split.split(' ', 1)[0] ?? fallback
}
