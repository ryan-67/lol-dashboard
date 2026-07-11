import type { WeeklyRecapLine } from './weeklyRecap'
import { formatRecapDate, recapLineToText } from './weeklyRecap'
import { resolveTeamCanonicalName } from './entities/slugs'
import { seriesKey } from './seriesGrouping'

/** Prefer seriesId when present; otherwise date + canonical matchup (score may drift). */
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
  return `match:${line.date}|${seriesKey(winner, loser)}`
}

/**
 * Same calendar day + same matchup = one series (score may drift as OE/Cito catch up).
 * Rematches on different days (T1 vs TL Jun 28 and Jul 1) stay separate.
 */
function seriesOccurrenceKey(line: WeeklyRecapLine): string {
  const winner = resolveTeamCanonicalName(line.score.winner)
  const loser = resolveTeamCanonicalName(line.score.loser)
  return `${line.date}|${seriesKey(winner, loser)}`
}

function scoreMagnitude(score: string): number {
  const m = score.match(/(\d+)\s*-\s*(\d+)/)
  if (!m) return 0
  return Number(m[1]) + Number(m[2])
}

function recapQualityScore(line: WeeklyRecapLine): number {
  let text = ''
  try {
    text = recapLineToText(line)
  } catch {
    return line.segments.length
  }
  let score = text.length
  // Prefer recaps that include tournament stakes (advancement / elimination / next matchup).
  if (/\b(eliminat|advances?|play-?in|bracket|sent home|goes home|next (?:faces?|round)|qualification|lower bracket|main bracket)\b/i.test(text)) {
    score += 250
  }
  // Prefer role-correct carry language over "adc was gapped" style.
  if (/\b(dmg share|damage share|dmg%\/gold%|k\+a\/min)\b/i.test(text)) score += 40
  // Penalize broken template patterns ("DCG stay ice cold against DCG").
  if (/\bstay ice cold against\b/i.test(text) && /\bagainst\s+([A-Za-z0-9.]+)\s+\1\b/i.test(text)) {
    score -= 200
  }
  // Penalize false elimination language when the paired template says loser continues.
  if (/\b(going home|sent home|eliminated from)\b/i.test(text)) {
    score -= 80
  }
  return score
}

function mergeRecapPair(a: WeeklyRecapLine, b: WeeklyRecapLine): WeeklyRecapLine {
  // Prefer richer AI narratives with tournament stakes over short/stale templates.
  const primary = recapQualityScore(a) >= recapQualityScore(b) ? a : b
  const secondary = primary === a ? b : a
  // Prefer seriesId from the line that carries tournament metadata (template).
  const seriesId =
    (a.score.tournamentLabel ? a.seriesId : undefined) ??
    (b.score.tournamentLabel ? b.seriesId : undefined) ??
    primary.seriesId ??
    secondary.seriesId
  const date = primary.date.localeCompare(secondary.date) >= 0 ? primary.date : secondary.date
  // Prefer the more complete series score (e.g. Cito/OE 3-0 over a stale mid-series 2-0).
  const preferScore =
    scoreMagnitude(a.score.score) >= scoreMagnitude(b.score.score) ? a.score : b.score
  return {
    ...primary,
    id: seriesId ?? primary.id,
    seriesId,
    date,
    dateLabel: formatRecapDate(date),
    score: {
      ...preferScore,
      tournamentLabel:
        a.score.tournamentLabel ?? b.score.tournamentLabel ?? preferScore.tournamentLabel,
      tournamentLeague:
        a.score.tournamentLeague ?? b.score.tournamentLeague ?? preferScore.tournamentLeague,
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
  const templateKeys = new Set(template.map(recapLineKey))
  const templateOccurrences = new Set(template.map(seriesOccurrenceKey))

  for (const line of template) {
    const key = recapLineKey(line)
    byKey.set(key, mergeRecapPair(byKey.get(key) ?? line, line))
  }

  for (const line of cached) {
    const key = recapLineKey(line)
    const occurrence = seriesOccurrenceKey(line)
    const matchesTemplate =
      templateKeys.has(key) || templateOccurrences.has(occurrence)
    // Template is the allowlist of concluded series. Cached-only 2-x rows are mid-series
    // leftovers (e.g. MSI Bo5 at 2-0) and must not reappear on the hub.
    if (!matchesTemplate) {
      const m = line.score.score.match(/(\d+)\s*-\s*(\d+)/)
      const max = m ? Math.max(Number(m[1]), Number(m[2])) : 0
      if (max < 3) continue
    }
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
