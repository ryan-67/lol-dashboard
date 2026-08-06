/** Game-by-game series momentum derived from ordered results (winner perspective). */

import { compareSeriesGames, type ChronologicalGame } from './seriesGrouping'

export type GameOutcome = 'W' | 'L'

export type SeriesArc =
  | 'sweep'
  | 'reverse_sweep'
  | 'blew_2_0_lead'
  | 'came_back_from_0_1'
  | 'back_and_forth'
  | 'close_3_2'
  | 'standard'

export interface SeriesMomentum {
  /** W/L from series winner's perspective, in chronological order. */
  gameSequence: GameOutcome[]
  /** Compact string e.g. "LWLWW" for prompt/facts. */
  sequenceLabel: string
  /** High-level arc for narrative (reverse sweep, back-and-forth, etc.). */
  seriesArc: SeriesArc
  /** Human-readable arc hint for narrativeHints. */
  arcHint: string
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

function classifySeriesArc(
  sequence: GameOutcome[],
  reverseSweep: boolean,
  leadBlownBy: string | null,
  droppedGame1: boolean,
): { seriesArc: SeriesArc; arcHint: string } {
  const label = sequence.join('')
  const wins = sequence.filter((r) => r === 'W').length
  const losses = sequence.length - wins

  if (reverseSweep || leadBlownBy) {
    return {
      seriesArc: leadBlownBy ? 'blew_2_0_lead' : 'reverse_sweep',
      arcHint: leadBlownBy
        ? `series arc: blew a 2-0 lead → reverse sweep (${label})`
        : `series arc: reverse sweep from 0-2 (${label})`,
    }
  }

  if (losses === 0 && wins >= 2) {
    return {
      seriesArc: 'sweep',
      arcHint: `series arc: clean sweep (${label})`,
    }
  }

  // Alternating pattern in Bo5 (LWLWW, WLWLW, WLWLL, etc.)
  if (sequence.length >= 4) {
    let swings = 0
    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] !== sequence[i - 1]) swings++
    }
    if (swings >= 3) {
      return {
        seriesArc: 'back_and_forth',
        arcHint: `series arc: back-and-forth series (${label}) — momentum flipped repeatedly`,
      }
    }
  }

  if (sequence.length >= 5 && Math.abs(wins - losses) === 1) {
    return {
      seriesArc: 'close_3_2',
      arcHint: `series arc: went the distance 3-2 (${label})`,
    }
  }

  if (droppedGame1 && sequence.length >= 3) {
    return {
      seriesArc: 'came_back_from_0_1',
      arcHint: `series arc: dropped game 1 then came back (${label})`,
    }
  }

  // Bo3: lost G1 then won 2-1
  if (sequence.length === 3 && sequence[0] === 'L' && wins === 2) {
    return {
      seriesArc: 'came_back_from_0_1',
      arcHint: `series arc: stomped/lost game 1 but closed 2-1 (${label})`,
    }
  }

  return {
    seriesArc: 'standard',
    arcHint: `series arc: ${label}`,
  }
}

export function analyzeSeriesMomentum(
  games: ChronologicalGame[],
  seriesWinner: string,
): SeriesMomentum {
  const gameSequence = buildGameSequence(games, seriesWinner)
  const sequenceLabel = gameSequence.join('')
  const droppedGame1 = gameSequence[0] === 'L' && gameSequence.includes('W')
  const reverseSweep = isReverseSweep(gameSequence)
  const leadBlownBy = detectLeadBlown(games, seriesWinner)
  const { seriesArc, arcHint } = classifySeriesArc(
    gameSequence,
    reverseSweep,
    leadBlownBy,
    droppedGame1,
  )

  return {
    gameSequence,
    sequenceLabel,
    seriesArc,
    arcHint,
    droppedGame1,
    reverseSweep,
    leadBlownBy,
  }
}
