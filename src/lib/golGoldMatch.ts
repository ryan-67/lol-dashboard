import type { GoldTimelinePoint, Player } from '../hooks/useDashboardData'
import { teamMatchesCanonical } from './entities/slugs'
import { ensureGoldTimelineAtZero, goldTimelineForTeamPerspective } from './citoGoldMatch'
import type { CitoGameGoldRecord } from './citoGoldMatch'

export interface GolGameGoldRecord {
  golGameId: string
  gameDate: string
  gameNumber: number | null
  blueTeam: string | null
  redTeam: string | null
  goldTimelineBlue: Array<{ minute: number; goldDiffBlue: number }>
}

function golAsCitoRow(row: GolGameGoldRecord): CitoGameGoldRecord {
  return {
    citoGameId: row.golGameId,
    oeGameId: null,
    gameDate: row.gameDate,
    gameNumber: row.gameNumber,
    blueTeam: row.blueTeam,
    redTeam: row.redTeam,
    blueSlug: null,
    redSlug: null,
    goldTimelineBlue: row.goldTimelineBlue,
    objectivesTimeline: [],
  }
}

function countMatchupGameIndex(
  anchorLog: NonNullable<Player['gameLog']>,
  game: NonNullable<Player['gameLog']>[number],
  opponent: string,
): number {
  const same = anchorLog
    .filter(
      (g) =>
        g.date === game.date &&
        teamMatchesCanonical(g.opponent ?? '', opponent),
    )
    .sort((a, b) => (a.gameId ?? '').localeCompare(b.gameId ?? ''))

  const idx = same.findIndex((g) => g.gameId === game.gameId)
  return idx >= 0 ? idx + 1 : same.length + 1
}

export function matchGolGoldToOeGame(
  game: NonNullable<Player['gameLog']>[number],
  anchorLog: NonNullable<Player['gameLog']>,
  teamSlugOrName: string,
  opponent: string,
  rows: GolGameGoldRecord[],
): GolGameGoldRecord | null {
  const date = game.date
  const ordinal = countMatchupGameIndex(anchorLog, game, opponent)

  const byTeams = rows.filter(
    (r) =>
      r.gameDate === date &&
      ((teamMatchesCanonical(r.blueTeam ?? '', teamSlugOrName) &&
        teamMatchesCanonical(r.redTeam ?? '', opponent)) ||
        (teamMatchesCanonical(r.redTeam ?? '', teamSlugOrName) &&
          teamMatchesCanonical(r.blueTeam ?? '', opponent))),
  )

  if (!byTeams.length) return null
  if (byTeams.length === 1) return byTeams[0]!

  const byNumber = byTeams.find((r) => r.gameNumber === ordinal)
  if (byNumber) return byNumber

  const sorted = [...byTeams].sort((a, b) => (a.gameNumber ?? 0) - (b.gameNumber ?? 0))
  return sorted[ordinal - 1] ?? sorted[0] ?? null
}

export function golGoldTimelineForTeam(
  row: GolGameGoldRecord,
  teamSlugOrName: string,
  maxMinute: number,
): GoldTimelinePoint[] {
  return ensureGoldTimelineAtZero(
    goldTimelineForTeamPerspective(golAsCitoRow(row), teamSlugOrName).filter(
      (p) => p.minute <= maxMinute,
    ),
  )
}
