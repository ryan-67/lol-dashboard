import type { TournamentSeriesRow } from './seriesAnalytics'
import { teamMatchesCanonical, resolveTeamCanonicalName } from './entities/slugs'
import type { TournamentStandingsRow } from './tournamentAnalytics'

export interface TournamentPlacementHint {
  /** Lower rank = better placement (1 = champion). */
  rank: number
  /** True when team qualified for the next international event (e.g. MSI). */
  qualified?: boolean
}

export interface TournamentRankContext {
  /** Canonical team name → placement hint from Cito schedule or manual sync. */
  citoPlacements?: Map<string, TournamentPlacementHint>
}

interface TeamTieMetrics {
  lastSeriesWin: boolean
  lastSeriesDate: string
  headToHeadWins: number
  furthestRound: number
  citoRank: number | null
  qualified: boolean
}

function canonicalTeam(name: string): string {
  return resolveTeamCanonicalName(name)
}

function teamInSeries(series: TournamentSeriesRow, team: string): boolean {
  return teamMatchesCanonical(series.teamA, team) || teamMatchesCanonical(series.teamB, team)
}

function seriesForTeam(seriesList: TournamentSeriesRow[], team: string): TournamentSeriesRow[] {
  return seriesList
    .filter((s) => teamInSeries(s, team))
    .sort((a, b) => a.date.localeCompare(b.date) || a.seriesId.localeCompare(b.seriesId))
}

function headToHeadWins(
  team: string,
  opponents: string[],
  seriesList: TournamentSeriesRow[],
): number {
  let wins = 0
  for (const opp of opponents) {
    if (teamMatchesCanonical(team, opp)) continue
    for (const s of seriesList) {
      const played =
        (teamMatchesCanonical(s.teamA, team) && teamMatchesCanonical(s.teamB, opp)) ||
        (teamMatchesCanonical(s.teamB, team) && teamMatchesCanonical(s.teamA, opp))
      if (played && teamMatchesCanonical(s.winner, team)) wins += 1
    }
  }
  return wins
}

function computeTieMetrics(
  team: string,
  seriesList: TournamentSeriesRow[],
  tiedOpponents: string[],
  context?: TournamentRankContext,
): TeamTieMetrics {
  const canon = canonicalTeam(team)
  const played = seriesForTeam(seriesList, team)
  const last = played[played.length - 1]
  const lastSeriesWin = last ? teamMatchesCanonical(last.winner, team) : false
  const furthestRound = played.length

  const cito = context?.citoPlacements?.get(canon) ?? context?.citoPlacements?.get(team)
  const citoRank = cito?.rank ?? null
  const qualified = Boolean(cito?.qualified)

  return {
    lastSeriesWin,
    lastSeriesDate: last?.date ?? '',
    headToHeadWins: headToHeadWins(team, tiedOpponents, seriesList),
    furthestRound,
    citoRank,
    qualified,
  }
}

function compareTieMetrics(a: TeamTieMetrics, b: TeamTieMetrics): number {
  if (a.qualified !== b.qualified) return a.qualified ? -1 : 1

  if (a.citoRank != null && b.citoRank != null && a.citoRank !== b.citoRank) {
    return a.citoRank - b.citoRank
  }
  if (a.citoRank != null && b.citoRank == null) return -1
  if (a.citoRank == null && b.citoRank != null) return 1

  if (a.lastSeriesWin !== b.lastSeriesWin) return a.lastSeriesWin ? -1 : 1

  if (a.headToHeadWins !== b.headToHeadWins) return b.headToHeadWins - a.headToHeadWins

  if (a.furthestRound !== b.furthestRound) return b.furthestRound - a.furthestRound

  const dateCmp = b.lastSeriesDate.localeCompare(a.lastSeriesDate)
  if (dateCmp !== 0) return dateCmp

  return 0
}

/** Sort series standings with tournament-context tie-breakers (not alphabetical). */
export function rankTournamentStandings(
  rows: TournamentStandingsRow[],
  seriesList: TournamentSeriesRow[],
  context?: TournamentRankContext,
): TournamentStandingsRow[] {
  if (!rows.length) return rows

  const sorted = [...rows].sort((a, b) => {
    if (b.winrate !== a.winrate) return b.winrate - a.winrate
    if (b.wins !== a.wins) return b.wins - a.wins
    return 0
  })

  const groups: TournamentStandingsRow[][] = []
  for (const row of sorted) {
    const prev = groups[groups.length - 1]
    if (
      prev?.length &&
      prev[0]!.winrate === row.winrate &&
      prev[0]!.wins === row.wins &&
      prev[0]!.losses === row.losses
    ) {
      prev.push(row)
    } else {
      groups.push([row])
    }
  }

  const out: TournamentStandingsRow[] = []
  for (const group of groups) {
    if (group.length === 1) {
      out.push(group[0]!)
      continue
    }

    const opponents = group.map((r) => r.team)
    const withMetrics = group.map((row) => ({
      row,
      metrics: computeTieMetrics(row.team, seriesList, opponents, context),
    }))

    withMetrics.sort((a, b) => {
      const cmp = compareTieMetrics(a.metrics, b.metrics)
      if (cmp !== 0) return cmp
      return canonicalTeam(a.row.team).localeCompare(canonicalTeam(b.row.team))
    })

    out.push(...withMetrics.map((x) => x.row))
  }

  return out
}
