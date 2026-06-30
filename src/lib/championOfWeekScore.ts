import type { Champion, PlayerGameLog } from '../hooks/useDashboardData'
import {
  dmgGoldRatioFromGame,
  dmgPerGoldFromGame,
} from './advancedStats'
import { ROLES, roleForChampion, championPresenceRates, type RoleKey } from './championAnalytics'
import {
  ROLE_METRICS,
  ROLE_PERFORMANCE_SCORE_WEIGHTS,
  type RadarMetricKey,
} from './playerRadar'
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
  avgCsd15?: number
  avgDpm?: number
  avgDmgShare?: number
  avgGoldShare?: number
  avgKp?: number
  avgVisionScore?: number
  avgObjControl?: number
  avgFirstBloodRate?: number
  avgTurretPlates?: number
  avgKaPerMin?: number
  avgDmgGoldRatio?: number
  avgDmgPerGold?: number
  avgWardsDestroyed?: number
  avgCampsStolen?: number
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

/** Draft/meta metrics shared across roles (30% of OP score). */
type DraftMetricKey = 'presence' | 'pickRate' | 'banRate' | 'winrate'

const DRAFT_METRIC_WEIGHTS: Record<DraftMetricKey, number> = {
  presence: 0.08,
  pickRate: 0.06,
  banRate: 0.06,
  winrate: 0.1,
}

const INGAME_SCORE_SHARE = 0.7

type OpMetricKey = DraftMetricKey | `ingame:${RadarMetricKey}`

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
  turretPlates: number
  kaPerMin: number
  dmgGoldRatio: number
  dmgPerGold: number
  wardsDestroyed: number
  campsStolen: number
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

/** Role-aware OP weights: draft/meta (30%) + in-game radar metrics (70%, same weights as player performance score). */
function buildOpWeightsForRole(role: RoleKey): Map<OpMetricKey, number> {
  const weights = new Map<OpMetricKey, number>()
  for (const [key, w] of Object.entries(DRAFT_METRIC_WEIGHTS) as [DraftMetricKey, number][]) {
    weights.set(key, w)
  }

  const ingame = ROLE_PERFORMANCE_SCORE_WEIGHTS[role]
  const ingameSum = Object.values(ingame).reduce((a, b) => a + b, 0)
  if (ingameSum <= 0) return weights

  for (const [key, w] of Object.entries(ingame) as [RadarMetricKey, number][]) {
    weights.set(`ingame:${key}`, (w / ingameSum) * INGAME_SCORE_SHARE)
  }
  return weights
}

function ingameMetricValue(champion: WeeklyChampionStats, key: RadarMetricKey): number {
  switch (key) {
    case 'kda':
      return champion.avgKda
    case 'gd15':
      return champion.avgGd15 ?? 0
    case 'csd15':
      return champion.avgCsd15 ?? 0
    case 'xpd15':
      return champion.avgXpd15 ?? 0
    case 'dpm':
      return champion.avgDpm ?? 0
    case 'dmgShare':
      return champion.avgDmgShare ?? 0
    case 'goldShare':
      return champion.avgGoldShare ?? 0
    case 'kp':
      return champion.avgKp ?? 0
    case 'visionScore':
      return champion.avgVisionScore ?? 0
    case 'objControl':
      return champion.avgObjControl ?? 0
    case 'firstBloodRate':
      return champion.avgFirstBloodRate ?? 0
    case 'turretPlates':
      return champion.avgTurretPlates ?? 0
    case 'kaPerMin':
      return champion.avgKaPerMin ?? 0
    case 'dmgGoldRatio':
      return champion.avgDmgGoldRatio ?? 0
    case 'dmgPerGold':
      return champion.avgDmgPerGold ?? 0
    case 'wardsDestroyed':
      return champion.avgWardsDestroyed ?? 0
    case 'campsStolen':
      return champion.avgCampsStolen ?? 0
    default:
      return 0
  }
}

function opMetricValue(champion: WeeklyChampionStats, key: OpMetricKey): number {
  if (key === 'presence') return champion.presence
  if (key === 'pickRate') return champion.pickRate ?? 0
  if (key === 'banRate') return champion.banRate ?? 0
  if (key === 'winrate') return champion.winrate
  return ingameMetricValue(champion, key.replace('ingame:', '') as RadarMetricKey)
}

