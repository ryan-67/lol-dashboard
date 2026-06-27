import type { Champion, GoldTimelinePoint, Player, Team, TeamChampion } from '../../hooks/useDashboardData'
import type { RoleKey } from '../championAnalytics'
import { ROLES, normalizePosition, computeGameScore, playersForRole } from '../playerRadar'
import type { CitoGameGoldRecord, CitoObjectiveEvent } from '../citoGoldMatch'
import { goldTimelineForTeamPerspective, matchCitoGoldToOeGame, ensureGoldTimelineAtZero } from '../citoGoldMatch'
import { teamMatchesCanonical } from './slugs'
import { resolveTournamentDisplay } from '../tournamentCatalog'

export interface ChampionWinrateEntry {
  champion: string
  games: number
  wins: number
  winrate: number
  kda: number
}

function championStatsFromLog(player: Player): ChampionWinrateEntry[] {
  const map = new Map<string, { games: number; wins: number; kdaSum: number }>()

  for (const g of player.gameLog ?? []) {
    if (!g.champion) continue
    const cur = map.get(g.champion) ?? { games: 0, wins: 0, kdaSum: 0 }
    cur.games += 1
    if (g.result === 1) cur.wins += 1
    cur.kdaSum += g.kda ?? 0
    map.set(g.champion, cur)
  }

  if (map.size === 0) {
    for (const c of player.championPool ?? []) {
      map.set(c.champion, { games: c.games, wins: c.wins, kdaSum: 0 })
    }
  }

  return [...map.entries()].map(([champion, s]) => ({
    champion,
    games: s.games,
    wins: s.wins,
    winrate: s.games ? (s.wins / s.games) * 100 : 0,
    kda: s.games && s.kdaSum ? s.kdaSum / s.games : 0,
  }))
}

export function bestWorstChampions(
  player: Player,
  minGames = 1,
): { best: ChampionWinrateEntry[]; worst: ChampionWinrateEntry[] } {
  const eligible = championStatsFromLog(player).filter((c) => c.games >= minGames)
  const best = [...eligible]
    .sort((a, b) => b.winrate - a.winrate || b.kda - a.kda)
    .slice(0, 5)
  const worst = [...eligible]
    .filter((c) => c.winrate < 50)
    .sort((a, b) => a.winrate - b.winrate || a.kda - b.kda)
    .slice(0, 5)
  return { best, worst }
}

function normalizeSide(raw?: string): 'blue' | 'red' | null {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('blue')) return 'blue'
  if (s.includes('red')) return 'red'
  return null
}

export function formatTournamentLabel(
  league?: string,
  split?: string,
  fallbackLeague?: string,
  fallbackSplit?: string,
  playoffs?: boolean,
  rawSplit?: string,
  oeYear?: string,
): string {
  const lg = league || fallbackLeague
  const sp = split || fallbackSplit
  if (lg && sp) {
    return resolveTournamentDisplay(lg, sp, playoffs, { rawSplit, oeYear })
  }
  if (lg) return lg
  if (sp) return sp
  return '—'
}

export interface TeamMatchRow {
  date: string
  opponent: string
  result: 'W' | 'L'
  tournament: string
}

export function buildTeamMatchHistory(
  players: Player[],
  teamSlugOrName: string,
  limit?: number,
  fallbackLeague?: string,
  fallbackSplit?: string,
): TeamMatchRow[] {
  const roster = players.filter((p) => teamMatchesCanonical(p.team, teamSlugOrName))
  if (!roster.length) return []

  // One player row per game — use the roster member with the most games as anchor.
  const anchor = roster.reduce((best, p) => ((p.games ?? 0) > (best.games ?? 0) ? p : best), roster[0]!)

  const sorted = [...(anchor.gameLog ?? [])]
    .map((game) => ({
      date: game.date,
      opponent: game.opponent ?? 'Unknown',
      result: (game.result === 1 ? 'W' : 'L') as 'W' | 'L',
      tournament: formatTournamentLabel(
        game.league,
        game.split,
        fallbackLeague,
        fallbackSplit,
        game.playoffs,
        game.rawSplit,
        game.oeYear,
      ),
      gameId: game.gameId ?? '',
    }))
    .sort((a, b) => {
      const byDate = b.date.localeCompare(a.date)
      if (byDate !== 0) return byDate
      return b.gameId.localeCompare(a.gameId)
    })
  return limit === undefined ? sorted.map(({ gameId: _g, ...row }) => row) : sorted.slice(0, limit).map(({ gameId: _g, ...row }) => row)
}

