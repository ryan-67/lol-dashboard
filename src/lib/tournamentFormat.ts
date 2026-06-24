export function formatDurationMinSec(minutes: number | null): string {
  if (minutes == null || Number.isNaN(minutes)) return '—'
  const totalSec = Math.round(minutes * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
