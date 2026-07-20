import { getTimezone } from './timezoneStore'
import { DEFAULT_TIMEZONE } from './timezones'

/** Normalize OE/Cito patch strings to Riot format (e.g. 16.05 → 16.5). */
export function formatPatch(value: string | null | undefined, fallback = '—'): string {
  if (value == null) return fallback
  const trimmed = value.trim()
  if (!trimmed || trimmed === '—') return fallback === '—' ? trimmed || fallback : fallback

  const match = trimmed.match(/^(\d+)\.(\d+)$/)
  if (match) {
    const major = match[1]
    const minor = String(Number(match[2]))
    return `${major}.${minor}`
  }
  return trimmed
}

export function formatNum(value: unknown, digits = 1, fallback = '—'): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return value.toFixed(digits)
}

export function formatPct(value: unknown, digits = 1, fallback = '—'): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return `${value.toFixed(digits)}%`
}

export { DEFAULT_TIMEZONE }

function parseInputDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (!value) return null
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDate) {
    const [, y, m, d] = isoDate
    return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export interface FormatDateOptions {
  month?: 'short' | 'long' | 'numeric'
  day?: 'numeric'
  year?: 'numeric'
  timeZone?: string
}

/** Calendar date for match/game rows (respects user timezone for formatting). */
export function formatGameDate(
  value: string | Date,
  options?: FormatDateOptions,
): string {
  const date = parseInputDate(value)
  if (!date) return typeof value === 'string' ? value : '—'
  return date.toLocaleDateString('en-US', {
    month: options?.month ?? 'short',
    day: options?.day ?? 'numeric',
    year: options?.year,
    timeZone: options?.timeZone ?? getTimezone(),
  })
}

/** Date range label (e.g. weekly window). */
export function formatDateRange(start: Date, end: Date, timeZone?: string): string {
  const tz = timeZone ?? getTimezone()
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz })
  return `${fmt(start)} – ${fmt(end)}`
}

/** Refresh / data timestamps with timezone label. */
export function formatRefreshTimestamp(
  date: Date,
  options?: { includeYear?: boolean; timeZone?: string },
): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(options?.includeYear ? { year: 'numeric' as const } : {}),
    hour: '2-digit',
    minute: '2-digit',
    timeZone: options?.timeZone ?? getTimezone(),
    timeZoneName: 'short',
  })
}

/**
 * Calendar date for model artifact stamps (`generatedAt` / `exported_at`).
 * Always uses UTC so landing + dashboard never disagree across local midnights.
 */
export function formatModelUpdatedDate(iso: string | undefined | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Profile / subscription renewal dates. */
export function formatProfileDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const date = parseInputDate(value)
  if (!date) return null
  return formatGameDate(date, { year: 'numeric' })
}