export interface SideWinrates {
  blue: { wins: number; games: number; winrate: number }
  red: { wins: number; games: number; winrate: number }
}

export function computeSideWinrates(
  players: Player[],
  teamSlugOrName: string,
): SideWinrates {
  const acc = {
    blue: { wins: 0, games: 0 },
    red: { wins: 0, games: 0 },
  }
  const seen = new Set<string>()

  const roster = players.filter((p) => teamMatchesCanonical(p.team, teamSlugOrName))
  if (!roster.length) {
    return {
      blue: { wins: 0, games: 0, winrate: 0 },
      red: { wins: 0, games: 0, winrate: 0 },
    }
  }

  const anchor = roster.reduce((best, p) =>
    (p.gameLog?.length ?? 0) > (best.gameLog?.length ?? 0) ? p : best,
  )

  for (const game of anchor.gameLog ?? []) {
    const side = normalizeSide(game.side)
    if (!side) continue
    const key = game.gameId ?? `${game.date}|${game.opponent ?? ''}|${side}`
    if (seen.has(key)) continue
    seen.add(key)
    acc[side].games += 1
    if (game.result === 1) acc[side].wins += 1
  }

  return {
    blue: {
      ...acc.blue,
      winrate: acc.blue.games ? (acc.blue.wins / acc.blue.games) * 100 : 0,
    },
    red: {
      ...acc.red,
      winrate: acc.red.games ? (acc.red.wins / acc.red.games) * 100 : 0,
    },
  }
}

export interface TeamTrendPoint {
  game: number
  date: string
  winrate: number
  gd15: number
}

export function buildTeamTrend(
  players: Player[],
  teamSlugOrName: string,
  limit = 20,
  fallbackLeague?: string,
  fallbackSplit?: string,
): TeamTrendPoint[] {
  const games = buildTeamMatchHistory(
    players,
    teamSlugOrName,
    limit,
    fallbackLeague,
    fallbackSplit,
  ).reverse()
  let wins = 0
  return games.map((g, i) => {
    if (g.result === 'W') wins += 1
    const teamPlayers = players.filter((p) => teamMatchesCanonical(p.team, teamSlugOrName))
    let gdSum = 0
    let gdCount = 0
    for (const p of teamPlayers) {
      const hit = (p.gameLog ?? []).find(
        (gl) => gl.date === g.date && (gl.opponent ?? '') === g.opponent,
      )
      if (hit) {
        gdSum += hit.gd15 ?? 0
        gdCount += 1
      }
    }
    return {
      game: i + 1,
      date: g.date,
      winrate: (wins / (i + 1)) * 100,
      gd15: gdCount ? gdSum / gdCount : 0,
    }
  })
}

function teamTotalGames(teams: Team[], teamName: string): number {
  const team = teams.find((t) => t.name === teamName)
  if (!team) return 1
  return Math.max(team.wins + team.losses, 1)
}

function computePriorityScore(row: TeamChampion, teamGames: number) {
  const pickRate = (row.picks / teamGames) * 100
  const avgPickOrder = row.avgPickOrder ?? null
  const orderScore = avgPickOrder != null ? ((6 - avgPickOrder) / 5) * 100 : 50
  const priorityScore = pickRate * 0.65 + orderScore * 0.35
  return { picks: row.picks, pickRate, avgPickOrder, priorityScore, winrate: row.winrate }
}

export type PriorityChampionEntry = {
  champion: string
  role: RoleKey | null
  picks: number
  pickRate: number
  avgPickOrder: number | null
  priorityScore: number
  winrate: number
}

