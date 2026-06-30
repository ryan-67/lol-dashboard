import type { LiveState } from '../../lib/live/types'

interface LiveStatusBadgeProps {
  state: LiveState
  startTime?: string | null
}

function formatStart(startTime: string | null | undefined): string {
  if (!startTime) return 'TBD'
  const t = Date.parse(startTime)
  if (Number.isNaN(t)) return 'TBD'
  const d = new Date(t)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function LiveStatusBadge({ state, startTime }: LiveStatusBadgeProps) {
  if (state === 'live') {
    return (
      <span className="live-badge live-badge-live" aria-label="Live now">
        <span className="live-badge-dot" />
        LIVE
      </span>
    )
  }
  if (state === 'completed') {
    return <span className="live-badge live-badge-final">FINAL</span>
  }
  return <span className="live-badge live-badge-upcoming">{formatStart(startTime)}</span>
}