/** Radar value for a weekly champion aggregate (for display in the hub card). */
export function weeklyChampionRadarValue(
  champion: WeeklyChampionStats,
  key: RadarMetricKey,
): number | null {
  const v = ingameMetricValue(champion, key)
  return Number.isFinite(v) ? v : null
}

/** Role-specific stat rows for the Champion of the Week/Month card. */
export function championOpStatBreakdown(
  entry: WeeklyChampionOpEntry,
): Array<{ label: string; value: string }> {
  const c = entry.champion
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Presence', value: `${c.presence.toFixed(1)}%` },
    { label: 'Pick rate', value: `${(c.pickRate ?? 0).toFixed(1)}%` },
    { label: 'Ban rate', value: `${(c.banRate ?? 0).toFixed(1)}%` },
    { label: 'Win rate', value: `${c.winrate.toFixed(1)}%` },
  ]

  for (const def of ROLE_METRICS[entry.role]) {
    const raw = weeklyChampionRadarValue(c, def.key)
    if (raw == null) continue
    rows.push({ label: def.shortLabel, value: def.format(raw) })
  }
  return rows
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
          turretPlates: 0,
          kaPerMin: 0,
          dmgGoldRatio: 0,
          dmgPerGold: 0,
          wardsDestroyed: 0,
          campsStolen: 0,
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
      ex.turretPlates += g.turretPlates ?? 0
      ex.kaPerMin += g.kaPerMin ?? 0
      ex.dmgGoldRatio += dmgGoldRatioFromGame(g) ?? 0
      ex.dmgPerGold += dmgPerGoldFromGame(g) ?? 0
      ex.wardsDestroyed += g.wardsDestroyed ?? 0
      ex.campsStolen += g.campsStolen ?? 0
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
      const div = Math.max(picks, 1)

      return {
        ...row.champion,
        picks,
        games: picks,
        bans,
        pickRate,
        banRate,
        presence,
        avgKda: row.kda / div,
        winrate: (row.wins / div) * 100,
        avgGd15: row.gd15 / div,
        avgCsd15: row.csd15 / div,
        avgXpd15: row.xpd15 / div,
        avgDpm: row.dpm / div,
        avgDmgShare: row.dmgShare / div,
        avgGoldShare: row.goldShare / div,
        avgKp: row.kp / div,
        avgVisionScore: row.visionScore / div,
        avgObjControl: row.objControl / div,
        avgFirstBloodRate: row.firstBloodRate / div,
        avgTurretPlates: row.turretPlates / div,
        avgKaPerMin: row.kaPerMin / div,
        avgDmgGoldRatio: row.dmgGoldRatio / div,
        avgDmgPerGold: row.dmgPerGold / div,
        avgWardsDestroyed: row.wardsDestroyed / div,
        avgCampsStolen: row.campsStolen / div,
        weeklyRole,
      } as WeeklyChampionStats
    })
    .filter((c) => c.picks >= 1)
}

/** Role-aware OP score: draft meta + in-game radar stats, confidence-adjusted. */
export function computeChampionOfWeekScores(
  champions: WeeklyChampionStats[],
): WeeklyChampionOpResult {
  if (!champions.length) return { top: null, runners: [] }

  const byRole = new Map<RoleKey, WeeklyChampionStats[]>()
  for (const role of ROLES) byRole.set(role, [])
  for (const c of champions) {
    byRole.get(c.weeklyRole)?.push(c)
  }

  const metricZ = new Map<string, Map<OpMetricKey, number>>()

  for (const role of ROLES) {
    const group = byRole.get(role) ?? []
    if (!group.length) continue
    const weights = buildOpWeightsForRole(role)
    for (const metric of weights.keys()) {
      const z = zScoreById(group.map((c) => ({ id: c.name, value: opMetricValue(c, metric) })))
      for (const c of group) {
        const row = metricZ.get(c.name) ?? new Map<OpMetricKey, number>()
        row.set(metric, z.get(c.name) ?? 0)
        metricZ.set(c.name, row)
      }
    }
  }

  const scored: WeeklyChampionOpEntry[] = champions.map((champion) => {
    const role = champion.weeklyRole
    const weights = buildOpWeightsForRole(role)
    const zRow = metricZ.get(champion.name) ?? new Map<OpMetricKey, number>()
    let total = 0
    let weightSum = 0
    for (const [metric, weight] of weights) {
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
