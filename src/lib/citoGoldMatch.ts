import type { GoldTimelinePoint, Player } from '../hooks/useDashboardData'
import { teamMatchesCanonical } from './entities/slugs'

export interface CitoObjectiveEvent {
  minute: number
  objectiveType: string
  side: string
  eventType?: string
  playerName?: string
}

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
  objectivesTimeline: CitoObjectiveEvent[]
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

  const timeline = row.goldTimelineBlue.map(({ minute, goldDiffBlue }) => ({
    minute,
    goldDiff: onRed && !onBlue ? -goldDiffBlue : goldDiffBlue,
  }))

  return ensureGoldTimelineAtZero(timeline)
}

export interface TeamObjectiveCounts {
  dragons: number
  barons: number
  towers: number
}

/** Count dragons, barons, and towers secured by a side from Cito objective events. */
export function countObjectivesForSide(
  events: CitoObjectiveEvent[],
  teamSide: 'blue' | 'red',
): TeamObjectiveCounts {
  const counts: TeamObjectiveCounts = { dragons: 0, barons: 0, towers: 0 }
  for (const e of events) {
    if (e.side.toLowerCase() !== teamSide) continue
    const type = e.objectiveType.toLowerCase()
    if (type.includes('dragon') || type.includes('drake') || type.includes('elder')) {
      counts.dragons += 1
    } else if (type.includes('baron')) {
      counts.barons += 1
    } else if (type.includes('tower') || type.includes('turret') || type.includes('inhib')) {
      counts.towers += 1
    }
  }
  return counts
}

/** Force minute 0 to neutral gold diff; games start even. */
export function ensureGoldTimelineAtZero(points: GoldTimelinePoint[]): GoldTimelinePoint[] {
  if (!points.length) return [{ minute: 0, goldDiff: 0 }]

  const sorted = [...points].sort((a, b) => a.minute - b.minute)
  const first = sorted[0]!
  if (first.minute === 0) {
    if (first.goldDiff !== 0) sorted[0] = { minute: 0, goldDiff: 0 }
    return sorted
  }
  return [{ minute: 0, goldDiff: 0 }, ...sorted]
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
