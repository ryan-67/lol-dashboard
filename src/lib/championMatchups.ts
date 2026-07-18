import type { Player } from '../hooks/useDashboardData'
import { normalizePosition, type RoleKey } from './playerRadar'

export interface LaneMatchupRow {
  opponent: string
  games: number
  wins: number
  winrate: number
}

export interface ChampionLaneMatchupResult {
  favorable: LaneMatchupRow[]
  hard: LaneMatchupRow[]
  /** Games played per role on this champion (role distribution). */
  roleCounts: Partial<Record<RoleKey, number>>
  totalLaneGames: number
}

interface GameSlot {
  team: string
  champion: string
  result: number
}

const MIN_GAMES = 2
const MAX_ROWS = 8

/**
 * Reconstruct lane-vs-lane champion matchups from player game logs:
 * two players in the same game and role on different teams faced each
 * other in lane, so their champions form a direct matchup.
 */
export function buildChampionLaneMatchups(
  players: Player[],
  championName: string,
): ChampionLaneMatchupResult {
  const slots = new Map<string, GameSlot[]>()
  const roleCounts: Partial<Record<RoleKey, number>> = {}

  for (const player of players) {
    const role = normalizePosition(player.position)
    if (!role) continue
    for (const game of player.gameLog ?? []) {
      if (!game.gameId) continue
      if (game.champion === championName) {
        roleCounts[role] = (roleCounts[role] ?? 0) + 1
      }
      const key = `${game.gameId}|${role}`
      const list = slots.get(key)
      const slot: GameSlot = { team: player.team, champion: game.champion, result: game.result }
      if (list) list.push(slot)
      else slots.set(key, [slot])
    }
  }

  const byOpponent = new Map<string, { games: number; wins: number }>()
  let totalLaneGames = 0

  for (const list of slots.values()) {
    if (list.length !== 2) continue
    const [x, y] = list as [GameSlot, GameSlot]
    if (x.team === y.team) continue
    let mine: GameSlot | null = null
    let theirs: GameSlot | null = null
    if (x.champion === championName && y.champion !== championName) {
      mine = x
      theirs = y
    } else if (y.champion === championName && x.champion !== championName) {
      mine = y
      theirs = x
    }
    if (!mine || !theirs) continue
    totalLaneGames++
    const agg = byOpponent.get(theirs.champion) ?? { games: 0, wins: 0 }
    agg.games++
    if (mine.result === 1) agg.wins++
    byOpponent.set(theirs.champion, agg)
  }

  const rows: LaneMatchupRow[] = [...byOpponent.entries()]
    .filter(([, agg]) => agg.games >= MIN_GAMES)
    .map(([opponent, agg]) => ({
      opponent,
      games: agg.games,
      wins: agg.wins,
      winrate: (agg.wins / agg.games) * 100,
    }))

  const favorable = rows
    .filter((r) => r.winrate >= 50)
    .sort((a, b) => b.winrate - a.winrate || b.games - a.games)
    .slice(0, MAX_ROWS)

  const hard = rows
    .filter((r) => r.winrate < 50)
    .sort((a, b) => a.winrate - b.winrate || b.games - a.games)
    .slice(0, MAX_ROWS)

  return { favorable, hard, roleCounts, totalLaneGames }
}
