export function formatNum(value: unknown, digits = 1, fallback = '—'): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return value.toFixed(digits)
}

export function formatPct(value: unknown, digits = 1, fallback = '—'): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return `${value.toFixed(digits)}%`
}
