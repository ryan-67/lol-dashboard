/** Group individual OE games into Bo3/Bo5 series by matchup, chronology, and completion. */

export const SERIES_GAP_DAYS = 5

export interface ChronologicalGame {
  id: string
  date: string
  winner: string
  loser: string
}

export interface SeriesBucket<T extends ChronologicalGame = ChronologicalGame> {
  teamA: string
  teamB: string
  games: T[]
}

export function seriesKey(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y)).join('|')
}

export function canonicalSeriesTeams(a: string, b: string): [string, string] {
  return [a, b].sort((x, y) => x.localeCompare(y)) as [string, string]
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function daysBetween(a: string, b: string): number {
  const da = parseDate(a)
  const db = parseDate(b)
  if (!da || !db) return 999
  return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24)
}

/** Match OE game ordering: date, then game id ordinal, then id string. */
export function gameOrdinalFromId(id: string): number {
  const tail = id.match(/[_-](\d+)$/)
  if (tail) return Number(tail[1])
  const embedded = id.match(/game[_-]?(\d+)/i)
  if (embedded) return Number(embedded[1])
  return 0
}

export function compareSeriesGames(
  a: { date: string; id: string },
  b: { date: string; id: string },
): number {
  const byDate = a.date.localeCompare(b.date)
  if (byDate !== 0) return byDate
  const byOrd = gameOrdinalFromId(a.id) - gameOrdinalFromId(b.id)
  if (byOrd !== 0) return byOrd
  return a.id.localeCompare(b.id)
}

export function countSeriesWins(games: ChronologicalGame[], team: string): number {
  return games.filter((g) => g.winner === team).length
}

/** True when cumulative wins match a completed Bo3 or Bo5 (unambiguous). */
export function isSeriesComplete(
  games: ChronologicalGame[],
  teamA: string,
  teamB: string,
): boolean {
  const wA = countSeriesWins(games, teamA)
  const wB = countSeriesWins(games, teamB)
  const max = Math.max(wA, wB)
  const min = Math.min(wA, wB)
  const total = wA + wB

  // Bo5 decided (3-0, 3-1, 3-2)
  if (max === 3) return true
  // Bo3 decided at 2-1 only — 2-0 after 2 games may be Bo5 still in progress
  if (max === 2 && min === 1 && total === 3) return true
  return false
}

/** Valid tier-1 series scores (Bo3 or Bo5). */
export function isValidSeriesScore(wA: number, wB: number): boolean {
  const max = Math.max(wA, wB)
  const min = Math.min(wA, wB)
  if (max >= 3) return max === 3 && min <= 2
  if (max === 2) return min <= 1
  return false
}

export function shouldBreakSeries(
  bucketGames: ChronologicalGame[],
  newGame: ChronologicalGame,
  teamA: string,
  teamB: string,
): boolean {
  if (!bucketGames.length) return false
  const last = bucketGames[bucketGames.length - 1]!
  if (daysBetween(last.date, newGame.date) > SERIES_GAP_DAYS) return true
  return isSeriesComplete(bucketGames, teamA, teamB)
}

/**
 * Split chronologically sorted individual games into separate Bo3/Bo5 series.
 * Same team pair within SERIES_GAP_DAYS forms one series until first-to-2 (Bo3) or first-to-3 (Bo5).
 */
export function groupGamesIntoSeries<T extends ChronologicalGame>(
  games: T[],
): SeriesBucket<T>[] {
  if (!games.length) return []

  const sorted = [...games].sort(compareSeriesGames)
  const buckets: SeriesBucket<T>[] = []
  let current: T[] = []
  let teamA = ''
  let teamB = ''
  let pairKey = ''

  for (const g of sorted) {
    const [a, b] = canonicalSeriesTeams(g.winner, g.loser)
    const key = seriesKey(a, b)

    if (!current.length) {
      current = [g]
      teamA = a
      teamB = b
      pairKey = key
      continue
    }

    if (key !== pairKey || shouldBreakSeries(current, g, teamA, teamB)) {
      buckets.push({ teamA, teamB, games: current })
      current = [g]
      teamA = a
      teamB = b
      pairKey = key
    } else {
      current.push(g)
    }
  }

  if (current.length) buckets.push({ teamA, teamB, games: current })
  return buckets
}
