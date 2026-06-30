import type { GoldTimelinePoint, Player } from '../hooks/useDashboardData'
import {
  ensureGoldTimelineAtZero,
  goldTimelineForTeamPerspective,
  matchCitoGoldToOeGame,
  type CitoGameGoldRecord,
} from './citoGoldMatch'
import { golGoldTimelineForTeam, matchGolGoldToOeGame, type GolGameGoldRecord } from './golGoldMatch'

export type GoldTimelineSource = 'cito' | 'gol' | 'oe'

const MIN_TIMELINE_POINTS = 4

export function resolveGoldTimelineForGame(
  game: NonNullable<Player['gameLog']>[number],
  anchorLog: NonNullable<Player['gameLog']>,
  teamSlugOrName: string,
  opponent: string,
  citoRows: CitoGameGoldRecord[],
  golRows: GolGameGoldRecord[],
  maxMinute: number,
): { points: GoldTimelinePoint[]; dataSource: GoldTimelineSource } | null {
  const citoMatch = citoRows.length
    ? matchCitoGoldToOeGame(game, anchorLog, teamSlugOrName, opponent, citoRows)
    : null
  if (citoMatch && citoMatch.goldTimelineBlue.length >= MIN_TIMELINE_POINTS) {
    return {
      points: ensureGoldTimelineAtZero(
        goldTimelineForTeamPerspective(citoMatch, teamSlugOrName).filter(
          (p) => p.minute <= maxMinute,
        ),
      ),
      dataSource: 'cito',
    }
  }

  const golMatch = golRows.length
    ? matchGolGoldToOeGame(game, anchorLog, teamSlugOrName, opponent, golRows)
    : null
  if (golMatch && golMatch.goldTimelineBlue.length >= MIN_TIMELINE_POINTS) {
    return {
      points: golGoldTimelineForTeam(golMatch, teamSlugOrName, maxMinute),
      dataSource: 'gol',
    }
  }

  const oeTimeline = game.goldTimeline?.filter((p) => p.minute <= maxMinute) ?? []
  if (oeTimeline.length >= MIN_TIMELINE_POINTS) {
    return {
      points: ensureGoldTimelineAtZero(oeTimeline),
      dataSource: 'oe',
    }
  }

  return null
}
