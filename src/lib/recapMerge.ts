import type { WeeklyRecapLine } from './weeklyRecap'
import { formatRecapDate } from './weeklyRecap'
import { resolveTeamCanonicalName } from './entities/slugs'
import { seriesKey } from './seriesGrouping'

function recapLineKey(line: WeeklyRecapLine): string {
  if (line.seriesId) return `id:${line.seriesId}`
  const winner = resolveTeamCanonicalName(line.score.winner)
  const loser = resolveTeamCanonicalName(line.score.loser)
  return `match:${line.date}|${seriesKey(winner, loser)}|${line.score.score}|${winner}`
}

/** Same series outcome even when stale cache rows use an older series_id / date. */
function seriesOutcomeKey(line: WeeklyRecapLine): string {
  const winner = resolveTeamCanonicalName(line.score.winner)
  const loser = resolveTeamCanonicalName(line.score.loser)
  return `${seriesKey(winner, loser)}|${line.score.score}|${winner}`
}

function mergeRecapPair(a: WeeklyRecapLine, b: WeeklyRecapLine): WeeklyRecapLine {
  const primary = a.segments.length >= b.segments.length ? a : b
  const secondary = primary === a ? b : a
  const date = primary.date.localeCompare(secondary.date) >= 0 ? primary.date : secondary.date
  return {
    ...primary,
    seriesId: primary.seriesId ?? secondary.seriesId,
    date,
    dateLabel: formatRecapDate(date),
    score: {
      ...secondary.score,
      ...primary.score,
      tournamentLabel: secondary.score.tournamentLabel ?? primary.score.tournamentLabel,
      tournamentLeague: secondary.score.tournamentLeague ?? primary.score.tournamentLeague,
    },
  }
}

/** Merge cached AI recap lines with template lines so no series is dropped. */
export function mergeWeeklyRecapLines(
  cached: WeeklyRecapLine[],
  template: WeeklyRecapLine[],
  limit: number,
): WeeklyRecapLine[] {
  const byKey = new Map<string, WeeklyRecapLine>()

  for (const line of template) {
    const key = recapLineKey(line)
    byKey.set(key, mergeRecapPair(byKey.get(key) ?? line, line))
  }

  for (const line of cached) {
    const key = recapLineKey(line)
    byKey.set(key, mergeRecapPair(byKey.get(key) ?? line, line))
  }

  const byOutcome = new Map<string, WeeklyRecapLine>()
  for (const line of byKey.values()) {
    const outcomeKey = seriesOutcomeKey(line)
    const existing = byOutcome.get(outcomeKey)
    byOutcome.set(outcomeKey, existing ? mergeRecapPair(existing, line) : line)
  }

  return [...byOutcome.values()]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, limit)
}
