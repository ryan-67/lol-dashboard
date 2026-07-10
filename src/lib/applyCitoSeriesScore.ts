/**
 * Overlay Cito-verified score onto an OE-resolved series (identity pages / lists).
 */
import type { ResolvedSeries } from './seriesAnalytics'
import {
  type CitoSeriesResult,
  isInternationalLeague,
  resolveSeriesScoreWithCito,
} from './citoSeriesVerify'
import { recapTeamTag } from './recapTeamTag'

export function applyCitoScoreToSeries(
  series: ResolvedSeries,
  citoResults: CitoSeriesResult[],
): ResolvedSeries | null {
  const resolved = resolveSeriesScoreWithCito(
    series.teamA,
    series.teamB,
    series.winsA,
    series.winsB,
    series.lastDate,
    citoResults,
    { international: isInternationalLeague(series.league) },
  )
  if (resolved.skipCompleted) return null
  if (resolved.source === 'oe' && !resolved.provisional) return series

  return {
    ...series,
    winsA: resolved.winsA,
    winsB: resolved.winsB,
    winner: resolved.winner,
    loser: resolved.loser,
    scoreLabel: `${recapTeamTag(resolved.winner)} ${resolved.score} ${recapTeamTag(resolved.loser)}`,
  }
}
