import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import {
  isGameStatPresent,
  isStatEligibleForPlayer,
} from './statAvailability'
import {
  ADVANCED_METRICS_BY_ROLE,
  enrichPlayerWithAdvancedStats,
  getAdvancedMetricValue,
  type AdvancedMetricKey,
} from './advancedStats'

export type RoleKey = 'top' | 'jungle' | 'mid' | 'adc' | 'support'
export type RoleFilter = 'all' | RoleKey

export const ROLES: RoleKey[] = ['top', 'jungle', 'mid', 'adc', 'support']

export const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'top', label: 'Top' },
  { value: 'jungle', label: 'Jungle' },
  { value: 'mid', label: 'Mid' },
  { value: 'adc', label: 'ADC' },
  { value: 'support', label: 'Support' },
]

/** Distinct role colors for radar charts (Players tab) */
export const PLAYERS_ROLE_COLORS: Record<RoleKey, string> = {
  top: '#c45c5c',
  jungle: '#5c9e5a',
  mid: '#5c7a9e',
  adc: '#c5a059',
  support: '#8c6a9e',
}

export type RadarMetricKey =
  | 'csd15'
  | 'gd15'
  | 'xpd15'
  | 'dpm'
  | 'kda'
  | 'dmgShare'
  | 'firstBloodRate'
  | 'kp'
  | 'objControl'
  | 'goldShare'
  | 'visionScore'
  | 'soloKills'
  | AdvancedMetricKey

export interface RadarMetricDef {
  key: RadarMetricKey
  label: string
  shortLabel: string
  format: (v: number) => string
}

