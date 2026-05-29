import type { Player, PlayerChampionPoolEntry, PlayerGameLog } from '../hooks/useDashboardData'
import {
  computeGameScore,
  normalizePosition,
  playersForRole,
  type RoleKey,
} from './playerRadar'

export const PLAYER_CHART_COLORS = [
  '#c5a059',
  '#5c8a8a',
  '#9e8c7a',
  '#5c7a9e',
  '#8c6a9e',
  '#6a7a8c',
]

export function playerKey(player: Player): string {
  return `${player.name}|${player.team}|${player.league}`
}

export function findDefaultPlayerKey(players: Player[]): string | null {
  const canyon = players.find(
    (p) =>
      p.name.toLowerCase() === 'canyon' ||
      (p.name.toLowerCase().includes('canyon') &&
        (p.team.toLowerCase().includes('gen') || p.league.toLowerCase().includes('lck'))),
  )
  if (canyon) return playerKey(canyon)
  return players[0] ? playerKey(players[0]) : null
}

export function getPlayerRole(player: Player): RoleKey {
  return normalizePosition(player.position) ?? 'mid'
}

function sortedGameLog(player: Player, limit = 20): PlayerGameLog[] {
  const log = [...(player.gameLog ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  return limit > 0 ? log.slice(-limit) : log
}

function rollingAverage(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1)
    const slice = values.slice(start, index + 1)
    return slice.reduce((sum, v) => sum + v, 0) / slice.length
  })
}

function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  if (points.length < 2) {
    const y = points[0]?.y ?? 0
    return { slope: 0, intercept: y }
  }
  const n = points.length
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n }
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

export interface FormTrajectoryPoint {
  game: number
  date: string
  rawScore: number
  rollingScore: number
  trendScore: number
  result: number
  opponent: string
  champion: string
  playerKey: string
  playerName: string
}

export interface FormTrajectorySeries {
  playerKey: string
  playerName: string
  color: string
  points: FormTrajectoryPoint[]
}

export function buildFormTrajectorySeries(
  players: Player[],
  cohortPlayers: Player[],
  limit = 20,
): FormTrajectorySeries[] {
  return players.map((player, index) => {
    const role = getPlayerRole(player)
    const cohort = playersForRole(cohortPlayers, role)
    const games = sortedGameLog(player, limit)
    const rawScores = games.map((g) => round(computeGameScore(g, role, cohort), 3))
    const rolling = rollingAverage(rawScores, 3)
    const regPoints = games.map((_, i) => ({ x: i + 1, y: rawScores[i] ?? 0 }))
    const { slope, intercept } = linearRegression(regPoints)
    const key = playerKey(player)

    return {
      playerKey: key,
      playerName: player.name,
      color: PLAYER_CHART_COLORS[index % PLAYER_CHART_COLORS.length],
      points: games.map((game, i) => ({
        game: i + 1,
        date: game.date,
        rawScore: rawScores[i] ?? 0,
        rollingScore: round(rolling[i] ?? 0, 3),
        trendScore: round(slope * (i + 1) + intercept, 3),
        result: game.result,
        opponent: game.opponent ?? '',
        champion: game.champion,
        playerKey: key,
        playerName: player.name,
      })),
    }
  })
}

export interface ChampionPoolBar {
  champion: string
  playerKey: string
  playerName: string
  games: number
  wins: number
  losses: number
  winrate: number
  color: string
}

export function buildChampionPoolBars(players: Player[], topN = 5): ChampionPoolBar[] {
  const rows: ChampionPoolBar[] = []
  players.forEach((player, playerIndex) => {
    const pool = [...(player.championPool ?? [])]
      .sort((a, b) => b.games - a.games)
      .slice(0, topN)
    const color = PLAYER_CHART_COLORS[playerIndex % PLAYER_CHART_COLORS.length]
    const key = playerKey(player)
    for (const entry of pool) {
      rows.push({
        champion: entry.champion,
        playerKey: key,
        playerName: player.name,
        games: entry.games,
        wins: entry.wins,
        losses: entry.losses,
        winrate: entry.winrate,
        color,
      })
    }
  })
  return rows
}

export interface ConsistencyPoint {
  game: number
  score: number
  jitter: number
  result: number
  playerKey: string
  playerName: string
  color: string
}

export interface ConsistencyStats {
  mean: number
  stdDev: number
  plusOne: number
  minusOne: number
  points: ConsistencyPoint[]
}

export function buildConsistencyData(
  players: Player[],
  cohortPlayers: Player[],
  limit = 20,
): ConsistencyStats {
  const allPoints: ConsistencyPoint[] = []

  players.forEach((player, playerIndex) => {
    const role = getPlayerRole(player)
    const cohort = playersForRole(cohortPlayers, role)
    const games = sortedGameLog(player, limit)
    const color = PLAYER_CHART_COLORS[playerIndex % PLAYER_CHART_COLORS.length]
    const key = playerKey(player)

    games.forEach((game, index) => {
      const score = round(computeGameScore(game, role, cohort), 3)
      const jitter = ((playerIndex + 1) % 3) * 0.12 - 0.12
      allPoints.push({
        game: index + 1,
        score,
        jitter,
        result: game.result,
        playerKey: key,
        playerName: player.name,
        color,
      })
    })
  })

  if (!allPoints.length) {
    return { mean: 0, stdDev: 0, plusOne: 0, minusOne: 0, points: [] }
  }

  const scores = allPoints.map((p) => p.score)
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const variance = scores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / scores.length
  const stdDev = Math.sqrt(variance)

  return {
    mean: round(mean, 3),
    stdDev: round(stdDev, 3),
    plusOne: round(mean + stdDev, 3),
    minusOne: round(mean - stdDev, 3),
    points: allPoints,
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function mergeChampionPoolEntries(entries: PlayerChampionPoolEntry[]): PlayerChampionPoolEntry[] {
  const acc = new Map<string, { picks: number; wins: number }>()
  for (const row of entries) {
    const existing = acc.get(row.champion) ?? { picks: 0, wins: 0 }
    existing.picks += row.games
    existing.wins += row.wins
    acc.set(row.champion, existing)
  }
  return [...acc.entries()]
    .map(([champion, stats]) => ({
      champion,
      games: stats.picks,
      wins: stats.wins,
      losses: stats.picks - stats.wins,
      winrate: stats.picks ? round((stats.wins / stats.picks) * 100, 1) : 0,
    }))
    .sort((a, b) => b.games - a.games)
}
