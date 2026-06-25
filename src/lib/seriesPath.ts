/** URL helpers for stable series IDs (`teamA|teamB|YYYY-MM-DD` or `...|session`). */

export function seriesPath(seriesId: string): string {
  return `/series/${encodeURIComponent(seriesId)}`
}

export function decodeSeriesIdParam(slug: string): string {
  try {
    return decodeURIComponent(slug)
  } catch {
    return slug
  }
}
