import type { CitoGameSummary, CitoMatchSummary, LinkageCandidate, OeGameRecord } from './types.ts'
import { resolveTeamCanonicalName, teamMatchesCanonical } from '../../src/lib/entities/slugs.ts'
import { oeGamesForMatchup } from './oeGames.ts'

const LEAGUE_SLUG_TO_OE: Record<string, string> = {
  lck: 'LCK',
  lpl: 'LPL',
  lec: 'LEC',
  lcs: 'LCS',
}

export function citoLeagueToOe(leagueSlugOrId?: string): string | null {
  if (!leagueSlugOrId) return null
  const slug = leagueSlugOrId.replace(/^lol-/, '').toLowerCase()
  for (const [key, oe] of Object.entries(LEAGUE_SLUG_TO_OE)) {
    if (slug === key || slug.startsWith(`${key}_`)) return oe
  }
  return null
}

export function citoTeamLabel(team?: { name?: string; shortName?: string; code?: string; slug?: string }): string {
  return resolveTeamCanonicalName(team?.name ?? team?.shortName ?? team?.code ?? team?.slug ?? '')
}

export function matchTeamsFromCitoMatch(match: CitoMatchSummary): [string, string] | null {
  const teams = match.teams ?? []
  if (teams.length < 2) return null
  return [citoTeamLabel(teams[0]), citoTeamLabel(teams[1])]
}

export function matchTeamsFromCitoGame(game: CitoGameSummary): [string, string] | null {
  const blue = game.blueTeam
  const red = game.redTeam
  if (!blue || !red) return null
  return [citoTeamLabel(blue), citoTeamLabel(red)]
}

export function buildLinkageCandidates(
  match: CitoMatchSummary,
  citoGames: CitoGameSummary[],
  oeGames: OeGameRecord[],
): LinkageCandidate[] {
  const pair = matchTeamsFromCitoMatch(match)
  if (!pair) return []

  const [teamA, teamB] = pair
  const league =
    citoLeagueToOe(match.tournament?.league?.slug ?? match.tournament?.league?.leagueId) ?? 'UNKNOWN'
  const date = (match.startTime ?? '').slice(0, 10)
  if (!date) return []

  const oeMatchGames = oeGamesForMatchup(oeGames, teamA, teamB, date)
  const candidates: LinkageCandidate[] = []

  const sortedCito = [...citoGames].sort((a, b) => (a.gameNumber ?? 0) - (b.gameNumber ?? 0))
  const sortedOe = [...oeMatchGames]

  for (let i = 0; i < sortedCito.length; i++) {
    const citoGame = sortedCito[i]!
    const gameNumber = citoGame.gameNumber ?? i + 1
    const oeGame = sortedOe[i]

    if (!oeGame) {
      candidates.push({
        oeGameId: '',
        citoGameId: citoGame.gameId,
        citoMatchId: match.matchId,
        league,
        gameDate: date,
        teamA,
        teamB,
        gameNumber,
        matchMethod: 'date_teams_game_number',
        confidence: 0.35,
        notes: 'No OE game at series index (OE lag or missing split data)',
      })
      continue
    }

    const gameTeams = matchTeamsFromCitoGame(citoGame)
    const teamOk =
      gameTeams &&
      ((teamMatchesCanonical(oeGame.team, gameTeams[0]) && teamMatchesCanonical(oeGame.opponent, gameTeams[1])) ||
        (teamMatchesCanonical(oeGame.team, gameTeams[1]) && teamMatchesCanonical(oeGame.opponent, gameTeams[0])))

    candidates.push({
      oeGameId: oeGame.gameId,
      citoGameId: citoGame.gameId,
      citoMatchId: match.matchId,
      league,
      gameDate: date,
      teamA,
      teamB,
      gameNumber,
      matchMethod: 'date_teams_game_number',
      confidence: teamOk ? 0.92 : 0.7,
      notes: teamOk ? undefined : 'Series index matched; per-game team sides differ',
    })
  }

  return candidates
}

export function linkageWithOeId(candidates: LinkageCandidate[]): LinkageCandidate[] {
  return candidates.filter((c) => c.oeGameId)
}
