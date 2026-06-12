import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import { DEFAULT_SPLIT } from '../hooks/useDashboardData'

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
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
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
  return date.toISOString().slice(0, 10)
}

function weekLabel(start: Date, end: Date): string {
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

/** Rolling 7-day window; use split ALL + current year for recap generation across tier-1. */
export function getWeeklyWindow(
  players: Player[],
  year: string,
  split: string,
  now: Date = new Date(),
): WeeklyWindow | null {
  const dates = players
    .flatMap((p) => p.gameLog ?? [])
    .map((g) => parseDate(g.date))
    .filter((d): d is Date => d !== null)
  if (!dates.length) return null
  dates.sort((a, b) => a.getTime() - b.getTime())
  const latestDataDate = dates[dates.length - 1]!
  const today = startOfDay(now)
  const isCurrentContext = year === String(today.getFullYear()) && (split === DEFAULT_SPLIT || split === 'ALL')

  const anchorEnd = isCurrentContext ? endOfDay(today) : endOfDay(latestDataDate)
  const start = startOfDay(new Date(anchorEnd))
  start.setDate(start.getDate() - 6)

  const dataStale =
    isCurrentContext && startOfDay(latestDataDate).getTime() < today.getTime()

  return {
    start,
    end: anchorEnd,
    key: isoDate(start),
    label: weekLabel(start, anchorEnd),
    latestDataDate,
    dataStale,
  }
}

export function inWeeklyWindow(log: PlayerGameLog, window: WeeklyWindow): boolean {
  const d = parseDate(log.date)
  if (!d) return false
  return d >= window.start && d <= window.end
}

export function windowToWeeklyRecapWindow(window: WeeklyWindow) {
  return { start: window.start, end: window.end, label: window.label }
}
