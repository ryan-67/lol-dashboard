import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import { formatDateRange } from './format'

export type HubPeriod = 'weekly' | 'monthly'

export const HUB_PERIOD_DAYS: Record<HubPeriod, number> = {
  weekly: 7,
  monthly: 30,
}

export interface WeeklyWindow {
  start: Date
  end: Date
  key: string
  label: string
  /** Latest completed match date from OE and/or Cito (SoR for freshness). */
  latestDataDate: Date | null
  /** True when the product window is "current" but match data lags today. */
  dataStale: boolean
  /** OE game-log max date when available (may lag Cito). */
  oeLatestDate: Date | null
  /** Cito completed-series max date when available. */
  citoLatestDate: Date | null
}

export function parseDate(value: string): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

/** Local calendar YYYY-MM-DD (avoids UTC shift from toISOString). */
export function localIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(date: Date): Date {
  const out = new Date(date)
  out.setHours(0, 0, 0, 0)
  return out
}

function endOfDay(date: Date): Date {
  const out = new Date(date)
  out.setHours(23, 59, 59, 999)
  return out
}

function isoDate(date: Date): string {
  return localIsoDate(date)
}

export interface HubWindowOptions {
  /** Latest completed Cito series day — keeps Hub current when OE shards lag. */
  citoLatestDate?: Date | null
  now?: Date
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b
  if (!b) return a
  return a.getTime() >= b.getTime() ? a : b
}

/** Rolling N-day window ending on today when in current season; otherwise anchored to latest data. */
export function getHubWindow(
  players: Player[],
  period: HubPeriod,
  nowOrOpts: Date | HubWindowOptions = new Date(),
  maybeOpts?: HubWindowOptions,
): WeeklyWindow | null {
  const opts: HubWindowOptions =
    nowOrOpts instanceof Date
      ? { ...(maybeOpts ?? {}), now: nowOrOpts }
      : nowOrOpts
  const now = opts.now ?? new Date()
  const dayCount = HUB_PERIOD_DAYS[period]
  const oeDates = players
    .flatMap((p) => p.gameLog ?? [])
    .map((g) => parseDate(g.date))
    .filter((d): d is Date => d !== null)
  oeDates.sort((a, b) => a.getTime() - b.getTime())
  const oeLatestDate = oeDates.length ? oeDates[oeDates.length - 1]! : null
  const citoLatestDate = opts.citoLatestDate ?? null
  const latestDataDate = maxDate(oeLatestDate, citoLatestDate)
  if (!latestDataDate) return null

  const today = startOfDay(now)
  const latestDay = startOfDay(latestDataDate)
  const daysSinceLatest =
    (today.getTime() - latestDay.getTime()) / (1000 * 60 * 60 * 24)
  const isCurrentContext = daysSinceLatest <= 14

  const anchorEnd = isCurrentContext ? endOfDay(today) : endOfDay(latestDataDate)
  const start = startOfDay(new Date(anchorEnd))
  start.setDate(start.getDate() - (dayCount - 1))

  const dataStale = isCurrentContext && latestDay.getTime() < today.getTime()

  return {
    start,
    end: anchorEnd,
    key: isoDate(start),
    label: formatDateRange(start, anchorEnd),
    latestDataDate,
    dataStale,
    oeLatestDate,
    citoLatestDate,
  }
}

/** @deprecated use getHubWindow(players, 'weekly') */
export function getWeeklyWindow(
  players: Player[],
  _year: string,
  _split: string,
  now: Date = new Date(),
): WeeklyWindow | null {
  return getHubWindow(players, 'weekly', now)
}

export function inWeeklyWindow(log: PlayerGameLog, window: WeeklyWindow): boolean {
  return inHubWindow(log, window)
}

export function inHubWindow(log: PlayerGameLog, window: WeeklyWindow): boolean {
  const d = parseDate(log.date)
  if (!d) return false
  const day = startOfDay(d)
  return day >= window.start && day <= window.end
}

export function windowToWeeklyRecapWindow(window: WeeklyWindow) {
  return { start: window.start, end: window.end, label: window.label }
}

/** Latest completed Cito series calendar day from result rows. */
export function latestCitoCompletedDate(
  results: Array<{ scheduledAt: string | null; status: string; scoreA: number | null; scoreB: number | null }>,
): Date | null {
  let best: Date | null = null
  for (const row of results) {
    const status = (row.status ?? '').trim().toLowerCase().replace(/\s+/g, '_')
    const completed =
      ['completed', 'finished', 'done', 'complete'].includes(status) ||
      (typeof row.scoreA === 'number' &&
        typeof row.scoreB === 'number' &&
        Math.max(row.scoreA, row.scoreB) >= 2)
    if (!completed) continue
    const d = parseDate(row.scheduledAt ?? '')
    if (!d) continue
    if (!best || d.getTime() > best.getTime()) best = d
  }
  return best
}
