import type { Player, PlayerGameLog, Team } from '../hooks/useDashboardData'
import { normalizePosition, type RoleKey } from './playerRadar'
import { findTeamByName } from './teamAnalytics'

export interface WeeklyRecapWindow {
  start: Date
  end: Date
  label: string
}

export interface WeeklyRecapLine {
  id: string
  text: string
}

interface ParsedGame {
  id: string
  date: string
  winner: string
  loser: string
  players: Array<{
    team: string
    name: string
    champion: string
    role: RoleKey | null
    kda: number
    gd15: number
    won: boolean
  }>
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function inWindow(log: PlayerGameLog, window: WeeklyRecapWindow): boolean {
  const d = parseDate(log.date)
  if (!d) return false
  return d >= window.start && d <= window.end
}

function shortTeam(name: string): string {
  const compact = name.replace(/\s+esports$/i, '').replace(/\s+gaming$/i, '')
  if (compact.length <= 12) return compact.toLowerCase()
  return compact.split(/\s+/)[0]?.toLowerCase() ?? name.toLowerCase()
}

function collectWeeklyGames(players: Player[], window: WeeklyRecapWindow): ParsedGame[] {
  const seen = new Set<string>()
  const games: ParsedGame[] = []

  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      if (!inWindow(g, window)) continue
      const id = g.gameId ?? `${g.date}|${player.team}|${g.opponent ?? ''}|${g.result}`
      if (seen.has(id)) continue
      seen.add(id)

      const opponent = g.opponent?.trim()
      if (!opponent) continue
      const won = g.result === 1
      const winner = won ? player.team : opponent
      const loser = won ? opponent : player.team

      const roster: ParsedGame['players'] = []
      for (const p of players) {
        for (const pg of p.gameLog ?? []) {
          const pgId = pg.gameId ?? `${pg.date}|${p.team}|${pg.opponent ?? ''}|${pg.result}`
          if (pgId !== id) continue
          roster.push({
            team: p.team,
            name: p.name,
            champion: pg.champion,
            role: normalizePosition(p.position),
            kda: pg.kda,
            gd15: pg.gd15,
            won: pg.result === 1,
          })
        }
      }

      games.push({ id, date: g.date, winner, loser, players: roster })
    }
  }

  return games.sort((a, b) => a.date.localeCompare(b.date))
}

interface SeriesBucket {
  teamA: string
  teamB: string
  games: ParsedGame[]
}

function seriesKey(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y)).join('|')
}

function groupSeries(games: ParsedGame[]): SeriesBucket[] {
  const map = new Map<string, SeriesBucket>()
  for (const g of games) {
    const key = seriesKey(g.winner, g.loser)
    const [teamA, teamB] = [g.winner, g.loser].sort((a, b) => a.localeCompare(b))
    const bucket = map.get(key) ?? { teamA, teamB, games: [] }
    bucket.games.push(g)
    map.set(key, bucket)
  }
  return [...map.values()].sort((a, b) => b.games.length - a.games.length)
}

function splitWinrate(teams: Team[], name: string): number {
  const t = findTeamByName(teams, name)
  return t?.winrate ?? 50
}

function laneGapLine(series: SeriesBucket, role: RoleKey): string | null {
  let bestGap = 0
  let winner = ''
  let loser = ''
  for (const g of series.games) {
    const aPlayers = g.players.filter((p) => p.role === role)
    if (aPlayers.length < 2) continue
    const byTeam = new Map<string, typeof aPlayers>()
    for (const p of aPlayers) {
      const list = byTeam.get(p.team) ?? []
      list.push(p)
      byTeam.set(p.team, list)
    }
    const teams = [...byTeam.keys()]
    if (teams.length < 2) continue
    const [t1, t2] = teams
    const gd1 = (byTeam.get(t1)?.[0]?.gd15 ?? 0)
    const gd2 = (byTeam.get(t2)?.[0]?.gd15 ?? 0)
    const gap = Math.abs(gd1 - gd2)
    if (gap > bestGap) {
      bestGap = gap
      if (gd1 > gd2) {
        winner = byTeam.get(t1)?.[0]?.name ?? ''
        loser = byTeam.get(t2)?.[0]?.name ?? ''
      } else {
        winner = byTeam.get(t2)?.[0]?.name ?? ''
        loser = byTeam.get(t1)?.[0]?.name ?? ''
      }
    }
  }
  if (bestGap < 80 || !winner || !loser) return null
  return `${winner.toLowerCase()} completely gapped ${loser.toLowerCase()} in lane`
}

