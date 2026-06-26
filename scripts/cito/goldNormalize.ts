import type { CitoGoldPoint, CitoPostgamePayload } from './types.ts'

/** Cito goldGraph timestamps are milliseconds from game start. */
export function timestampToMinute(timestamp: number): number {
  if (timestamp > 10_000) return Math.max(0, Math.round(timestamp / 60_000))
  return Math.max(0, Math.round(timestamp))
}

export function normalizeCitoGoldGraph(
  postgame: CitoPostgamePayload,
  maxMinute = 45,
): Array<{ minute: number; goldDiffBlue: number }> {
  const raw = postgame.goldGraph ?? []
  if (!raw.length) return []

  const byMinute = new Map<number, number>()
  for (const point of raw) {
    const minute =
      point.minute != null
        ? Math.round(point.minute)
        : timestampToMinute(point.timestamp ?? 0)
    if (minute > maxMinute) continue
    const diff = point.goldDiff ?? (point.blueGold ?? 0) - (point.redGold ?? 0)
    byMinute.set(minute, diff)
  }

  return [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, goldDiffBlue]) => ({ minute, goldDiffBlue }))
}

export function goldTimelineForTeam(
  timeline: Array<{ minute: number; goldDiffBlue: number }>,
  teamSlugOrName: string,
  blueSlug?: string,
  redSlug?: string,
): Array<{ minute: number; goldDiff: number }> {
  const team = teamSlugOrName.toLowerCase().replace(/[^a-z0-9]/g, '')
  const blue = (blueSlug ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const red = (redSlug ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

  const onBlue = blue && (team.includes(blue) || blue.includes(team))
  const onRed = red && (team.includes(red) || red.includes(team))

  return timeline.map(({ minute, goldDiffBlue }) => ({
    minute,
    goldDiff: onRed && !onBlue ? -goldDiffBlue : goldDiffBlue,
  }))
}

export type { CitoGoldPoint }
