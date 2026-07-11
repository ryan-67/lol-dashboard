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
  /** Disambiguates multiple series between the same pair on the same day. */
  sessionIndex: number
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

/** True when game order respects first-to-2 (Bo3) / first-to-3 (Bo5) progression. */
export function isValidGameOrder(
  games: ChronologicalGame[],
  teamA: string,
  teamB: string,
): boolean {
  let wA = 0
  let wB = 0
  for (let i = 0; i < games.length; i++) {
    const g = games[i]!
    if (g.winner === teamA) wA++
    else if (g.winner === teamB) wB++
    else return false

    if (wA === 3 || wB === 3) {
      return i === games.length - 1
    }
  }

  return isValidSeriesScore(wA, wB)
}

function permuteGames<T>( games: T[], maxPerms = 5040): T[][] {
  if (games.length <= 1) return [games]
  if (games.length > 7) return [games]

  const out: T[][] = []
  const arr = [...games]

  const walk = (k: number) => {
    if (out.length >= maxPerms) return
    if (k === 1) {
      out.push([...arr])
      return
    }
    for (let i = 0; i < k; i++) {
      walk(k - 1)
      if (k % 2 === 0) {
        ;[arr[i], arr[k - 1]] = [arr[k - 1]!, arr[i]!]
      } else {
        ;[arr[0], arr[k - 1]] = [arr[k - 1]!, arr[0]!]
      }
    }
  }

  walk(arr.length)
  return out
}

function orderDistance(a: ChronologicalGame[], b: ChronologicalGame[]): number {
  const indexB = new Map(b.map((g, i) => [g.id, i]))
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    const j = indexB.get(a[i]!.id) ?? i
    dist += Math.abs(i - j)
  }
  return dist
}

/**
 * OE gameid suffixes are not always chronological within a series-day cluster.
 * Find a valid Bo3/Bo5 progression; prefer permutations closest to game-id sort.
 */
export function orderSeriesGames<T extends ChronologicalGame>(
  games: T[],
  teamA: string,
  teamB: string,
): T[] {
  if (games.length <= 1) return games

  const byId = [...games].sort(compareSeriesGames)
  if (isValidGameOrder(byId, teamA, teamB)) return byId

  const valid = permuteGames(byId).filter((order) => isValidGameOrder(order, teamA, teamB))
  if (!valid.length) return byId

  valid.sort((a, b) => orderDistance(a, byId) - orderDistance(b, byId))
  return valid[0]!
}

function clusterByDate<T extends ChronologicalGame>(games: T[]): T[][] {
  const sorted = [...games].sort(compareSeriesGames)
  const clusters: T[][] = []
  let current: T[] = []

  for (const g of sorted) {
    if (!current.length || current[current.length - 1]!.date === g.date) {
      current.push(g)
    } else {
      clusters.push(current)
      current = [g]
    }
  }

  if (current.length) clusters.push(current)
  return clusters
}

/** Valid tier-1 series scores (Bo3 or Bo5). */
export function isValidSeriesScore(wA: number, wB: number): boolean {
  const max = Math.max(wA, wB)
  const min = Math.min(wA, wB)
  if (max >= 3) return max === 3 && min <= 2
  if (max === 2) return min <= 1
  return false
}

/**
 * 2-0 / 2-1 can be a finished Bo3 OR an incomplete Bo5 when OE is mid-series.
 * Prefer Cito schedule confirmation before treating these as final (see citoSeriesVerify).
 */
export function isProvisionalSeriesScore(wA: number, wB: number): boolean {
  const max = Math.max(wA, wB)
  const min = Math.min(wA, wB)
  return max === 2 && min <= 1
}

/**
 * Scores allowed on tournament/series lists: terminal Bo3/Bo5, OR mid-Bo5 shapes
 * (including 2-2) when OE lags behind a live international series.
 */
export function isListableSeriesScore(
  wA: number,
  wB: number,
  opts?: { allowInProgress?: boolean },
): boolean {
  if (isValidSeriesScore(wA, wB)) return true
  if (!opts?.allowInProgress) return false
  const max = Math.max(wA, wB)
  const total = wA + wB
  return total >= 1 && max < 3 && total <= 5
}

