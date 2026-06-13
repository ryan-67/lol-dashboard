import { getTimezone } from './timezoneStore'

/** Format a message timestamp with date + time for chat bubbles. */
export function formatMessageTimestamp(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const tz = getTimezone()
  const now = new Date()
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  })

  const dateInTz = (date: Date) =>
    date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz })

  if (dateInTz(d) === dateInTz(now)) {
    return time
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (dateInTz(d) === dateInTz(yesterday)) {
    return `yesterday · ${time}`
  }

  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    timeZone: tz,
  })
  return `${date} · ${time}`
}
