import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import type { TournamentSeriesRow } from './seriesAnalytics'
import type { CitoScheduleRow } from './loadCitoSchedule'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
import type { TournamentStandingsRow } from './tournamentAnalytics'

export interface TournamentResultsRow {
  standing: number
  standingLabel: string
  team: string
  wins: number
  losses: number
  winrate: number
  matchWins: number
  matchLosses: number
  matchWinrate: number
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

function standingLabelForRank(rank: number, tiedCount: number): string {
  if (tiedCount <= 1) return ordinal(rank)
  return `${ordinal(rank)}–${ordinal(rank + tiedCount - 1)}`
}

function teamGameRecords(
  players: Player[],
  gameFilter?: (g: PlayerGameLog) => boolean,
): Map<string, { wins: number; losses: number }> {
  const out = new Map<string, { wins: number; losses: number }>()
  const seen = new Set<string>()

  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      if (gameFilter && !gameFilter(g)) continue
      const id = g.gameId ?? `${g.date}|${player.team}|${g.opponent ?? ''}|${g.result}`
      const key = `${resolveTeamCanonicalName(player.team)}|${id}`
      if (seen.has(key)) continue
      seen.add(key)
      const team = resolveTeamCanonicalName(player.team)
      const cur = out.get(team) ?? { wins: 0, losses: 0 }
      if (g.result === 1) cur.wins += 1
      else cur.losses += 1
      out.set(team, cur)
    }
  }
  return out
}

function blockRoundDepth(block: string): number {
  const b = block.toLowerCase()
  if (/grand\s*final|\bfinal\b/.test(b) && !/semi|quarter|group/.test(b)) return 1
  if (/semi/.test(b)) return 2
  if (/quarter/.test(b)) return 3
  if (/group|swiss|round\s*robin/.test(b)) return 4
  return 5
}

function winnerFromCitoRow(row: CitoScheduleRow): string | null {
  if (row.winner_team?.trim()) return row.winner_team.trim()
  if (
    typeof row.team_a_score === 'number' &&
    typeof row.team_b_score === 'number' &&
    row.team_a_score !== row.team_b_score
  ) {
    return row.team_a_score > row.team_b_score ? row.team_a : row.team_b
  }
  return null
}

