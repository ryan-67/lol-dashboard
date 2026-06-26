import type { GoldTimelinePoint, Player } from '../hooks/useDashboardData'
import { teamMatchesCanonical } from './entities/slugs'

export interface CitoGameGoldRecord {
  citoGameId: string
  oeGameId: string | null
  gameDate: string
  gameNumber: number | null
  blueTeam: string | null
  redTeam: string | null
  blueSlug: string | null
  redSlug: string | null
  goldTimelineBlue: Array<{ minute: number; goldDiffBlue: number }>
}

export function goldTimelineForTeamPerspective(
  row: CitoGameGoldRecord,
  teamSlugOrName: string,
): GoldTimelinePoint[] {
  const team = teamSlugOrName.toLowerCase().replace(/[^a-z0-9]/g, '')
  const blueSlug = (row.blueSlug ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const redSlug = (row.redSlug ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const blueName = (row.blueTeam ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const redName = (row.redTeam ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

  const onBlue =
    teamMatchesCanonical(row.blueTeam ?? '', teamSlugOrName) ||
    (blueSlug && (team.includes(blueSlug) || blueSlug.includes(team))) ||
    (blueName && (team.includes(blueName) || blueName.includes(team)))

  const onRed =
    teamMatchesCanonical(row.redTeam ?? '', teamSlugOrName) ||
    (redSlug && (team.includes(redSlug) || redSlug.includes(team))) ||
    (redName && (team.includes(redName) || redName.includes(team)))

  return row.goldTimelineBlue.map(({ minute, goldDiffBlue }) => ({
    minute,
    goldDiff: onRed && !onBlue ? -goldDiffBlue : goldDiffBlue,
  }))
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

export function matchCitoGoldToOeGame(
  game: NonNullable<Player['gameLog']>[number],
  anchorLog: NonNullable<Player['gameLog']>,
  teamSlugOrName: string,
  opponent: string,
  rows: CitoGameGoldRecord[],
): CitoGameGoldRecord | null {
  const oeId = game.gameId
  if (oeId) {
    const byOe = rows.find((r) => r.oeGameId === oeId)
    if (byOe) return byOe
  }

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
