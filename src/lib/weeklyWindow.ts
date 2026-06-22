import type { Player, PlayerGameLog } from '../hooks/useDashboardData'

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
  latestDataDate: Date | null
  dataStale: boolean
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

import { formatDateRange } from './format'

/** Rolling N-day window ending on today when in current season; otherwise anchored to latest data. */
export function getHubWindow(
  players: Player[],
  period: HubPeriod,
  now: Date = new Date(),
): WeeklyWindow | null {
  const dayCount = HUB_PERIOD_DAYS[period]
  const dates = players
    .flatMap((p) => p.gameLog ?? [])
    .map((g) => parseDate(g.date))
    .filter((d): d is Date => d !== null)
  if (!dates.length) return null
  dates.sort((a, b) => a.getTime() - b.getTime())
  const latestDataDate = dates[dates.length - 1]!
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
