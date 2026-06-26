import type { Champion, PlayerGameLog } from '../hooks/useDashboardData'
import { ROLES, roleForChampion, championPresenceRates, type RoleKey } from './championAnalytics'
import { parseDate } from './weeklyWindow'

export interface WeeklyChampionBuildInput {
  weeklyGames: PlayerGameLog[]
  role: RoleKey
  team: string
}

export interface WeeklyChampionWindow {
  start: string
  end: string
}

export interface WeeklyChampionStats extends Champion {
  weeklyRole: RoleKey
  avgGd15?: number
  avgXpd15?: number
  avgDmgShare?: number
  avgGoldShare?: number
  avgKp?: number
  avgVisionScore?: number
  avgObjControl?: number
  avgFirstBloodRate?: number
}

export interface WeeklyChampionOpEntry {
  champion: WeeklyChampionStats
  role: RoleKey
  opScore: number
  confidence: number
  samplePicks: number
}

export interface WeeklyChampionOpResult {
  top: WeeklyChampionOpEntry | null
  runners: WeeklyChampionOpEntry[]
}

type MetricKey =
  | 'presence'
  | 'pickRate'
  | 'banRate'
  | 'winrate'
  | 'avgKda'
  | 'avgGd15'
  | 'avgCsd15'
  | 'avgXpd15'
  | 'avgDpm'
  | 'avgDmgShare'
  | 'avgGoldShare'
  | 'avgKp'
  | 'avgVisionScore'
  | 'avgObjControl'
  | 'avgFirstBloodRate'

const ROLE_METRIC_WEIGHTS: Record<RoleKey, Partial<Record<MetricKey, number>>> = {
  top: {
    presence: 0.1,
    banRate: 0.06,
    winrate: 0.14,
    avgKda: 0.1,
    avgGd15: 0.14,
    avgCsd15: 0.12,
    avgDpm: 0.1,
    avgDmgShare: 0.12,
    avgXpd15: 0.06,
  },
  jungle: {
    presence: 0.1,
    banRate: 0.06,
    winrate: 0.14,
    avgKda: 0.1,
    avgGd15: 0.1,
    avgKp: 0.14,
    avgObjControl: 0.14,
    avgFirstBloodRate: 0.08,
    avgCsd15: 0.06,
  },
  mid: {
    presence: 0.1,
    banRate: 0.06,
    winrate: 0.14,
    avgKda: 0.1,
    avgGd15: 0.12,
    avgCsd15: 0.1,
    avgDpm: 0.1,
    avgDmgShare: 0.12,
    avgXpd15: 0.06,
  },
  adc: {
    presence: 0.1,
    banRate: 0.06,
    winrate: 0.14,
    avgKda: 0.1,
    avgDpm: 0.14,
    avgDmgShare: 0.14,
    avgGoldShare: 0.1,
    avgGd15: 0.08,
    avgCsd15: 0.04,
  },
  support: {
    presence: 0.1,
    banRate: 0.06,
    winrate: 0.14,
    avgKda: 0.12,
    avgVisionScore: 0.16,
    avgKp: 0.14,
    avgGd15: 0.08,
    avgFirstBloodRate: 0.06,
    avgDmgShare: 0.04,
  },
}

/** Confidence ramps with sample size so 1–2 game outliers don't dominate. */
const CONFIDENCE_FULL_AT = 4