export function primaryRoleForChampionOnTeam(
  players: Player[],
  teamName: string,
  champion: string,
): RoleKey | null {
  const counts = new Map<RoleKey, number>()
  for (const p of players) {
    if (!teamMatchesCanonical(p.team, teamName)) continue
    const role = normalizePosition(p.position)
    if (!role) continue
    const games = (p.gameLog ?? []).filter((g) => g.champion === champion).length
    if (games <= 0) continue
    counts.set(role, (counts.get(role) ?? 0) + games)
  }
  let best: RoleKey | null = null
  let max = 0
  for (const [role, n] of counts) {
    if (n > max) {
      max = n
      best = role
    }
  }
  return best
}

export function rolesForChampionFromPlayers(
  players: Player[],
  championName: string,
): RoleKey[] {
  const counts = new Map<RoleKey, number>()
  for (const p of players) {
    const role = normalizePosition(p.position)
    if (!role) continue
    const games = (p.gameLog ?? []).filter((g) => g.champion === championName).length
    if (games <= 0) continue
    counts.set(role, (counts.get(role) ?? 0) + games)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([role]) => role)
}

export function priorityChampsByRole(
  teamChampions: TeamChampion[],
  teams: Team[],
  teamName: string,
  players: Player[],
): Record<RoleKey, PriorityChampionEntry[]> {
  const teamGames = teamTotalGames(teams, teamName)
  const entries = teamChampions
    .filter((row) => row.team === teamName && row.picks >= 1)
    .map((row) => ({
      champion: row.champion,
      role: primaryRoleForChampionOnTeam(players, teamName, row.champion),
      ...computePriorityScore(row, teamGames),
    }))
    .filter((e): e is PriorityChampionEntry & { role: RoleKey } => Boolean(e.role))
    .sort((a, b) => b.priorityScore - a.priorityScore)

  const byRole: Record<RoleKey, PriorityChampionEntry[]> = {
    top: [],
    jungle: [],
    mid: [],
    adc: [],
    support: [],
  }
  for (const entry of entries) {
    const role = entry.role!
    if (byRole[role].length < 5) byRole[role].push(entry)
  }
  return byRole
}

export function computeChampionPriorityScore(
  championName: string,
  teamChampions: TeamChampion[],
  teams: Team[],
): number | null {
  const rows = teamChampions.filter((row) => row.champion === championName)
  if (!rows.length) return null
  let totalPicks = 0
  let weighted = 0
  for (const row of rows) {
    const teamGames = teamTotalGames(teams, row.team)
    const { priorityScore } = computePriorityScore(row, teamGames)
    weighted += priorityScore * row.picks
    totalPicks += row.picks
  }
  return totalPicks ? weighted / totalPicks : null
}

