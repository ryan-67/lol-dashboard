/**
 * v3 current-form window — last N completed series (not calendar days).
 * Shared helpers for Players / Teams / Champions + entity Now blocks.
 */

import type { Player, PlayerGameLog, Team } from '../hooks/useDashboardData'
import { resolveTeamCanonicalName } from './entities/slugs'
import { parseDate, localIsoDate } from './weeklyWindow'

export const FORM_SERIES_N = 8
export const FORM_STABLE_FLOOR = 4

export interface FormSeriesPoint {
  date: string
  won: boolean
  opponent: string
  scoreLabel: string
}

export interface CurrentFormWindow {
  /** Series in the window, newest first (max FORM_SERIES_N). */
  series: FormSeriesPoint[]
  sampleSize: number
  /** True when sample ≥ FORM_STABLE_FLOOR. */
  stable: boolean
  /** Days since last completed series; null if unknown. */
  idleDays: number | null
  /** Display copy e.g. `form · last 8 series`. */
  label: string
  /** Idle badge e.g. `idle · 37d since last series`. */
  idleLabel: string | null
  /** Thin-sample badge when below floor. */
  thinLabel: string | null
  /** Win rate over the form window (0–1). */
  winRate: number
  /** Recency-weighted form score 0–100 (newer series weigh more). */
  formScore: number
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function daysSince(isoDate: string, now: Date): number | null {
  const d = parseDate(isoDate)
  if (!d) return null
  const ms = startOfDay(now).getTime() - startOfDay(d).getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

function weightedFormScore(series: FormSeriesPoint[]): number {
  if (!series.length) return 0
  let weightSum = 0
  let scoreSum = 0
  series.forEach((s, i) => {
    const w = Math.pow(0.85, i)
    weightSum += w
    scoreSum += (s.won ? 1 : 0) * w
  })
  return weightSum ? (scoreSum / weightSum) * 100 : 0
}

function buildFormLabel(sampleSize: number): string {
  if (sampleSize <= 0) return 'form · no recent series'
  if (sampleSize < FORM_SERIES_N) return `form · last ${sampleSize} series`
  return `form · last ${FORM_SERIES_N} series`
}

/**
 * Player form from gameLog grouped into series (same team identity).
 * Soft keep across the window; hard resets (team/role change) applied by caller when identity changes.
 */
export const computePlayerCurrentForm = (
  player: Player,
  now: Date = new Date(),
): CurrentFormWindow => computeFormFromGameLogs(player.gameLog ?? [], player.team, now)

export const computeTeamCurrentForm = (
  team: Team,
  playerLogs: PlayerGameLog[],
  now: Date = new Date(),
): CurrentFormWindow => computeFormFromGameLogs(playerLogs, team.name, now)

export const computeFormFromGameLogs = (
  logs: PlayerGameLog[],
  teamName: string,
  now: Date = new Date(),
): CurrentFormWindow => {
  if (!logs.length) {
    return {
      series: [],
      sampleSize: 0,
      stable: false,
      idleDays: null,
      label: buildFormLabel(0),
      idleLabel: null,
      thinLabel: 'thin sample · 0 series',
      winRate: 0,
      formScore: 0,
    }
  }

  const byGame = new Map<string, { date: string; opponent: string; result: number }>()
  for (const g of logs) {
    const opp = g.opponent ?? 'unknown'
    const key = g.gameId ?? `${g.date}|${teamName}|${opp}`
    if (!byGame.has(key)) {
      byGame.set(key, { date: g.date, opponent: opp, result: g.result })
    }
  }

  const games = [...byGame.values()].sort((a, b) => a.date.localeCompare(b.date))
  const buckets: { date: string; opponent: string; wins: number; losses: number }[] = []
  for (const g of games) {
    const last = buckets[buckets.length - 1]
    const sameOpp =
      last &&
      resolveTeamCanonicalName(last.opponent) === resolveTeamCanonicalName(g.opponent)
    const close =
      last &&
      Math.abs(
        (parseDate(g.date)?.getTime() ?? 0) - (parseDate(last.date)?.getTime() ?? 0),
      ) <=
        2 * 24 * 60 * 60 * 1000
    if (sameOpp && close && last) {
      if (g.result === 1) last.wins += 1
      else last.losses += 1
      if (g.date > last.date) last.date = g.date
    } else {
      buckets.push({
        date: g.date,
        opponent: g.opponent,
        wins: g.result === 1 ? 1 : 0,
        losses: g.result === 1 ? 0 : 1,
      })
    }
  }

  const completed = buckets
    .filter((b) => {
      const max = Math.max(b.wins, b.losses)
      const min = Math.min(b.wins, b.losses)
      return max >= 1 && max > min && max <= 3
    })
    .slice(-FORM_SERIES_N)
    .reverse()

  const series: FormSeriesPoint[] = completed.map((b) => ({
    date: b.date,
    won: b.wins > b.losses,
    opponent: b.opponent,
    scoreLabel: `${Math.max(b.wins, b.losses)}-${Math.min(b.wins, b.losses)}`,
  }))

  const sampleSize = series.length
  const wins = series.filter((s) => s.won).length
  const idleDays = series[0] ? daysSince(series[0].date, now) : null
  const idle =
    idleDays != null && idleDays >= 14
      ? `idle · ${idleDays}d since last series`
      : null
  const thin =
    sampleSize > 0 && sampleSize < FORM_STABLE_FLOOR
      ? `thin sample · ${sampleSize} series`
      : sampleSize === 0
        ? 'thin sample · 0 series'
        : null

  return {
    series,
    sampleSize,
    stable: sampleSize >= FORM_STABLE_FLOOR,
    idleDays,
    label: buildFormLabel(sampleSize),
    idleLabel: idle,
    thinLabel: thin,
    winRate: sampleSize ? wins / sampleSize : 0,
    formScore: weightedFormScore(series),
  }
}

/** Spark values (1 win / 0 loss) newest→oldest for KPI tiles. */
export const formSparkValues = (form: CurrentFormWindow): number[] =>
  form.series.map((s) => (s.won ? 1 : 0))

export const formAsOfLabel = (form: CurrentFormWindow): string => {
  if (!form.series[0]) return localIsoDate(new Date())
  return form.series[0].date
}