/** Build placement rows from completed Cito schedule (block-aware bracket). */
export function buildResultsFromCitoSchedule(
  rows: CitoScheduleRow[],
  seriesRows: TournamentStandingsRow[],
  players: Player[],
  gameFilter?: (g: PlayerGameLog) => boolean,
): TournamentResultsRow[] {
  if (!rows.length) return []

  const matchGames = teamGameRecords(players, gameFilter)
  const seriesByTeam = new Map(seriesRows.map((r) => [resolveTeamCanonicalName(r.team), r]))

  const completed = rows
    .map((row) => {
      const winner = winnerFromCitoRow(row)
      if (!winner) return null
      const loser = teamMatchesCanonical(winner, row.team_a) ? row.team_b : row.team_a
      const block = row.block_name ?? row.tournament_name ?? ''
      return {
        row,
        winner: resolveTeamCanonicalName(winner),
        loser: resolveTeamCanonicalName(loser),
        depth: blockRoundDepth(block),
        date: row.scheduled_at ?? '',
      }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => a.date.localeCompare(b.date) || a.depth - b.depth)

  if (!completed.length) return []

  const placementDepth = new Map<string, number>()
  const minDepthByRound = new Map<number, number>()
  let nextRank = 1

  const finalMatches = completed.filter((m) => m.depth === 1)
  const seed = finalMatches.length ? finalMatches[finalMatches.length - 1]! : completed[completed.length - 1]!
  placementDepth.set(seed.winner, 1)
  placementDepth.set(seed.loser, 2)
  minDepthByRound.set(1, 1)
  minDepthByRound.set(2, 2)
  nextRank = 3

  const byDepth = new Map<number, string[]>()
  for (const match of completed) {
    if (placementDepth.has(match.loser)) continue
    const list = byDepth.get(match.depth) ?? []
    if (!list.includes(match.loser)) list.push(match.loser)
    byDepth.set(match.depth, list)
  }

  const depthLevels = [...byDepth.keys()].filter((d) => d > 1).sort((a, b) => a - b)
  for (const depth of depthLevels) {
    const teams = byDepth.get(depth) ?? []
    if (!teams.length) continue
    for (const team of teams) {
      if (!placementDepth.has(team)) placementDepth.set(team, nextRank)
    }
    nextRank += teams.length
  }

  for (const row of seriesRows) {
    const canon = resolveTeamCanonicalName(row.team)
    if (!placementDepth.has(canon)) {
      placementDepth.set(canon, nextRank)
      nextRank += 1
    }
  }

  const grouped = new Map<number, string[]>()
  for (const [team, rank] of placementDepth) {
    const list = grouped.get(rank) ?? []
    list.push(team)
    grouped.set(rank, list)
  }

  const results: TournamentResultsRow[] = []
  for (const rank of [...grouped.keys()].sort((a, b) => a - b)) {
    const teams = grouped.get(rank) ?? []
    teams.sort((a, b) => {
      const sa = seriesByTeam.get(a)
      const sb = seriesByTeam.get(b)
      if ((sb?.winrate ?? 0) !== (sa?.winrate ?? 0)) return (sb?.winrate ?? 0) - (sa?.winrate ?? 0)
      if ((sb?.wins ?? 0) !== (sa?.wins ?? 0)) return (sb?.wins ?? 0) - (sa?.wins ?? 0)
      const ma = matchGames.get(a)
      const mb = matchGames.get(b)
      const mwrA = ma && ma.wins + ma.losses ? ma.wins / (ma.wins + ma.losses) : 0
      const mwrB = mb && mb.wins + mb.losses ? mb.wins / (mb.wins + mb.losses) : 0
      if (mwrB !== mwrA) return mwrB - mwrA
      return a.localeCompare(b)
    })

    for (const team of teams) {
      const series = seriesByTeam.get(team) ?? { wins: 0, losses: 0, winrate: 0, team, league: '' }
      const games = matchGames.get(team) ?? { wins: 0, losses: 0 }
      const matchTotal = games.wins + games.losses
      results.push({
        standing: rank,
        standingLabel: standingLabelForRank(rank, teams.length),
        team,
        wins: series.wins,
        losses: series.losses,
        winrate: series.winrate,
        matchWins: games.wins,
        matchLosses: games.losses,
        matchWinrate: matchTotal ? (games.wins / matchTotal) * 100 : 0,
      })
    }
  }

  return results
}

/** Bracket placement fallback from OE series chronology when Cito rows are unavailable. */
export function buildResultsFromSeries(
  seriesList: TournamentSeriesRow[],
  seriesRows: TournamentStandingsRow[],
  players: Player[],
  gameFilter?: (g: PlayerGameLog) => boolean,
): TournamentResultsRow[] {
  if (!seriesList.length) return []

  const sorted = [...seriesList].sort((a, b) => a.date.localeCompare(b.date) || a.seriesId.localeCompare(b.seriesId))
  const last = sorted[sorted.length - 1]!
  const champion = resolveTeamCanonicalName(last.winner)
  const runnerUp = resolveTeamCanonicalName(last.loser)

  const lastSeriesIndex = new Map<string, { index: number; won: boolean }>()
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!
    for (const team of [s.teamA, s.teamB]) {
      const canon = resolveTeamCanonicalName(team)
      lastSeriesIndex.set(canon, {
        index: i,
        won: teamMatchesCanonical(s.winner, team),
      })
    }
  }

  const placementDepth = new Map<string, number>()
  placementDepth.set(champion, 1)
  placementDepth.set(runnerUp, 2)

  const roundLosers = new Map<number, Set<string>>()
  for (const [team, info] of lastSeriesIndex) {
    if (placementDepth.has(team)) continue
    if (info.won) continue
    const depth = sorted.length - info.index
    const set = roundLosers.get(depth) ?? new Set<string>()
    set.add(team)
    roundLosers.set(depth, set)
  }

  let nextRank = 3
  for (const depth of [...roundLosers.keys()].sort((a, b) => a - b)) {
    const teams = [...(roundLosers.get(depth) ?? [])]
    for (const team of teams) {
      if (!placementDepth.has(team)) placementDepth.set(team, nextRank)
    }
    nextRank += teams.length
  }

  for (const row of seriesRows) {
    const canon = resolveTeamCanonicalName(row.team)
    if (!placementDepth.has(canon)) {
      placementDepth.set(canon, nextRank)
      nextRank += 1
    }
  }

  const matchGames = teamGameRecords(players, gameFilter)
  const seriesByTeam = new Map(seriesRows.map((r) => [resolveTeamCanonicalName(r.team), r]))
  const grouped = new Map<number, string[]>()
  for (const [team, rank] of placementDepth) {
    const list = grouped.get(rank) ?? []
    list.push(team)
    grouped.set(rank, list)
  }

  const results: TournamentResultsRow[] = []
  for (const rank of [...grouped.keys()].sort((a, b) => a - b)) {
    const teams = grouped.get(rank) ?? []
    teams.sort((a, b) => {
      const sa = seriesByTeam.get(a)
      const sb = seriesByTeam.get(b)
      if ((sb?.winrate ?? 0) !== (sa?.winrate ?? 0)) return (sb?.winrate ?? 0) - (sa?.winrate ?? 0)
      if ((sb?.wins ?? 0) !== (sa?.wins ?? 0)) return (sb?.wins ?? 0) - (sa?.wins ?? 0)
      const ma = matchGames.get(a)
      const mb = matchGames.get(b)
      const mwrA = ma && ma.wins + ma.losses ? ma.wins / (ma.wins + ma.losses) : 0
      const mwrB = mb && mb.wins + mb.losses ? mb.wins / (mb.wins + mb.losses) : 0
      if (mwrB !== mwrA) return mwrB - mwrA
      return a.localeCompare(b)
    })

    for (const team of teams) {
      const series = seriesByTeam.get(team) ?? { wins: 0, losses: 0, winrate: 0, team, league: '' }
      const games = matchGames.get(team) ?? { wins: 0, losses: 0 }
      const matchTotal = games.wins + games.losses
      results.push({
        standing: rank,
        standingLabel: standingLabelForRank(rank, teams.length),
        team,
        wins: series.wins,
        losses: series.losses,
        winrate: series.winrate,
        matchWins: games.wins,
        matchLosses: games.losses,
        matchWinrate: matchTotal ? (games.wins / matchTotal) * 100 : 0,
      })
    }
  }

  return results
}

