import type { Champion, GoldTimelinePoint, Player, Team, TeamChampion } from '../../hooks/useDashboardData'
import type { RoleKey } from '../championAnalytics'
import { ROLES, normalizePosition, computeGameScore, playersForRole } from '../playerRadar'
import { teamMatchesCanonical } from './slugs'

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
): string {
  const lg = league || fallbackLeague
  const sp = split || fallbackSplit
  if (lg && sp) return `${lg} ${sp}`
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
      tournament: formatTournamentLabel(game.league, game.split, fallbackLeague, fallbackSplit),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
  return limit === undefined ? sorted : sorted.slice(0, limit)
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

  for (const player of players) {
    if (!teamMatchesCanonical(player.team, teamSlugOrName)) continue
    for (const game of player.gameLog ?? []) {
      const side = normalizeSide(game.side)
      if (!side) continue
      const key = `${game.date}|${game.opponent}|${side}`
      if (seen.has(key)) continue
      seen.add(key)
      acc[side].games += 1
      if (game.result === 1) acc[side].wins += 1
    }
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
        gdSum += hit.gd15
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
}

export function buildTeamGoldGraph(
  players: Player[],
  teamSlugOrName: string,
  maxMinute = 30,
): TeamGoldGameSeries[] {
  const roster = players.filter((p) => teamMatchesCanonical(p.team, teamSlugOrName))
  if (!roster.length) return []

  const anchor = roster.reduce((best, p) => ((p.games ?? 0) > (best.games ?? 0) ? p : best), roster[0]!)
  const seen = new Set<string>()
  const series: TeamGoldGameSeries[] = []

  for (const game of anchor.gameLog ?? []) {
    const id = game.gameId ?? `${game.date}|${game.opponent ?? ''}|${game.result}`
    if (seen.has(id)) continue
    seen.add(id)

    const opponent = game.opponent ?? 'Unknown'
    const result = game.result === 1 ? 'W' : 'L'
    series.push({
      id,
      label: `${opponent} · ${game.date}`,
      opponent,
      date: game.date,
      result,
      points: resolveGameGoldTimeline(game, maxMinute),
    })
  }

  return series.sort((a, b) => b.date.localeCompare(a.date))
}

export function averageGoldTimeline(
  games: TeamGoldGameSeries[],
  maxMinute = 30,
): GoldTimelinePoint[] {
  if (!games.length) return []
  const minutes = DEFAULT_GOLD_MINUTES.filter((m) => m <= maxMinute)
  return minutes.map((minute) => {
    let sum = 0
    let count = 0
    for (const game of games) {
      const point = game.points.find((p) => p.minute === minute)
      if (point) {
        sum += point.goldDiff
        count += 1
      }
    }
    return { minute, goldDiff: count ? sum / count : 0 }
  })
}
