/**
 * Pocket-pick / "pulled out [champ]" gating.
 * Reserved for truly rare or off-role surprises — not every low-sample pick.
 */

import type { Champion } from '../hooks/useDashboardData'
import type { RoleKey } from './playerRadar'
import { normalizePosition } from './playerRadar'

export interface PocketPickCandidate {
  name: string
  champions: string[]
  role: RoleKey | null
  avgKda: number
}

export interface PocketPickResult {
  name: string
  champion: string
  role: RoleKey | null
  reason: 'bottom_presence' | 'off_role'
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Champions in the bottom `percentile` of presence/pickrate (default bottom 5%). */
export function bottomPresenceChampions(
  champions: Champion[],
  percentile = 0.05,
): Set<string> {
  const ranked = champions
    .filter((c) => c.name)
    .map((c) => ({
      name: c.name,
      rate: c.pickRate ?? c.presence ?? 0,
      picks: c.picks ?? 0,
    }))
    .sort((a, b) => a.rate - b.rate || a.picks - b.picks)

  if (!ranked.length) return new Set()

  const cutIdx = Math.max(0, Math.ceil(ranked.length * percentile) - 1)
  const cutoffRate = ranked[cutIdx]!.rate
  const rare = new Set<string>()
  for (const row of ranked) {
    if (row.rate <= cutoffRate) rare.add(row.name.toLowerCase())
    else break
  }
  return rare
}

/**
 * Champions with a noticeable presence rise over the last 1–2 weeks.
 * Uses weeklyStats when available; otherwise falls back to gameDates density.
 */
export function risingPresenceChampions(
  champions: Champion[],
  asOfDate: string,
): Set<string> {
  const asOf = parseDate(asOfDate)
  if (!asOf) return new Set()

  const rising = new Set<string>()
  const recentStart = new Date(asOf.getTime() - 14 * MS_PER_DAY)
  const priorStart = new Date(asOf.getTime() - 28 * MS_PER_DAY)

  for (const c of champions) {
    const weeks = c.weeklyStats ?? []
    if (weeks.length >= 2) {
      const recent = weeks.filter((w) => {
        const d = parseDate(w.weekStart)
        return d && d >= recentStart && d <= asOf
      })
      const prior = weeks.filter((w) => {
        const d = parseDate(w.weekStart)
        return d && d >= priorStart && d < recentStart
      })
      const recentAvg =
        recent.reduce((s, w) => s + (w.presence ?? 0), 0) / Math.max(recent.length, 1)
      const priorAvg =
        prior.reduce((s, w) => s + (w.presence ?? 0), 0) / Math.max(prior.length, 1)
      const recentPicks = recent.reduce((s, w) => s + (w.picks ?? 0), 0)
      if (recentPicks >= 3 && recentAvg >= Math.max(priorAvg * 2, priorAvg + 5)) {
        rising.add(c.name.toLowerCase())
        continue
      }
    }

    const dates = (c.gameDates ?? []).filter(Boolean)
    if (dates.length >= 4) {
      const recentCount = dates.filter((d) => {
        const dt = parseDate(d)
        return dt && dt >= recentStart && dt <= asOf
      }).length
      const priorCount = dates.filter((d) => {
        const dt = parseDate(d)
        return dt && dt >= priorStart && dt < recentStart
      }).length
      if (recentCount >= 3 && recentCount >= Math.max(priorCount * 2, priorCount + 3)) {
        rising.add(c.name.toLowerCase())
      }
    }
  }

  return rising
}

function primaryRoleForChampion(champ: Champion | undefined): RoleKey | null {
  if (!champ) return null
  if (champ.primaryRole) return normalizePosition(champ.primaryRole)
  for (const pos of champ.positions ?? []) {
    const n = normalizePosition(pos)
    if (n) return n
  }
  return null
}

/** Unexpected role (e.g. Rumble mid when almost always top). */
export function isOffRolePick(
  championName: string,
  playedRole: RoleKey | null,
  champions: Champion[],
): boolean {
  if (!playedRole) return false
  const champ = champions.find((c) => c.name.toLowerCase() === championName.toLowerCase())
  const primary = primaryRoleForChampion(champ)
  if (!primary) return false
  return primary !== playedRole
}

/**
 * Pocket pick only when:
 * - champ is bottom 5% presence/pickrate AND not a recent riser, OR
 * - champ is played off its typical role
 * Player must also have low personal history on the champ (≤3 games) unless off-role.
 */
export function findPocketPick(
  candidates: PocketPickCandidate[],
  champions: Champion[],
  asOfDate: string,
  playerChampGames?: Map<string, Map<string, number>>,
): PocketPickResult | null {
  if (!candidates.length || !champions.length) return null

  const rare = bottomPresenceChampions(champions, 0.05)
  const rising = risingPresenceChampions(champions, asOfDate)

  let best: PocketPickResult | null = null
  let bestScore = -1

  for (const p of candidates) {
    if (p.avgKda < 2.5) continue
    for (const champ of p.champions) {
      if (!champ) continue
      const key = champ.toLowerCase()
      const career = playerChampGames?.get(p.name.toLowerCase())?.get(key) ?? 99
      const offRole = isOffRolePick(champ, p.role, champions)
      const bottomRare = rare.has(key) && !rising.has(key)

      if (!bottomRare && !offRole) continue
      if (rising.has(key) && !offRole) continue
      if (!offRole && career > 3) continue
      if (offRole && career > 8) continue

      const score =
        (bottomRare ? 50 : 0) +
        (offRole ? 40 : 0) +
        Math.max(0, 10 - career) +
        p.avgKda
      if (score > bestScore) {
        bestScore = score
        best = {
          name: p.name,
          champion: champ,
          role: p.role,
          reason: offRole && !bottomRare ? 'off_role' : 'bottom_presence',
        }
      }
    }
  }

  return best
}