/**
 * Primary standings: series W-L from OE tournament games.
 * Bracket/Cito placement is only used as a tie-break hint when it doesn't invent
 * massive Swiss-style ties or inject teams that never played in OE.
 */
export function buildResultsFromSeriesRecord(
  seriesRows: TournamentStandingsRow[],
  players: Player[],
  gameFilter?: (g: PlayerGameLog) => boolean,
  participantAllowlist?: Set<string>,
): TournamentResultsRow[] {
  const matchGames = teamGameRecords(players, gameFilter)
  const rows = seriesRows
    .map((row) => {
      const team = resolveTeamCanonicalName(row.team)
      return { ...row, team }
    })
    .filter((row) => {
      if (participantAllowlist && !participantAllowlist.has(row.team)) return false
      // Drop phantoms / schedule-only shells with no series result.
      return row.wins + row.losses > 0
    })
    .sort((a, b) => {
      if (b.winrate !== a.winrate) return b.winrate - a.winrate
      if (b.wins !== a.wins) return b.wins - a.wins
      if (a.losses !== b.losses) return a.losses - b.losses
      const ma = matchGames.get(a.team)
      const mb = matchGames.get(b.team)
      const mwrA = ma && ma.wins + ma.losses ? ma.wins / (ma.wins + ma.losses) : 0
      const mwrB = mb && mb.wins + mb.losses ? mb.wins / (mb.wins + mb.losses) : 0
      if (mwrB !== mwrA) return mwrB - mwrA
      return a.team.localeCompare(b.team)
    })

  const results: TournamentResultsRow[] = []
  let i = 0
  while (i < rows.length) {
    let j = i + 1
    while (
      j < rows.length &&
      rows[j]!.winrate === rows[i]!.winrate &&
      rows[j]!.wins === rows[i]!.wins &&
      rows[j]!.losses === rows[i]!.losses
    ) {
      j += 1
    }
    const tiedCount = j - i
    const rank = i + 1
    for (let k = i; k < j; k++) {
      const row = rows[k]!
      const games = matchGames.get(row.team) ?? { wins: 0, losses: 0 }
      const matchTotal = games.wins + games.losses
      results.push({
        standing: rank,
        standingLabel: standingLabelForRank(rank, tiedCount),
        team: row.team,
        wins: row.wins,
        losses: row.losses,
        winrate: row.winrate,
        matchWins: games.wins,
        matchLosses: games.losses,
        matchWinrate: matchTotal ? (games.wins / matchTotal) * 100 : 0,
      })
    }
    i = j
  }
  return results
}

