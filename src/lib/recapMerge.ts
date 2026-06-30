import type { WeeklyRecapLine } from './weeklyRecap'
import { resolveTeamCanonicalName } from './entities/slugs'

function recapLineKey(line: WeeklyRecapLine): string {
  const winner = resolveTeamCanonicalName(line.score.winner).toLowerCase()
  const loser = resolveTeamCanonicalName(line.score.loser).toLowerCase()
  return `${line.date}|${winner}|${loser}`
}

/** Merge cached AI recap lines with template lines so no series is dropped. */
export function mergeWeeklyRecapLines(
  cached: WeeklyRecapLine[],
  template: WeeklyRecapLine[],
  limit: number,
): WeeklyRecapLine[] {
  const byKey = new Map<string, WeeklyRecapLine>()

  for (const line of template) {
    byKey.set(recapLineKey(line), line)
  }

  for (const line of cached) {
    const key = recapLineKey(line)
    const existing = byKey.get(key)
    byKey.set(key, {
      ...line,
      seriesId: line.seriesId ?? existing?.seriesId,
      score: {
        ...line.score,
        tournamentLabel: line.score.tournamentLabel ?? existing?.score.tournamentLabel,
        tournamentLeague: line.score.tournamentLeague ?? existing?.score.tournamentLeague,
      },
    })
  }

  return [...byKey.values()]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, limit)
}