/**
 * True when cumulative wins match a completed Bo3 or Bo5.
 * Pass `nextGame` for lookahead — a 2-1 after 3 games is still in progress if another
 * game between the same teams follows within SERIES_GAP_DAYS (Bo5 games 4–5).
 */
export function isSeriesComplete(
  games: ChronologicalGame[],
  teamA: string,
  teamB: string,
  nextGame?: ChronologicalGame,
): boolean {
  const wA = countSeriesWins(games, teamA)
  const wB = countSeriesWins(games, teamB)
  const max = Math.max(wA, wB)
  const min = Math.min(wA, wB)
  const total = wA + wB

  if (max === 3) return true

  if (max !== 2 || !isValidSeriesScore(wA, wB)) return false

  // 2-0 or 2-1 may still be an in-progress Bo5 when more games follow soon.
  const bo5InProgress =
    (total === 2 && min === 0) || (total === 3 && min === 1)

  if (!bo5InProgress) return true

  // Critical: when OE has not yet published the next game, do NOT close the series.
  // Closing early caused game 3 of a Bo5 to start a new 1-0 bucket instead of extending 2-0.
  if (!nextGame) return false

  if (daysBetween(games[games.length - 1]!.date, nextGame.date) > SERIES_GAP_DAYS) {
    return true
  }

  // Cross-day rematch: completed Bo3 (2-1 after 3 games) vs next-day Bo5 continuation.
  // Break when the series sat complete overnight (>=1 day gap) at a Bo3 terminal score.
  const lastDate = games[games.length - 1]!.date
  const dayGap = daysBetween(lastDate, nextGame.date)
  if (dayGap >= 1 && total === 3 && min === 1) {
    return true
  }

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
  return isSeriesComplete(bucketGames, teamA, teamB, newGame)
}

function splitPairGamesIntoSeries<T extends ChronologicalGame>(games: T[]): SeriesBucket<T>[] {
  if (!games.length) return []

  const sorted = [...games].sort(compareSeriesGames)
  const [teamA, teamB] = canonicalSeriesTeams(sorted[0]!.winner, sorted[0]!.loser)
  const orderedGames = clusterByDate(sorted).flatMap((cluster) =>
    orderSeriesGames(cluster, teamA, teamB),
  )

  const buckets: SeriesBucket<T>[] = []
  let current: T[] = []
  let sessionIndex = 0

  for (let i = 0; i < orderedGames.length; i++) {
    const g = orderedGames[i]!

    if (!current.length) {
      current = [g]
      continue
    }

    if (shouldBreakSeries(current, g, teamA, teamB)) {
      buckets.push({ teamA, teamB, games: current, sessionIndex })
      sessionIndex += 1
      current = [g]
    } else {
      current.push(g)
    }
  }

  if (current.length) {
    buckets.push({ teamA, teamB, games: current, sessionIndex })
  }

  return buckets
}

/**
 * Split chronologically sorted individual games into separate Bo3/Bo5 series.
 * Groups by team pair first so interleaved games from other matchups never break a series.
 */
export function groupGamesIntoSeries<T extends ChronologicalGame>(
  games: T[],
): SeriesBucket<T>[] {
  if (!games.length) return []

  const sorted = [...games].sort(compareSeriesGames)
  const byPair = new Map<string, T[]>()

  for (const g of sorted) {
    const [a, b] = canonicalSeriesTeams(g.winner, g.loser)
    const key = seriesKey(a, b)
    const list = byPair.get(key) ?? []
    list.push(g)
    byPair.set(key, list)
  }

  const buckets: SeriesBucket<T>[] = []
  for (const pairGames of byPair.values()) {
    buckets.push(...splitPairGamesIntoSeries(pairGames))
  }

  return buckets.sort((a, b) => {
    const aFirst = a.games[0]!
    const bFirst = b.games[0]!
    return compareSeriesGames(aFirst, bFirst)
  })
}
