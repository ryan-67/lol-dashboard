import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import type { RoleKey } from './playerRadar'

/** Advanced / derived metrics surfaced on radars and in recap / nuckyAI highlights. */
export type AdvancedMetricKey =
  | 'turretPlates'
  | 'dmgGoldRatio'
  | 'dmgPerGold'
  | 'kaPerMin'
  | 'campsStolen'
  | 'wardsDestroyed'

export interface AdvancedMetricDef {
  key: AdvancedMetricKey
  label: string
  shortLabel: string
  /** Higher is generally better (used for outlier direction). */
  higherIsBetter: boolean
  format: (v: number) => string
}

export const ADVANCED_METRICS_BY_ROLE: Record<RoleKey, AdvancedMetricDef[]> = {
  top: [
    {
      key: 'turretPlates',
      label: 'Turret Plates / game',
      shortLabel: 'Plates',
      higherIsBetter: true,
      format: (v) => v.toFixed(2),
    },
    {
      key: 'dmgGoldRatio',
      label: 'Dmg% / Gold%',
      shortLabel: 'DMG%/G%',
      higherIsBetter: true,
      format: (v) => v.toFixed(2),
    },
  ],
  jungle: [
    {
      key: 'kaPerMin',
      label: 'K+A / min',
      shortLabel: 'K+A/m',
      higherIsBetter: true,
      format: (v) => v.toFixed(2),
    },
    {
      key: 'dmgGoldRatio',
      label: 'Dmg% / Gold%',
      shortLabel: 'DMG%/G%',
      higherIsBetter: true,
      format: (v) => v.toFixed(2),
    },
  ],
  mid: [
    {
      key: 'dmgGoldRatio',
      label: 'Dmg% / Gold%',
      shortLabel: 'DMG%/G%',
      higherIsBetter: true,
      format: (v) => v.toFixed(2),
    },
    {
      key: 'dmgPerGold',
      label: 'Dmg / Gold',
      shortLabel: 'DMG/G',
      higherIsBetter: true,
      format: (v) => v.toFixed(3),
    },
  ],
  adc: [
    {
      key: 'dmgGoldRatio',
      label: 'Dmg% / Gold%',
      shortLabel: 'DMG%/G%',
      higherIsBetter: true,
      format: (v) => v.toFixed(2),
    },
    {
      key: 'dmgPerGold',
      label: 'Dmg / Gold',
      shortLabel: 'DMG/G',
      higherIsBetter: true,
      format: (v) => v.toFixed(3),
    },
  ],
  support: [
    {
      key: 'kaPerMin',
      label: 'K+A / min',
      shortLabel: 'K+A/m',
      higherIsBetter: true,
      format: (v) => v.toFixed(2),
    },
    {
      key: 'wardsDestroyed',
      label: 'Wards Cleared / game',
      shortLabel: 'Wards Clr',
      higherIsBetter: true,
      format: (v) => v.toFixed(1),
    },
  ],
}

const OUTLIER_Z = 1.5

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function zScore(value: number, values: number[]): number {
  const sd = stdDev(values)
  if (!sd) return 0
  return (value - mean(values)) / sd
}

export function dmgGoldRatioFromGame(game: PlayerGameLog): number | null {
  const gold = game.goldShare ?? 0
  if (gold <= 0) return null
  if (game.dmgGoldRatio && game.dmgGoldRatio > 0) return game.dmgGoldRatio
  return (game.dmgShare ?? 0) / gold
}

export function dmgPerGoldFromGame(game: PlayerGameLog): number {
  if (game.dmgPerGold && game.dmgPerGold > 0) return game.dmgPerGold
  if (game.dpm && game.gpm && game.gpm > 0) return game.dpm / game.gpm
  return 0
}

export function isAdvancedMetricAvailable(
  metric: AdvancedMetricKey,
  cohort: Player[],
): boolean {
  if (metric === 'campsStolen') {
    return cohort.some((p) => getAdvancedMetricValue(p, metric) > 0)
  }
  if (metric === 'turretPlates') {
    return cohort.some((p) => getAdvancedMetricValue(p, metric) > 0)
  }
  if (metric === 'dmgPerGold') {
    return cohort.some((p) => getAdvancedMetricValue(p, metric) > 0)
  }
  return true
}