function carryNarrative(game: ParsedGame, winner: string): string | null {
  const winners = game.players.filter((p) => p.team === winner && p.won)
  if (winners.length < 3) return null
  const sorted = [...winners].sort((a, b) => a.kda - b.kda)
  const floor = sorted[0]
  const stars = sorted.filter((p) => p.kda >= 4 && p.name !== floor?.name)
  if (!floor || floor.kda > 2.2 || stars.length < 2) return null
  const names = stars.map((p) => p.name.toLowerCase()).slice(0, 3)
  return `lowkey ${floor.name.toLowerCase()} did nothing and got carried by ${names.join(', ')}`
}

function summarizeSeries(
  bucket: SeriesBucket,
  teams: Team[],
  league: string,
): WeeklyRecapLine | null {
  const { teamA, teamB, games } = bucket
  if (!games.length) return null

  const winsA = games.filter((g) => g.winner === teamA).length
  const winsB = games.length - winsA
  const dominant = winsA >= winsB ? teamA : teamB
  const victim = dominant === teamA ? teamB : teamA
  const domWins = Math.max(winsA, winsB)
  const vicWins = Math.min(winsA, winsB)

  const domShort = shortTeam(dominant)
  const vicShort = shortTeam(victim)
  const domSplitWr = splitWinrate(teams, dominant)
  const vicSplitWr = splitWinrate(teams, victim)
  const upset = domSplitWr + 8 < vicSplitWr

  const ordered = [...games].sort((a, b) => a.date.localeCompare(b.date))
  const firstLoss =
    vicWins > 0
      ? ordered.findIndex((g) => g.winner === victim)
      : -1
  const reverseSweep = vicWins > 0 && domWins > vicWins && firstLoss === 0

  const blowout =
    domWins >= 2 &&
    vicWins === 0 &&
    games.every((g) => g.winner === dominant)

  const parts: string[] = []

  if (reverseSweep && domWins >= 2) {
    parts.push(
      `${shortTeam(dominant)} proves they're still the real deal in ${league}, reverse sweeping ${vicShort} ${domWins}-${vicWins} this week`,
    )
  } else if (blowout && domWins >= 3) {
    parts.push(`once again, ${vicShort} got slaughtered by ${domShort} ${domWins}-0`)
  } else if (blowout) {
    parts.push(`${domShort} ran through ${vicShort} ${domWins}-0 this week`)
  } else if (upset) {
    parts.push(
      `${domShort} (${domSplitWr.toFixed(0)}% split wr) lowkey shocked ${vicShort} (${vicSplitWr.toFixed(0)}%) ${domWins}-${vicWins}`,
    )
  } else {
    parts.push(`${domShort} beat ${vicShort} ${domWins}-${vicWins} on the week`)
  }

  const midGap = laneGapLine(bucket, 'mid')
  if (midGap) parts.push(midGap)

  const lastWin = [...ordered].reverse().find((g) => g.winner === dominant)
  if (lastWin) {
    const carry = carryNarrative(lastWin, dominant)
    if (carry) parts.push(carry)
  }

  const mvp = games
    .flatMap((g) => g.players.filter((p) => p.team === dominant && p.won))
    .sort((a, b) => b.kda - a.kda)[0]
  if (mvp && mvp.kda >= 6 && !parts.some((p) => p.includes(mvp.name.toLowerCase()))) {
    parts.push(`${mvp.name.toLowerCase()} went nuclear on ${mvp.champion.toLowerCase()} (${mvp.kda.toFixed(1)} kda)`)
  }

  return {
    id: seriesKey(teamA, teamB),
    text: parts.join('. ') + '.',
  }
}

export function buildWeeklyRecapLines(
  players: Player[],
  teams: Team[],
  window: WeeklyRecapWindow | null,
  league: string,
): WeeklyRecapLine[] {
  if (!window) return []
  const games = collectWeeklyGames(players, window)
  if (!games.length) return []

  const series = groupSeries(games)
  const lines: WeeklyRecapLine[] = []

  for (const bucket of series) {
    if (bucket.games.length < 1) continue
    const line = summarizeSeries(bucket, teams, league === 'All Tier 1' ? 'tier 1' : league)
    if (line) lines.push(line)
  }

  return lines.slice(0, 8)
}
