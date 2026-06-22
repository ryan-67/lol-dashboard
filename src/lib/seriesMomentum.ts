/** Game-by-game series momentum derived from ordered results (winner perspective). */

import { compareSeriesGames, type ChronologicalGame } from './seriesGrouping'

export type GameOutcome = 'W' | 'L'

export interface SeriesMomentum {
  /** W/L from series winner's perspective, in chronological order. */
  gameSequence: GameOutcome[]
  /** Winner lost game 1 then won the series (not a full reverse sweep). */
  droppedGame1: boolean
  /** Winner was down 0-2 in a Bo5+ and came back (LLWWW…). */
  reverseSweep: boolean
  /** A team won games 1 and 2 but lost the series. */
  leadBlownBy: string | null
}

export function buildGameSequence(
  games: ChronologicalGame[],
  seriesWinner: string,
): GameOutcome[] {
  const ordered = [...games].sort(compareSeriesGames)
  return ordered.map((g) => (g.winner === seriesWinner ? 'W' : 'L'))
}

export function detectLeadBlown(
  games: ChronologicalGame[],
  seriesWinner: string,
): string | null {
  const ordered = [...games].sort(compareSeriesGames)
  if (ordered.length < 3) return null
  const first = ordered[0]!.winner
  const second = ordered[1]!.winner
  if (first === second && first !== seriesWinner) return first
  return null
}

/** True when winner lost the first two games then won out (Bo5 reverse sweep). */
export function isReverseSweep(sequence: GameOutcome[]): boolean {
  if (sequence.length < 5) return false
  if (sequence[0] !== 'L' || sequence[1] !== 'L') return false
  const wins = sequence.filter((r) => r === 'W').length
  const losses = sequence.length - wins
  return wins > losses && wins >= 3
}

export function analyzeSeriesMomentum(
  games: ChronologicalGame[],
  seriesWinner: string,
): SeriesMomentum {
  const gameSequence = buildGameSequence(games, seriesWinner)
  const droppedGame1 = gameSequence[0] === 'L' && gameSequence.includes('W')
  const reverseSweep = isReverseSweep(gameSequence)
  const leadBlownBy = detectLeadBlown(games, seriesWinner)

  return {
    gameSequence,
    droppedGame1,
    reverseSweep,
    leadBlownBy,
  }
}