interface Accumulator {
  champion: Champion
  roleCounts: Map<RoleKey, number>
  picks: number
  wins: number
  kda: number
  gd15: number
  csd15: number
  xpd15: number
  dpm: number
  dmgShare: number
  goldShare: number
  kp: number
  visionScore: number
  objControl: number
  firstBloodRate: number
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function zScoreById(items: { id: string; value: number }[]): Map<string, number> {
  if (!items.length) return new Map()
  const values = items.map((i) => i.value)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  const std = Math.sqrt(variance)
  const map = new Map<string, number>()
  for (const item of items) {
    map.set(item.id, std > 0 ? (item.value - mean) / std : 0)
  }
  return map
}

function pickWeeklyRole(counts: Map<RoleKey, number>, fallback: RoleKey): RoleKey {
  let best = fallback
  let max = 0
  for (const role of ROLES) {
    const n = counts.get(role) ?? 0
    if (n > max) {
      max = n
      best = role
    }
  }
  return best
}

function weeklyBansInWindow(champ: Champion | undefined, window: WeeklyChampionWindow): number {
  if (!champ?.weeklyStats?.length) return 0
  const winStart = parseDate(window.start)
  const winEnd = parseDate(window.end)
  if (!winStart || !winEnd) return 0

  let bans = 0
  for (const w of champ.weeklyStats) {
    const weekStart = parseDate(w.weekStart)
    if (!weekStart) continue
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    if (weekStart <= winEnd && weekEnd >= winStart) bans += w.bans ?? 0
  }
  return bans
}

/** Unique matches in the filtered weekly window (gameId preferred). */
function countWeeklyMatches(entries: WeeklyChampionBuildInput[]): number {
  const keys = new Set<string>()
  let anyGameId = false

  for (const { weeklyGames, team } of entries) {
    for (const g of weeklyGames) {
      if (g.gameId) {
        anyGameId = true
        keys.add(g.gameId)
      } else {
        keys.add(`${g.date}|${team}|${g.opponent ?? ''}`)
      }
    }
  }

  if (!keys.size) return 1
  if (anyGameId) return keys.size
  return Math.max(Math.ceil(keys.size / 2), 1)
}

function metricValue(champion: WeeklyChampionStats, key: MetricKey): number {
  switch (key) {
    case 'presence':
      return champion.presence
    case 'pickRate':
      return champion.pickRate ?? 0
    case 'banRate':
      return champion.banRate ?? 0
    case 'winrate':
      return champion.winrate
    case 'avgKda':
      return champion.avgKda
    case 'avgGd15':
      return champion.avgGd15 ?? 0
    case 'avgCsd15':
      return champion.avgCsd15 ?? 0
    case 'avgXpd15':
      return champion.avgXpd15 ?? 0
    case 'avgDpm':
      return champion.avgDpm ?? 0
    case 'avgDmgShare':
      return champion.avgDmgShare ?? 0
    case 'avgGoldShare':
      return champion.avgGoldShare ?? 0
    case 'avgKp':
      return champion.avgKp ?? 0
    case 'avgVisionScore':
      return champion.avgVisionScore ?? 0
    case 'avgObjControl':
      return champion.avgObjControl ?? 0
    case 'avgFirstBloodRate':
      return champion.avgFirstBloodRate ?? 0
    default:
      return 0
  }
}

/** Build per-champion weekly aggregates from player game logs. */
export function buildWeeklyChampionStats(
  entries: WeeklyChampionBuildInput[],
  allChamps: Champion[],
  window: WeeklyChampionWindow,
): WeeklyChampionStats[] {
  const src = new Map(allChamps.map((c) => [c.name, c]))
  const map = new Map<string, Accumulator>()
  const totalGames = countWeeklyMatches(entries)

  for (const { weeklyGames, role } of entries) {
    for (const g of weeklyGames) {
      const name = g.champion
      if (!name) continue

      const base = src.get(name)
      const ex =
        map.get(name) ??
        ({
          champion: {
            name,
            positions: base?.positions ?? [role],
            picks: 0,
            bans: 0,
            presence: 0,
            pickRate: 0,
            banRate: 0,
            winrate: 0,
            avgKda: 0,
            games: 0,
            wins: 0,
          } as Champion,
          roleCounts: new Map<RoleKey, number>(),
          picks: 0,
          wins: 0,
          kda: 0,
          gd15: 0,
          csd15: 0,
          xpd15: 0,
          dpm: 0,
          dmgShare: 0,
          goldShare: 0,
          kp: 0,
          visionScore: 0,
          objControl: 0,
          firstBloodRate: 0,
        } satisfies Accumulator)

      ex.roleCounts.set(role, (ex.roleCounts.get(role) ?? 0) + 1)
      ex.picks += 1
      ex.wins += g.result === 1 ? 1 : 0
      ex.kda += g.kda
      ex.gd15 += g.gd15 ?? 0
      ex.csd15 += g.csd15 ?? 0
      ex.xpd15 += g.xpd15 ?? 0
      ex.dpm += g.dpm
      ex.dmgShare += g.dmgShare
      ex.goldShare += g.goldShare ?? 0
      ex.kp += g.kp
      ex.visionScore += g.visionScore ?? 0
      ex.objControl += g.objControl ?? 0
      ex.firstBloodRate += g.firstBloodRate ?? 0
      map.set(name, ex)
    }
  }

  return [...map.values()]
    .map((row) => {
      const base = src.get(row.champion.name)
      const picks = row.picks
      const bans = weeklyBansInWindow(base, window)
      const { pickRate, banRate, presence } = championPresenceRates(
        { ...row.champion, picks, bans },
        totalGames,
      )
      const fallbackRole = roleForChampion(base ?? row.champion)
      const weeklyRole = pickWeeklyRole(row.roleCounts, fallbackRole)

      return {
        ...row.champion,
        picks,
        games: picks,
        bans,
        pickRate,
        banRate,
        presence,
        avgKda: row.kda / Math.max(picks, 1),
        winrate: (row.wins / Math.max(picks, 1)) * 100,
        avgGd15: row.gd15 / Math.max(picks, 1),
        avgCsd15: row.csd15 / Math.max(picks, 1),
        avgXpd15: row.xpd15 / Math.max(picks, 1),
        avgDpm: row.dpm / Math.max(picks, 1),
        avgDmgShare: row.dmgShare / Math.max(picks, 1),
        avgGoldShare: row.goldShare / Math.max(picks, 1),
        avgKp: row.kp / Math.max(picks, 1),
        avgVisionScore: row.visionScore / Math.max(picks, 1),
        avgObjControl: row.objControl / Math.max(picks, 1),
        avgFirstBloodRate: row.firstBloodRate / Math.max(picks, 1),
        weeklyRole,
      } as WeeklyChampionStats
    })
    .filter((c) => c.picks >= 1)
}

/** Role-aware OP score with sample-size confidence for weekly champion ranking. */
export function computeChampionOfWeekScores(
  champions: WeeklyChampionStats[],
): WeeklyChampionOpResult {
  if (!champions.length) return { top: null, runners: [] }

  const byRole = new Map<RoleKey, WeeklyChampionStats[]>()
  for (const role of ROLES) byRole.set(role, [])
  for (const c of champions) {
    byRole.get(c.weeklyRole)?.push(c)
  }

  const metricZ = new Map<string, Map<MetricKey, number>>()

  for (const role of ROLES) {
    const group = byRole.get(role) ?? []
    if (!group.length) continue
    const weights = ROLE_METRIC_WEIGHTS[role]
    for (const metric of Object.keys(weights) as MetricKey[]) {
      const z = zScoreById(group.map((c) => ({ id: c.name, value: metricValue(c, metric) })))
      for (const c of group) {
        const row = metricZ.get(c.name) ?? new Map<MetricKey, number>()
        row.set(metric, z.get(c.name) ?? 0)
        metricZ.set(c.name, row)
      }
    }
  }

  const scored: WeeklyChampionOpEntry[] = champions.map((champion) => {
    const role = champion.weeklyRole
    const weights = ROLE_METRIC_WEIGHTS[role]
    const zRow = metricZ.get(champion.name) ?? new Map<MetricKey, number>()
    let total = 0
    let weightSum = 0
    for (const [metric, weight] of Object.entries(weights) as [MetricKey, number][]) {
      total += (zRow.get(metric) ?? 0) * weight
      weightSum += weight
    }
    const raw = weightSum > 0 ? total / weightSum : 0
    const confidence = Math.min(1, Math.sqrt(champion.picks / CONFIDENCE_FULL_AT))
    return {
      champion,
      role,
      opScore: round(raw * confidence, 2),
      confidence: round(confidence, 2),
      samplePicks: champion.picks,
    }
  })

  scored.sort((a, b) => b.opScore - a.opScore)

  return {
    top: scored[0] ?? null,
    runners: scored.slice(1, 5),
  }
}

/** Helper for overview weekly player rows. */
export function buildWeeklyChampionStatsFromPlayers(
  weeklyPlayers: Array<{ role: RoleKey; weeklyGames: PlayerGameLog[]; base: { team: string } }>,
  allChamps: Champion[],
  window: WeeklyChampionWindow,
): WeeklyChampionStats[] {
  return buildWeeklyChampionStats(
    weeklyPlayers.map((wp) => ({
      weeklyGames: wp.weeklyGames,
      role: wp.role,
      team: wp.base.team,
    })),
    allChamps,
    window,
  )
}