function participantsFromSeries(seriesList: TournamentSeriesRow[]): Set<string> {
  const out = new Set<string>()
  for (const s of seriesList) {
    if (s.inProgress) continue
    out.add(resolveTeamCanonicalName(s.teamA))
    out.add(resolveTeamCanonicalName(s.teamB))
  }
  return out
}

function placementLooksBroken(rows: TournamentResultsRow[]): boolean {
  if (!rows.length) return true
  const byLabel = new Map<string, number>()
  for (const row of rows) {
    byLabel.set(row.standingLabel, (byLabel.get(row.standingLabel) ?? 0) + 1)
  }
  // MSI/Swiss bug signature: a single "3rd–Nth" blob covering most of the field.
  for (const count of byLabel.values()) {
    if (count >= 6) return true
  }
  // Perfect series record ranked below winless teams.
  const sorted = [...rows].sort((a, b) => a.standing - b.standing)
  const firstWinless = sorted.findIndex((r) => r.wins === 0 && r.losses > 0)
  const firstPerfect = sorted.findIndex((r) => r.wins > 0 && r.losses === 0)
  if (firstPerfect >= 0 && firstWinless >= 0 && firstPerfect > firstWinless) return true
  // 0–0 shells should never appear.
  if (rows.some((r) => r.wins === 0 && r.losses === 0)) return true
  return false
}

export function buildTournamentResultsStandings(
  seriesList: TournamentSeriesRow[],
  seriesRows: TournamentStandingsRow[],
  players: Player[],
  citoRows: CitoScheduleRow[],
  gameFilter?: (g: PlayerGameLog) => boolean,
): TournamentResultsRow[] {
  const allowlist = participantsFromSeries(seriesList)
  // Also allow teams that appear in series standings with real W-L.
  for (const row of seriesRows) {
    if (row.wins + row.losses > 0) allowlist.add(resolveTeamCanonicalName(row.team))
  }

  const fromRecord = buildResultsFromSeriesRecord(seriesRows, players, gameFilter, allowlist)
  if (fromRecord.length) return fromRecord

  const fromCito = buildResultsFromCitoSchedule(citoRows, seriesRows, players, gameFilter).filter(
    (row) => row.wins + row.losses > 0 && (!allowlist.size || allowlist.has(row.team)),
  )
  if (fromCito.length && !placementLooksBroken(fromCito)) return fromCito

  const fromBracket = buildResultsFromSeries(seriesList, seriesRows, players, gameFilter).filter(
    (row) => row.wins + row.losses > 0,
  )
  if (fromBracket.length && !placementLooksBroken(fromBracket)) return fromBracket

  return fromRecord
}