export function topPlayersOnChampion(
  players: Player[],
  championName: string,
  limit = 8,
): Array<{ player: Player; games: number; winrate: number; perfScore: number }> {
  return players
    .map((player) => {
      const gamesOnChamp = (player.gameLog ?? []).filter((g) => g.champion === championName)
      if (gamesOnChamp.length < 2) return null

      const role = normalizePosition(player.position)
      if (!role) return null

      const cohort = playersForRole(players, role)
      const wins = gamesOnChamp.filter((g) => g.result === 1).length
      const winrate = (wins / gamesOnChamp.length) * 100
      const perfScore =
        gamesOnChamp.reduce((sum, g) => sum + computeGameScore(g, role, cohort), 0) /
        gamesOnChamp.length
      const proficiency = perfScore * 0.65 + (winrate / 100) * 0.35

      return {
        player,
        games: gamesOnChamp.length,
        winrate,
        perfScore,
        proficiency,
      }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort(
      (a, b) =>
        b.proficiency - a.proficiency ||
        b.perfScore - a.perfScore ||
        b.winrate - a.winrate ||
        b.games - a.games,
    )
    .slice(0, limit)
    .map(({ proficiency: _p, ...rest }) => rest)
}

export function championWeeklyTrend(champion: Champion) {
  return (champion.weeklyStats ?? [])
    .slice()
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({
      week: w.weekStart,
      presence: w.presence,
      winrate: w.winrate ?? 0,
      picks: w.picks,
      bans: w.bans,
    }))
}

export function playerChampionIcons(player: Player, limit = 12): string[] {
  const fromPool = (player.championPool ?? [])
    .slice()
    .sort((a, b) => b.games - a.games)
    .map((c) => c.champion)
  if (fromPool.length) return fromPool.slice(0, limit)
  const counts = new Map<string, number>()
  for (const g of player.gameLog ?? []) {
    if (!g.champion) continue
    counts.set(g.champion, (counts.get(g.champion) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([champ]) => champ)
    .slice(0, limit)
}

export interface BestChampionByRoleEntry {
  champion: string
  role: RoleKey
  games: number
  winrate: number
  kda: number
  perfScore: number
  score: number
}

export function bestChampionsByRole(
  players: Player[],
  teamSlugOrName: string,
  limit = 3,
): Record<RoleKey, BestChampionByRoleEntry[]> {
  const roster = players.filter((p) => teamMatchesCanonical(p.team, teamSlugOrName))
  const byRole: Record<RoleKey, BestChampionByRoleEntry[]> = {
    top: [],
    jungle: [],
    mid: [],
    adc: [],
    support: [],
  }

  for (const role of ROLES) {
    const rolePlayers = roster.filter((p) => normalizePosition(p.position) === role)
    const cohort = playersForRole(players, role)
    const champAcc = new Map<
      string,
      { games: number; wins: number; kdaSum: number; perfSum: number }
    >()

    for (const player of rolePlayers) {
      for (const game of player.gameLog ?? []) {
        if (!game.champion) continue
        const cur = champAcc.get(game.champion) ?? { games: 0, wins: 0, kdaSum: 0, perfSum: 0 }
        cur.games += 1
        if (game.result === 1) cur.wins += 1
        cur.kdaSum += game.kda ?? 0
        cur.perfSum += computeGameScore(game, role, cohort)
        champAcc.set(game.champion, cur)
      }
    }

    byRole[role] = [...champAcc.entries()]
      .filter(([, s]) => s.games >= 2)
      .map(([champion, s]) => {
        const winrate = (s.wins / s.games) * 100
        const kda = s.kdaSum / s.games
        const perfScore = s.perfSum / s.games
        const score = perfScore * 0.45 + (winrate / 100) * 0.35 + Math.min(kda / 5, 1) * 0.2
        return { champion, role, games: s.games, winrate, kda, perfScore, score }
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.perfScore - a.perfScore ||
          b.winrate - a.winrate ||
          b.games - a.games,
      )
      .slice(0, limit)
  }

  return byRole
}

const DEFAULT_GOLD_MINUTES = [0, 10, 15, 20, 25, 30] as const

export function synthesizeGoldTimeline(gd15: number, maxMinute = 30): GoldTimelinePoint[] {
  return DEFAULT_GOLD_MINUTES.filter((m) => m <= maxMinute).map((minute) => {
    if (minute <= 15) {
      return { minute, goldDiff: (gd15 * minute) / 15 }
    }
    const postSlope = gd15 * 0.25
    return { minute, goldDiff: gd15 + (postSlope * (minute - 15)) / 15 }
  })
}

export function resolveGameGoldTimeline(
  game: NonNullable<Player['gameLog']>[number],
  maxMinute = 30,
): GoldTimelinePoint[] {
  if (game.goldTimeline?.length) {
    return game.goldTimeline.filter((p) => p.minute <= maxMinute)
  }
  return synthesizeGoldTimeline(game.gd15 ?? 0, maxMinute)
}

export interface TeamGoldGameSeries {
  id: string
  label: string
  opponent: string
  date: string
  result: 'W' | 'L'
  points: GoldTimelinePoint[]
  /** Cito postgame timeline vs OE gd@15 proxy */
  dataSource?: 'cito' | 'oe_proxy'
}

export function buildTeamGoldGraph(
  players: Player[],
  teamSlugOrName: string,
  maxMinute = 30,
  citoGoldRows: CitoGameGoldRecord[] = [],
): TeamGoldGameSeries[] {
  const roster = players.filter((p) => teamMatchesCanonical(p.team, teamSlugOrName))
  if (!roster.length) return []

  const anchor = roster.reduce((best, p) => ((p.games ?? 0) > (best.games ?? 0) ? p : best), roster[0]!)
  const anchorLog = [...(anchor.gameLog ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const seen = new Set<string>()
  const series: TeamGoldGameSeries[] = []

  for (const game of anchorLog) {
    const id = game.gameId ?? `${game.date}|${game.opponent ?? ''}|${game.result}`
    if (seen.has(id)) continue
    seen.add(id)

    const opponent = game.opponent ?? 'Unknown'
    const result = game.result === 1 ? 'W' : 'L'

    const citoMatch = citoGoldRows.length
      ? matchCitoGoldToOeGame(game, anchorLog, teamSlugOrName, opponent, citoGoldRows)
      : null

    let points: GoldTimelinePoint[]
    let dataSource: TeamGoldGameSeries['dataSource'] = 'oe_proxy'

    if (citoMatch && citoMatch.goldTimelineBlue.length >= 4) {
      points = ensureGoldTimelineAtZero(
        goldTimelineForTeamPerspective(citoMatch, teamSlugOrName).filter(
          (p) => p.minute <= maxMinute,
        ),
      )
      dataSource = 'cito'
    } else {
      continue
    }

    series.push({
      id,
      label: `${opponent} · ${game.date}`,
      opponent,
      date: game.date,
      result,
      points,
      dataSource,
    })
  }

  return series.sort((a, b) => b.date.localeCompare(a.date))
}

export interface TeamObjectiveGameSeries {
  id: string
  label: string
  opponent: string
  date: string
  result: 'W' | 'L'
  events: CitoObjectiveEvent[]
}

function teamSideForCitoRow(row: CitoGameGoldRecord, teamSlugOrName: string): 'blue' | 'red' | null {
  const onBlue =
    teamMatchesCanonical(row.blueTeam ?? '', teamSlugOrName) ||
    teamMatchesCanonical(row.blueSlug ?? '', teamSlugOrName)
  const onRed =
    teamMatchesCanonical(row.redTeam ?? '', teamSlugOrName) ||
    teamMatchesCanonical(row.redSlug ?? '', teamSlugOrName)
  if (onBlue && !onRed) return 'blue'
  if (onRed && !onBlue) return 'red'
  return onBlue ? 'blue' : onRed ? 'red' : null
}

export function buildTeamObjectivesGraph(
  players: Player[],
  teamSlugOrName: string,
  citoRows: CitoGameGoldRecord[] = [],
): TeamObjectiveGameSeries[] {
  const roster = players.filter((p) => teamMatchesCanonical(p.team, teamSlugOrName))
  if (!roster.length || !citoRows.length) return []

  const anchor = roster.reduce((best, p) => ((p.games ?? 0) > (best.games ?? 0) ? p : best), roster[0]!)
  const anchorLog = [...(anchor.gameLog ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const seen = new Set<string>()
  const series: TeamObjectiveGameSeries[] = []

  for (const game of anchorLog) {
    const id = game.gameId ?? `${game.date}|${game.opponent ?? ''}|${game.result}`
    if (seen.has(id)) continue
    seen.add(id)

    const opponent = game.opponent ?? 'Unknown'
    const citoMatch = matchCitoGoldToOeGame(game, anchorLog, teamSlugOrName, opponent, citoRows)
    if (!citoMatch?.objectivesTimeline?.length) continue

    series.push({
      id,
      label: `${opponent} · ${game.date}`,
      opponent,
      date: game.date,
      result: game.result === 1 ? 'W' : 'L',
      events: citoMatch.objectivesTimeline,
    })
  }

  return series.sort((a, b) => b.date.localeCompare(a.date))
}

export function objectiveDiffTimeline(
  events: CitoObjectiveEvent[],
  teamSide: 'blue' | 'red',
  maxMinute = 40,
): GoldTimelinePoint[] {
  let diff = 0
  const points: GoldTimelinePoint[] = [{ minute: 0, goldDiff: 0 }]
  for (const e of events) {
    if (e.minute > maxMinute) break
    const side = e.side.toLowerCase()
    if (side === teamSide) diff += 1
    else if (side === 'blue' || side === 'red') diff -= 1
    points.push({ minute: e.minute, goldDiff: diff })
  }
  return points
}

export function teamSideForObjectiveRow(
  row: CitoGameGoldRecord,
  teamSlugOrName: string,
): 'blue' | 'red' | null {
  return teamSideForCitoRow(row, teamSlugOrName)
}

export function averageGoldTimeline(
  games: TeamGoldGameSeries[],
  maxMinute = 30,
): GoldTimelinePoint[] {
  if (!games.length) return []

  const hasFineGrain = games.some((g) => g.dataSource === 'cito' || g.points.length > 8)
  const minutes = hasFineGrain
    ? Array.from({ length: maxMinute + 1 }, (_, i) => i)
    : DEFAULT_GOLD_MINUTES.filter((m) => m <= maxMinute)

  return minutes.map((minute) => {
    let sum = 0
    let count = 0
    for (const game of games) {
      const point = interpolateGoldAtMinute(game.points, minute)
      if (point != null) {
        sum += point
        count += 1
      }
    }
    return { minute, goldDiff: count ? sum / count : 0 }
  })
}

function interpolateGoldAtMinute(points: GoldTimelinePoint[], minute: number): number | null {
  const exact = points.find((p) => p.minute === minute)
  if (exact) return exact.goldDiff

  const sorted = [...points].sort((a, b) => a.minute - b.minute)
  if (!sorted.length) return null

  const first = sorted[0]!
  if (minute < first.minute) return 0

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]!
    if (minute >= a.minute && minute <= b.minute) {
      const t = (minute - a.minute) / Math.max(b.minute - a.minute, 1)
      return a.goldDiff + t * (b.goldDiff - a.goldDiff)
    }
  }

  return sorted[sorted.length - 1]!.goldDiff
}

export interface ChampionComboEntry {
  partner: string
  games: number
  wins: number
  winrate: number
}

function gameLogKey(player: Player, game: NonNullable<Player['gameLog']>[number]): string {
  return game.gameId ?? `${game.date}|${player.team}|${game.opponent ?? ''}|${game.result}`
}

export function bestChampionCombos(
  players: Player[],
  championName: string,
  minGames = 3,
  limit = 5,
): ChampionComboEntry[] {
  const teamChampsByGame = new Map<string, Map<string, string[]>>()

  for (const player of players) {
    for (const game of player.gameLog ?? []) {
      if (!game.champion) continue
      const key = gameLogKey(player, game)
      let teams = teamChampsByGame.get(key)
      if (!teams) {
        teams = new Map()
        teamChampsByGame.set(key, teams)
      }
      const list = teams.get(player.team) ?? []
      list.push(game.champion)
      teams.set(player.team, list)
    }
  }

  const acc = new Map<string, { games: number; wins: number }>()

  for (const player of players) {
    for (const game of player.gameLog ?? []) {
      if (game.champion !== championName) continue
      const key = gameLogKey(player, game)
      const teams = teamChampsByGame.get(key)
      const allies = teams?.get(player.team) ?? []
      const won = game.result === 1
      for (const ally of allies) {
        if (!ally || ally === championName) continue
        const cur = acc.get(ally) ?? { games: 0, wins: 0 }
        cur.games += 1
        if (won) cur.wins += 1
        acc.set(ally, cur)
      }
    }
  }

  return [...acc.entries()]
    .map(([partner, stats]) => ({
      partner,
      games: stats.games,
      wins: stats.wins,
      winrate: stats.games ? (stats.wins / stats.games) * 100 : 0,
    }))
    .filter((row) => row.games >= minGames && row.winrate > 50)
    .sort((a, b) => b.winrate - a.winrate || b.games - a.games)
    .slice(0, limit)
}
