/**
 * Overlay Cito-verified score onto an OE-resolved series (identity pages / lists).
 * Mid-series pages are allowed — scores are labeled "in progress" with best-of context
 * instead of looking like a finished result.
 */
import type { ResolvedSeries } from './seriesAnalytics'
import {
  type CitoSeriesResult,
  formatSeriesScoreLabel,
  isInternationalContext,
  resolveSeriesScoreWithCito,
} from './citoSeriesVerify'
import { resolveTournamentFormat } from './tournamentFormat'

export type SeriesPageResolution = {
  series: ResolvedSeries
  inProgress: boolean
  bestOf: number | null
  complete: boolean
}

export function applyCitoScoreToSeries(
  series: ResolvedSeries,
  citoResults: CitoSeriesResult[],
): SeriesPageResolution {
  const format = resolveTournamentFormat({
    league: series.league,
    split: series.split,
    playoffs: series.playoffs,
    tournamentLabel: series.split,
  })
  const international = isInternationalContext({
    league: series.league,
    split: series.split,
  })
  const resolved = resolveSeriesScoreWithCito(
    series.teamA,
    series.teamB,
    series.winsA,
    series.winsB,
    series.lastDate,
    citoResults,
    {
      international,
      defaultBestOf: format?.defaultBestOf ?? (international && format?.id !== 'EWC' ? 5 : null),
      formatId: format?.id ?? null,
      league: series.league,
      tournamentLabel: series.split,
    },
  )

  const inProgress = resolved.provisional || !resolved.complete
  const bestOf = resolved.bestOf ?? format?.defaultBestOf ?? null
  const scoreLabel = formatSeriesScoreLabel({
    teamA: series.teamA,
    teamB: series.teamB,
    winsA: resolved.winsA,
    winsB: resolved.winsB,
    inProgress,
    bestOf,
  })

  return {
    series: {
      ...series,
      winsA: resolved.winsA,
      winsB: resolved.winsB,
      winner: resolved.winner,
      loser: resolved.loser,
      scoreLabel,
      inProgress,
      bestOf,
      complete: resolved.complete && !resolved.provisional,
    },
    inProgress,
    bestOf,
    complete: resolved.complete && !resolved.provisional,
  }
}
