import type { Player, PlayerGameLog } from '../hooks/useDashboardData'

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
  ],
  jungle: [
    { key: 'csd15', label: 'CS Diff@15', shortLabel: 'CS@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'gd15', label: 'Gold Diff@15', shortLabel: 'GD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'xpd15', label: 'XP Diff@15', shortLabel: 'XPD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'firstBloodRate', label: 'First Blood %', shortLabel: 'FB%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'kp', label: 'Kill Participation', shortLabel: 'KP', format: (v) => `${v.toFixed(1)}%` },
    { key: 'objControl', label: 'Objective Control %', shortLabel: 'OBJ%', format: (v) => v.toFixed(2) },
    { key: 'kda', label: 'KDA', shortLabel: 'KDA', format: (v) => v.toFixed(2) },
  ],
  mid: [
    { key: 'csd15', label: 'CS Diff@15', shortLabel: 'CS@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'gd15', label: 'Gold Diff@15', shortLabel: 'GD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'xpd15', label: 'XP Diff@15', shortLabel: 'XPD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'dpm', label: 'DPM', shortLabel: 'DPM', format: (v) => v.toFixed(0) },
    { key: 'dmgShare', label: 'Damage %', shortLabel: 'DMG%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'kda', label: 'KDA', shortLabel: 'KDA', format: (v) => v.toFixed(2) },
  ],
  adc: [
    { key: 'csd15', label: 'CS Diff@15', shortLabel: 'CS@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'gd15', label: 'Gold Diff@15', shortLabel: 'GD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'dpm', label: 'DPM', shortLabel: 'DPM', format: (v) => v.toFixed(0) },
    { key: 'dmgShare', label: 'Damage %', shortLabel: 'DMG%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'goldShare', label: 'Gold %', shortLabel: 'gold%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'kda', label: 'KDA', shortLabel: 'KDA', format: (v) => v.toFixed(2) },
  ],
  support: [
    { key: 'gd15', label: 'Gold Diff@15', shortLabel: 'GD@15', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
    { key: 'firstBloodRate', label: 'First Blood %', shortLabel: 'FB%', format: (v) => `${v.toFixed(1)}%` },
    { key: 'kp', label: 'Kill Participation', shortLabel: 'KP', format: (v) => `${v.toFixed(1)}%` },
    { key: 'visionScore', label: 'Vision Score', shortLabel: 'VS', format: (v) => v.toFixed(1) },
    { key: 'kda', label: 'KDA', shortLabel: 'KDA', format: (v) => v.toFixed(2) },
    { key: 'dmgShare', label: 'Damage %', shortLabel: 'DMG%', format: (v) => `${v.toFixed(1)}%` },
  ],
}

/** Weight keys align with scoring helpers below */
const SCORE_WEIGHTS: Record<RoleKey, Partial<Record<RadarMetricKey, number>>> = {
  top: { kda: 0.25, gd15: 0.25, csd15: 0.2, dpm: 0.15, dmgShare: 0.15 },
  jungle: { kda: 0.25, gd15: 0.2, csd15: 0.15, kp: 0.2, objControl: 0.2 },
  mid: { kda: 0.25, gd15: 0.25, csd15: 0.2, dpm: 0.15, dmgShare: 0.15 },
  adc: { kda: 0.25, gd15: 0.25, dpm: 0.2, dmgShare: 0.15, goldShare: 0.15 },
  support: { kda: 0.3, visionScore: 0.25, kp: 0.2, gd15: 0.15, firstBloodRate: 0.1 },
}

const warnedMissing = new Set<string>()

export function normalizePosition(position: string | undefined): RoleKey | null {
  const pos = (position ?? '').toLowerCase()
  if (pos === 'top') return 'top'
  if (pos === 'jungle' || pos === 'jng') return 'jungle'
  if (pos === 'mid') return 'mid'
  if (pos === 'adc' || pos === 'bot') return 'adc'
  if (pos === 'support' || pos === 'sup') return 'support'
  return null
}

export function getMetricValue(player: Player, key: RadarMetricKey): number {
  const raw = player[key]
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) {
    const warnKey = `missing:${key}`
    if (!warnedMissing.has(warnKey)) {
      console.warn(`[Players] Missing stat "${key}" in player data; treating as 0`)
      warnedMissing.add(warnKey)
    }
    return 0
  }
  return Number(raw)
}

function normalizeInCohort(value: number, cohortValues: number[]): number {
  if (!cohortValues.length) return 0
  const min = Math.min(...cohortValues)
  const max = Math.max(...cohortValues)
  if (max === min) return 50
  return ((value - min) / (max - min)) * 100
}

/** Map a single-game log row to a Player-shaped snapshot for scoring. */
export function playerSnapshotFromGame(game: PlayerGameLog): Player {
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
  }
}

export function computeGameScore(game: PlayerGameLog, role: RoleKey, cohort: Player[]): number {
  return computeAggregateScore(playerSnapshotFromGame(game), role, cohort)
}

export function computeAggregateScore(player: Player, role: RoleKey, cohort: Player[]): number {
  const weights = SCORE_WEIGHTS[role]
  let total = 0
  let weightSum = 0

  for (const [key, weight] of Object.entries(weights) as [RadarMetricKey, number][]) {
    const cohortValues = cohort.map((p) => getMetricValue(p, key))
    const value = getMetricValue(player, key)
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
    const cohortValues = cohort.map((p) => getMetricValue(p, def.key))
    const playerRaw = getMetricValue(player, def.key)
    const avgRaw = cohortValues.length
      ? cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length
      : 0
    return {
      metric: def.shortLabel,
      label: def.label,
      playerNorm: normalizeInCohort(playerRaw, cohortValues),
      avgNorm: normalizeInCohort(avgRaw, cohortValues),
      playerRaw,
      avgRaw,
      formattedPlayer: def.format(playerRaw),
      formattedAvg: def.format(avgRaw),
    }
  })
}

export function isDisplayablePlayer(p: Player): boolean {
  return Boolean(p?.name) && typeof p.kda === 'number' && typeof p.games === 'number'
}