export const ROLE_METRICS: Record<RoleKey, RadarMetricDef[]> = {
  top: [
    { key: 'csd15', label: 'CS Diff@15', shortLabel: 'CS@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'gd15', label: 'Gold Diff@15', shortLabel: 'GD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'xpd15', label: 'XP Diff@15', shortLabel: 'XPD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'dpm', label: 'DPM', shortLabel: 'DPM', format: (v) => v.toFixed(0) },
    { key: 'kda', label: 'KDA', shortLabel: 'KDA', format: (v) => v.toFixed(2) },
    { key: 'dmgShare', label: 'Damage %', shortLabel: 'DMG%', format: (v) => `${v.toFixed(1)}%` },
    ...ADVANCED_METRICS_BY_ROLE.top.map((d) => ({
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      format: d.format,
    })),
  ],
  jungle: [
    { key: 'csd15', label: 'CS Diff@15', shortLabel: 'CS@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'gd15', label: 'Gold Diff@15', shortLabel: 'GD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'xpd15', label: 'XP Diff@15', shortLabel: 'XPD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'firstBloodRate', label: 'First Blood %', shortLabel: 'FB%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'kp', label: 'Kill Participation', shortLabel: 'KP', format: (v) => `${v.toFixed(1)}%` },
    { key: 'objControl', label: 'Objective Control %', shortLabel: 'OBJ%', format: (v) => v.toFixed(2) },
    ...ADVANCED_METRICS_BY_ROLE.jungle.map((d) => ({
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      format: d.format,
    })),
  ],
  mid: [
    { key: 'csd15', label: 'CS Diff@15', shortLabel: 'CS@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'gd15', label: 'Gold Diff@15', shortLabel: 'GD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'xpd15', label: 'XP Diff@15', shortLabel: 'XPD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'dpm', label: 'DPM', shortLabel: 'DPM', format: (v) => v.toFixed(0) },
    { key: 'dmgShare', label: 'Damage %', shortLabel: 'DMG%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'kda', label: 'KDA', shortLabel: 'KDA', format: (v) => v.toFixed(2) },
    ...ADVANCED_METRICS_BY_ROLE.mid.map((d) => ({
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      format: d.format,
    })),
  ],
  adc: [
    { key: 'csd15', label: 'CS Diff@15', shortLabel: 'CS@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'gd15', label: 'Gold Diff@15', shortLabel: 'GD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'dpm', label: 'DPM', shortLabel: 'DPM', format: (v) => v.toFixed(0) },
    { key: 'dmgShare', label: 'Damage %', shortLabel: 'DMG%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'goldShare', label: 'Gold %', shortLabel: 'gold%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'kda', label: 'KDA', shortLabel: 'KDA', format: (v) => v.toFixed(2) },
    ...ADVANCED_METRICS_BY_ROLE.adc.map((d) => ({
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      format: d.format,
    })),
  ],
  support: [
    { key: 'gd15', label: 'Gold Diff@15', shortLabel: 'GD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'firstBloodRate', label: 'First Blood %', shortLabel: 'FB%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'kp', label: 'Kill Participation', shortLabel: 'KP', format: (v) => `${v.toFixed(1)}%` },
    { key: 'visionScore', label: 'Vision Score', shortLabel: 'VS', format: (v) => v.toFixed(1) },
    { key: 'kda', label: 'KDA', shortLabel: 'KDA', format: (v) => v.toFixed(2) },
    { key: 'dmgShare', label: 'Damage %', shortLabel: 'DMG%', format: (v) => `${v.toFixed(1)}%` },
    ...ADVANCED_METRICS_BY_ROLE.support.map((d) => ({
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      format: d.format,
    })),
  ],
}

/** Weight keys align with scoring helpers below */
const SCORE_WEIGHTS: Record<RoleKey, Partial<Record<RadarMetricKey, number>>> = {
  top: { kda: 0.2, gd15: 0.25, csd15: 0.2, turretPlates: 0.15, dmgGoldRatio: 0.1, xpd15: 0.1 },
  jungle: { kda: 0.2, kaPerMin: 0.25, kp: 0.2, dmgGoldRatio: 0.15, gd15: 0.1, firstBloodRate: 0.1 },
  mid: { kda: 0.2, gd15: 0.2, csd15: 0.15, dmgGoldRatio: 0.2, dmgPerGold: 0.15, xpd15: 0.1 },
  adc: { kda: 0.2, gd15: 0.2, dmgGoldRatio: 0.2, dmgPerGold: 0.15, dpm: 0.15, csd15: 0.1 },
  support: { kda: 0.25, kaPerMin: 0.25, wardsDestroyed: 0.2, kp: 0.15, visionScore: 0.1, gd15: 0.05 },
}

export function normalizePosition(position: string | undefined): RoleKey | null {
  const pos = (position ?? '').toLowerCase()
  if (pos === 'top') return 'top'
  if (pos === 'jungle' || pos === 'jng') return 'jungle'
  if (pos === 'mid') return 'mid'
  if (pos === 'adc' || pos === 'bot') return 'adc'
  if (pos === 'support' || pos === 'sup') return 'support'
  return null
}

export function getMetricValue(
  player: Player,
  key: RadarMetricKey,
  options?: { cohort?: Player[]; allowMissing?: boolean },
): number | null {
  const cohort = options?.cohort ?? []
  if (!options?.allowMissing && !isStatEligibleForPlayer(player, key, cohort)) {
    return null
  }

  const enriched = enrichPlayerWithAdvancedStats(player)
  const advancedKeys: AdvancedMetricKey[] = [
    'turretPlates',
    'dmgGoldRatio',
    'dmgPerGold',
    'kaPerMin',
    'campsStolen',
    'wardsDestroyed',
  ]
  if (advancedKeys.includes(key as AdvancedMetricKey)) {
    const v = getAdvancedMetricValue(enriched, key as AdvancedMetricKey)
    if (key === 'turretPlates' && !isStatEligibleForPlayer(player, key, cohort)) return null
    return v
  }
  const raw = enriched[key as keyof Player]
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) {
    return null
  }
  return Number(raw)
}

/** Min–max vs cohort, clamped 0–100 so single-game spikes cannot exceed the display scale. */
function normalizeInCohort(value: number, cohortValues: number[]): number {
  if (!cohortValues.length) return 0
  const min = Math.min(...cohortValues)
  const max = Math.max(...cohortValues)
  if (max === min) return 50
  const scaled = ((value - min) / (max - min)) * 100
  return Math.min(100, Math.max(0, scaled))
}

/** Map a single-game log row to a Player-shaped snapshot for scoring. */
export function playerSnapshotFromGame(game: PlayerGameLog): Player {
  const dmgGoldRatio =
    game.dmgGoldRatio ??
    (game.goldShare && game.goldShare > 0 ? (game.dmgShare ?? 0) / game.goldShare : 0)
  return {
    name: '',
    team: '',
    league: '',
    position: '',
    games: 1,
    kda: game.kda,
    kp: game.kp,
    dmgShare: game.dmgShare,
    gd15: game.gd15,
    csd15: game.csd15,
    xpd15: game.xpd15,
    dpm: game.dpm,
    visionScore: game.visionScore ?? 0,
    goldShare: game.goldShare ?? 0,
    firstBloodRate: game.firstBloodRate ?? 0,
    objControl: game.objControl ?? 0,
    turretPlates: game.turretPlates ?? 0,
    campsStolen: game.campsStolen ?? 0,
    wardsDestroyed: game.wardsDestroyed ?? 0,
    kaPerMin: game.kaPerMin ?? 0,
    dmgGoldRatio,
    dmgPerGold: game.dmgPerGold ?? 0,
    soloKills: game.soloKills,
  }
}

function gameMetricRaw(game: PlayerGameLog, key: RadarMetricKey, cohort: Player[]): number | null {
  if (!isGameStatPresent(game, key, cohort)) return null

  const snap = playerSnapshotFromGame(game)
  if (key === 'soloKills') {
    return typeof game.soloKills === 'number' ? game.soloKills : null
  }
  if (key === 'turretPlates') {
    return typeof game.turretPlates === 'number' ? game.turretPlates : null
  }
  if (key === 'dmgGoldRatio') {
    const ratio =
      game.dmgGoldRatio ??
      (game.goldShare && game.goldShare > 0 ? (game.dmgShare ?? 0) / game.goldShare : null)
    return ratio != null && ratio > 0 ? ratio : null
  }
  if (key === 'dmgPerGold') {
    const v = game.dmgPerGold ?? (game.dpm && game.gpm && game.gpm > 0 ? game.dpm / game.gpm : null)
    return v != null && v > 0 ? v : null
  }
  const raw = snap[key as keyof Player]
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return null
  return Number(raw)
}

export function computeGameScore(game: PlayerGameLog, role: RoleKey, cohort: Player[]): number {
  const weights = SCORE_WEIGHTS[role]
  let total = 0
  let weightSum = 0

  for (const [key, weight] of Object.entries(weights) as [RadarMetricKey, number][]) {
    const value = gameMetricRaw(game, key, cohort)
    if (value == null) continue

    const cohortValues = cohort
      .map((p) => getMetricValue(p, key, { cohort }))
      .filter((v): v is number => v != null)
    if (!cohortValues.length) continue

    const normalized = normalizeInCohort(value, cohortValues) / 100
    total += normalized * weight
    weightSum += weight
  }

  return weightSum > 0 ? total / weightSum : 0
}

export function computeAggregateScore(player: Player, role: RoleKey, cohort: Player[]): number {
  const weights = SCORE_WEIGHTS[role]
  let total = 0
  let weightSum = 0

  for (const [key, weight] of Object.entries(weights) as [RadarMetricKey, number][]) {
    if (!isStatEligibleForPlayer(player, key, cohort)) continue

    const cohortValues = cohort
      .map((p) => getMetricValue(p, key, { cohort }))
      .filter((v): v is number => v != null)
    const value = getMetricValue(player, key, { cohort })
    if (value == null || !cohortValues.length) continue

    const normalized = normalizeInCohort(value, cohortValues) / 100
    total += normalized * weight
    weightSum += weight
  }

  return weightSum > 0 ? total / weightSum : 0
}

export function playersForRole(players: Player[], role: RoleKey): Player[] {
  return players.filter((p) => normalizePosition(p.position) === role)
}

export function rankPlayersByRole(players: Player[], role: RoleKey, limit?: number): Player[] {
  const cohort = playersForRole(players, role)
  const ranked = [...cohort].sort(
    (a, b) => computeAggregateScore(b, role, cohort) - computeAggregateScore(a, role, cohort),
  )
  return limit ? ranked.slice(0, limit) : ranked
}

export function bestPlayerForRole(players: Player[], role: RoleKey): Player | null {
  const ranked = rankPlayersByRole(players, role, 1)
  return ranked[0] ?? null
}

export interface RadarPoint {
  metric: string
  label: string
  playerNorm: number
  avgNorm: number
  playerRaw: number
  avgRaw: number
  formattedPlayer: string
  formattedAvg: string
}

export function buildRadarSeries(
  player: Player,
  role: RoleKey,
  cohort: Player[],
): RadarPoint[] {
  const metrics = ROLE_METRICS[role]
  return metrics.map((def) => {
    const cohortValues = cohort
      .map((p) => getMetricValue(p, def.key, { cohort, allowMissing: true }))
      .filter((v): v is number => v != null)
    const playerRaw = getMetricValue(player, def.key, { cohort, allowMissing: true })
    const avgRaw = cohortValues.length
      ? cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length
      : null
    return {
      metric: def.shortLabel,
      label: def.label,
      playerNorm:
        playerRaw != null && cohortValues.length
          ? normalizeInCohort(playerRaw, cohortValues)
          : 0,
      avgNorm:
        avgRaw != null && cohortValues.length ? normalizeInCohort(avgRaw, cohortValues) : 0,
      playerRaw: playerRaw ?? 0,
      avgRaw: avgRaw ?? 0,
      formattedPlayer: playerRaw != null ? def.format(playerRaw) : '—',
      formattedAvg: avgRaw != null ? def.format(avgRaw) : '—',
    }
  })
}

export function formatGameLogMetric(
  game: PlayerGameLog,
  key: RadarMetricKey,
  cohort: Player[],
  format: (v: number) => string,
): string {
  const value = gameMetricRaw(game, key, cohort)
  if (value == null) return '—'
  return format(value)
}

export function roleMatchHistoryMetrics(role: RoleKey): RadarMetricDef[] {
  return ROLE_METRICS[role].slice(0, 8)
}

function avgMetric(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function highestDeltaStatForGame(
  game: PlayerGameLog,
  role: RoleKey,
  cohort: Player[],
): { stat: string; value: number; delta: number } | null {
  const defs = ROLE_METRICS[role]
  let best: { stat: string; value: number; delta: number } | null = null
  for (const def of defs) {
    const value = gameMetricRaw(game, def.key, cohort)
    if (value == null) continue
    const cohortAvg =
      avgMetric(
        cohort
          .flatMap((c) => c.gameLog ?? [])
          .map((g) => gameMetricRaw(g, def.key, cohort))
          .filter((v): v is number => v != null),
      ) ||
      avgMetric(
        cohort
          .map((c) => getMetricValue(c, def.key, { cohort, allowMissing: true }))
          .filter((v): v is number => v != null),
      )
    const delta = value - cohortAvg
    if (!best || delta > best.delta) {
      best = {
        stat: def.label,
        value,
        delta,
      }
    }
  }
  return best
}

/** Highlight radar metric where player is farthest above cohort average. */
export function highestPlayerRadarHighlight(
  player: Player,
  role: RoleKey,
  cohort: Player[],
): { label: string; formatted: string; delta: number } | null {
  const series = buildRadarSeries(player, role, cohort)
  let best: { label: string; formatted: string; delta: number } | null = null
  for (const point of series) {
    if (point.formattedPlayer === '—') continue
    const delta = point.playerNorm - point.avgNorm
    if (!best || delta > best.delta) {
      best = {
        label: point.label,
        formatted: point.formattedPlayer,
        delta,
      }
    }
  }
  return best
}

export function isDisplayablePlayer(p: Player): boolean {
  return Boolean(p?.name) && typeof p.kda === 'number' && typeof p.games === 'number'
}
