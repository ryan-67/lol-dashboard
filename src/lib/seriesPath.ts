/** URL helpers for stable series IDs (`teamA|teamB|YYYY-MM-DD` or `...|session`). */

export function seriesPath(seriesId: string, opts?: { gameNumber?: number | null }): string {
  const base = `/series/${encodeURIComponent(seriesId)}`
  if (opts?.gameNumber != null && opts.gameNumber > 0) {
    return `${base}?game=${opts.gameNumber}`
  }
  return base
}

export function decodeSeriesIdParam(slug: string): string {
  try {
    return decodeURIComponent(slug)
  } catch {
    return slug
  }
}
