export function formatNum(value: unknown, digits = 1, fallback = '—'): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return value.toFixed(digits)
}

export function formatPct(value: unknown, digits = 1, fallback = '—'): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return `${value.toFixed(digits)}%`
}

const PACIFIC_TZ = 'America/Los_Angeles'

/** Refresh timestamps — always Pacific so global users see a consistent timezone label. */
export function formatRefreshTimestamp(
  date: Date,
  options?: { includeYear?: boolean },
): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(options?.includeYear ? { year: 'numeric' as const } : {}),
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PACIFIC_TZ,
    timeZoneName: 'short',
  })
}