export function aggregateAdvancedFromGameLog(logs: PlayerGameLog[]): Partial<Record<AdvancedMetricKey, number>> {
  if (!logs.length) return {}
  const dmgRatios = logs.map(dmgGoldRatioFromGame).filter((v): v is number => v != null && v > 0)
  const dmgPerGold = logs.map(dmgPerGoldFromGame).filter((v) => v > 0)
  const plateGames = logs.filter((g) => typeof g.turretPlates === 'number')
  return {
    turretPlates: plateGames.length
      ? plateGames.reduce((s, g) => s + (g.turretPlates ?? 0), 0) / plateGames.length
      : undefined,
    campsStolen: logs.reduce((s, g) => s + (g.campsStolen ?? 0), 0) / logs.length,
    wardsDestroyed: logs.reduce((s, g) => s + (g.wardsDestroyed ?? 0), 0) / logs.length,
    kaPerMin: logs.reduce((s, g) => s + (g.kaPerMin ?? 0), 0) / logs.length,
    dmgGoldRatio: dmgRatios.length ? dmgRatios.reduce((a, b) => a + b, 0) / dmgRatios.length : 0,
    dmgPerGold: dmgPerGold.length ? dmgPerGold.reduce((a, b) => a + b, 0) / dmgPerGold.length : 0,
  }
}

export function enrichPlayerWithAdvancedStats(player: Player): Player {
  const fromLog = aggregateAdvancedFromGameLog(player.gameLog ?? [])
  return {
    ...player,
    turretPlates: player.turretPlates ?? fromLog.turretPlates,
    campsStolen: player.campsStolen ?? fromLog.campsStolen,
    wardsDestroyed: player.wardsDestroyed ?? fromLog.wardsDestroyed,
    kaPerMin: player.kaPerMin ?? fromLog.kaPerMin,
    dmgGoldRatio: player.dmgGoldRatio ?? fromLog.dmgGoldRatio,
    dmgPerGold: player.dmgPerGold ?? fromLog.dmgPerGold,
  }
}

export function getAdvancedMetricValue(player: Player, key: AdvancedMetricKey): number {
  const enriched = enrichPlayerWithAdvancedStats(player)
  const raw = enriched[key]
  return typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0
}

/** Skip "fraud" low efficiency callouts on losses — carries are often starved/targeted when behind. */
export function shouldHighlightLowCarryEfficiency(
  metric: AdvancedMetricKey,
  games: PlayerGameLog[],
): boolean {
  if (metric !== 'dmgGoldRatio' && metric !== 'dmgPerGold') return true
  if (!games.length) return false
  const wins = games.filter((g) => g.result === 1).length
  return wins / games.length >= 0.5
}

export interface AdvancedOutlier {
  metric: AdvancedMetricKey
  label: string
  value: number
  formatted: string
  zScore: number
  direction: 'high' | 'low'
  playerName: string
  role: RoleKey
}

export function findAdvancedOutliers(
  player: Player,
  role: RoleKey,
  cohort: Player[],
  games?: PlayerGameLog[],
): AdvancedOutlier[] {
  const defs = ADVANCED_METRICS_BY_ROLE[role]
  const enriched = enrichPlayerWithAdvancedStats(player)
  const gameWindow = games ?? player.gameLog ?? []
  const outliers: AdvancedOutlier[] = []

  for (const def of defs) {
    if (!isAdvancedMetricAvailable(def.key, cohort)) continue

    const cohortValues = cohort
      .map((p) => getAdvancedMetricValue(p, def.key))
      .filter((v) => v > 0 || def.key === 'campsStolen' || def.key === 'turretPlates')
    if (cohortValues.length < 3) continue

    const value = getAdvancedMetricValue(enriched, def.key)
    if (value === 0 && (def.key === 'campsStolen' || def.key === 'turretPlates')) {
      continue
    }

    const z = zScore(value, cohortValues)
    const isHigh = z >= OUTLIER_Z
    const isLow = z <= -OUTLIER_Z

    if (!isHigh && !isLow) continue
    if (isLow && !def.higherIsBetter) continue
    if (
      isLow &&
      (def.key === 'dmgGoldRatio' || def.key === 'dmgPerGold') &&
      !shouldHighlightLowCarryEfficiency(def.key, gameWindow)
    ) {
      continue
    }

    outliers.push({
      metric: def.key,
      label: def.label,
      value,
      formatted: def.format(value),
      zScore: z,
      direction: isHigh ? 'high' : 'low',
      playerName: player.name,
      role,
    })
  }

  return outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
}

