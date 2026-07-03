import type { WeeklyRecapLine } from './weeklyRecap'
import { formatRecapDate, recapLineToText } from './weeklyRecap'
import { resolveTeamCanonicalName } from './entities/slugs'
import { seriesKey } from './seriesGrouping'

/** Prefer seriesId when present; otherwise date + canonical matchup + score. */
function recapLineKey(line: WeeklyRecapLine): string {
  if (line.seriesId) {
    // Normalize team names inside seriesId so TL vs Team Liquid collide.
    const parts = line.seriesId.split('|')
    if (parts.length >= 3) {
      const [a, b, date, ...rest] = parts
      const canon = seriesKey(resolveTeamCanonicalName(a!), resolveTeamCanonicalName(b!))
      return `id:${canon}|${date}${rest.length ? `|${rest.join('|')}` : ''}`
    }
    return `id:${line.seriesId}`
  }
  const winner = resolveTeamCanonicalName(line.score.winner)
  const loser = resolveTeamCanonicalName(line.score.loser)
  return `match:${line.date}|${seriesKey(winner, loser)}|${line.score.score}|${winner}`
}

/**
 * Same calendar day + same matchup + same score = one series.
 * Rematches on different days (T1 vs TL Jun 28 and Jul 1) stay separate.
 */
function seriesOccurrenceKey(line: WeeklyRecapLine): string {
  const winner = resolveTeamCanonicalName(line.score.winner)
  const loser = resolveTeamCanonicalName(line.score.loser)
  return `${line.date}|${seriesKey(winner, loser)}|${line.score.score}|${winner}`
}

function recapTextLength(line: WeeklyRecapLine): number {
  try {
    return recapLineToText(line).length
  } catch {
    return line.segments.length
  }
}

function mergeRecapPair(a: WeeklyRecapLine, b: WeeklyRecapLine): WeeklyRecapLine {
  // Prefer the richer AI narrative over short template fallbacks.
  const primary = recapTextLength(a) >= recapTextLength(b) ? a : b
  const secondary = primary === a ? b : a
  // Prefer seriesId from the line that carries tournament metadata (template).
  const seriesId =
    (a.score.tournamentLabel ? a.seriesId : undefined) ??
    (b.score.tournamentLabel ? b.seriesId : undefined) ??
    primary.seriesId ??
    secondary.seriesId
  const date = primary.date.localeCompare(secondary.date) >= 0 ? primary.date : secondary.date
  return {
    ...primary,
    id: seriesId ?? primary.id,
    seriesId,
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

  // Collapse same-day duplicates when seriesIds differ (e.g. TL vs Team Liquid naming).
  const byOccurrence = new Map<string, WeeklyRecapLine>()
  for (const line of byKey.values()) {
    const key = seriesOccurrenceKey(line)
    const existing = byOccurrence.get(key)
    byOccurrence.set(key, existing ? mergeRecapPair(existing, line) : line)
  }

  return [...byOccurrence.values()]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, limit)
}
