import { getTimezone } from './timezoneStore'

/** Format a message timestamp with date + time for chat bubbles (always includes date). */
export function formatMessageTimestamp(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const tz = getTimezone()
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  })
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  })
  return `${date} · ${time}`
}