export function formatAdvancedOutlierLine(o: AdvancedOutlier): string {
  const name = o.playerName
  switch (o.metric) {
    case 'turretPlates':
      return o.direction === 'high'
        ? `${name} was shredding plates — ${o.formatted}/game`
        : `${name} wasn't securing plates (${o.formatted}/game)`
    case 'dmgGoldRatio':
      return o.direction === 'high'
        ? `${name} punched way above their gold weight (${o.formatted} dmg%/gold%)`
        : `${name} ate gold without matching damage (${o.formatted} dmg%/gold%)`
    case 'dmgPerGold':
      return o.direction === 'high'
        ? `${name} converted gold to damage at an elite rate (${o.formatted} dmg/gold)`
        : `${name} had weak dmg/gold conversion (${o.formatted}) despite the resources`
    case 'kaPerMin':
      return o.direction === 'high'
        ? `${name} was everywhere on the map (${o.formatted} K+A/min)`
        : `${name} was pretty inactive (${o.formatted} K+A/min)`
    case 'campsStolen':
      return o.direction === 'high'
        ? `${name} was deep in enemy jungle (${o.formatted} camps stolen/game)`
        : `${name} rarely stole camps (${o.formatted}/game)`
    case 'wardsDestroyed':
      return o.direction === 'high'
        ? `${name} denied vision hard (${o.formatted} wards cleared/game)`
        : `${name} barely cleared wards (${o.formatted}/game)`
    default:
      return `${name}: ${o.label} ${o.formatted}`
  }
}

function gameAdvancedValue(game: PlayerGameLog, key: AdvancedMetricKey): number {
  switch (key) {
    case 'turretPlates':
      return game.turretPlates ?? 0
    case 'campsStolen':
      return game.campsStolen ?? 0
    case 'wardsDestroyed':
      return game.wardsDestroyed ?? 0
    case 'kaPerMin':
      return game.kaPerMin ?? 0
    case 'dmgPerGold':
      return game.dmgPerGold ?? 0
    case 'dmgGoldRatio':
      return dmgGoldRatioFromGame(game) ?? 0
    default:
      return 0
  }
}

/** Single-game spike worth calling in a series recap. */
export function findGameAdvancedHighlights(
  game: PlayerGameLog,
  role: RoleKey,
  cohortGames: PlayerGameLog[],
): string[] {
  const lines: string[] = []
  const defs = ADVANCED_METRICS_BY_ROLE[role]

  for (const def of defs) {
    const gameVal = gameAdvancedValue(game, def.key)
    if (!gameVal && def.key !== 'campsStolen') continue

    const cohortVals = cohortGames
      .map((g) => gameAdvancedValue(g, def.key))
      .filter((v) => v > 0 || def.key === 'campsStolen')

    if (cohortVals.length < 5) continue
    const z = zScore(gameVal, cohortVals)

    if (def.key === 'campsStolen' && gameVal >= 1) {
      lines.push(`${Math.round(gameVal)} enemy camp${gameVal > 1 ? 's' : ''} stolen`)
      continue
    }

    if (z < OUTLIER_Z) continue
    if (
      z <= -OUTLIER_Z &&
      (def.key === 'dmgGoldRatio' || def.key === 'dmgPerGold') &&
      game.result !== 1
    ) {
      continue
    }

    if (z >= OUTLIER_Z) {
      lines.push(`${def.shortLabel} ${def.format(gameVal)} (elite)`)
    } else if (z <= -OUTLIER_Z && def.key === 'dmgGoldRatio') {
      lines.push(`${def.shortLabel} ${def.format(gameVal)} (gold hog?)`)
    }
  }

  return lines
}
