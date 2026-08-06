import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import type { RoleKey } from './championAnalytics'
import { resolveTeamCanonicalName } from './entities/slugs'
import {
  computeGameScore,
  playersForRole,
} from './playerRadar'
import { unitIntervalTo100 } from './scoreNormalize'

export interface HottestTeamPlayer {
  team: string
  role: RoleKey
  weeklyGames: PlayerGameLog[]
}

export interface TeamWeekStats {
  team: string
  weeklyWins: number
  weeklyGames: number
  weeklyWinrate: number
  weeklyAvgKda: number
  weeklyAvgGd15: number
  weeklyObjControl: number
  avgOpponentSplitWinrate: number
  upsetWins: number
  /** Mean model game score across unique games (0–100). */
  impressiveness: number
}

interface GameAgg {
  result: number
  opponent: string
  date: string
  kdas: number[]
  gd15s: number[]
  objs: number[]
  /** Per-player model scores (0–1) for this game. */
  modelScores: number[]
}

const avg = (values: number[]): number => {
  if (!values.length) return 0
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

const gameDedupeKey = (game: PlayerGameLog, team: string): string => {
  if (game.gameId) return game.gameId
  // Prefer gameId; fall back without collapsing distinct Bo3 games on the same day.
  return [
    game.date,
    team,
    game.opponent ?? '',
    game.result,
    game.side ?? '',
    game.gameLength ?? '',
    game.kills ?? '',
  ].join('|')
}

const lookupElo = (
  teamElo: Map<string, number> | null | undefined,
  teamName: string,
): number | null => {
  if (!teamElo?.size) return null
  const canon = resolveTeamCanonicalName(teamName)
  const direct = teamElo.get(canon) ?? teamElo.get(teamName)
  if (direct != null) return direct
  const lower = canon.toLowerCase()
  for (const [name, rating] of teamElo) {
    if (name.toLowerCase() === lower) return rating
  }
  return null
}

const lookupSplitWr = (splitWinrate: Map<string, number>, teamName: string): number => {
  const canon = resolveTeamCanonicalName(teamName)
  return splitWinrate.get(canon) ?? splitWinrate.get(teamName) ?? 50
}

/**
 * Hottest team from the prediction model's per-game performance scores.
 *
 * - Unique games keyed by gameId (fixes Bo3 same-day collapse → false 50% WR)
 * - Team score = average of per-game roster model scores (0–100)
 * - Upset wins = wins vs opponents with higher Component-1 Elo
 */
export const calculateHottestTeams = (
  weeklyPlayers: HottestTeamPlayer[],
  opts: {
    allPlayers: Player[]
    splitWinrates: { name: string; winrate: number }[]
    teamElo?: Map<string, number> | null
  },
): TeamWeekStats[] => {
  const splitWinrate = new Map(
    opts.splitWinrates.map((t) => [resolveTeamCanonicalName(t.name), t.winrate]),
  )
  const teamElo = opts.teamElo ?? null
  const cohortByRole = new Map<RoleKey, Player[]>()

  const teamGames = new Map<string, Map<string, GameAgg>>()

  for (const wp of weeklyPlayers) {
    const team = resolveTeamCanonicalName(wp.team)
    const games = teamGames.get(team) ?? new Map<string, GameAgg>()
    let cohort = cohortByRole.get(wp.role)
    if (!cohort) {
      cohort = playersForRole(opts.allPlayers, wp.role)
      cohortByRole.set(wp.role, cohort)
    }

    for (const g of wp.weeklyGames) {
      const key = gameDedupeKey(g, team)
      const existing = games.get(key)
      const modelScore = computeGameScore(g, wp.role, cohort)
      if (existing) {
        existing.modelScores.push(modelScore)
        existing.kdas.push(g.kda)
        if (typeof g.gd15 === 'number') existing.gd15s.push(g.gd15)
        existing.objs.push(g.objControl ?? 0)
        continue
      }
      games.set(key, {
        result: g.result,
        opponent: g.opponent ?? '',
        date: g.date,
        kdas: [g.kda],
        gd15s: typeof g.gd15 === 'number' ? [g.gd15] : [],
        objs: [g.objControl ?? 0],
        modelScores: [modelScore],
      })
    }
    teamGames.set(team, games)
  }

  const rows: TeamWeekStats[] = []

  for (const [team, games] of teamGames) {
    if (!games.size) continue
    const list = [...games.values()]
    const wins = list.filter((g) => g.result === 1).length
    const ownElo = lookupElo(teamElo, team)
    let upsetWins = 0
    const oppWrs: number[] = []
    const gameModelScores: number[] = []

    for (const g of list) {
      const oppCanon = resolveTeamCanonicalName(g.opponent)
      oppWrs.push(lookupSplitWr(splitWinrate, oppCanon))
      gameModelScores.push(avg(g.modelScores))

      if (g.result !== 1) continue
      const oppElo = lookupElo(teamElo, oppCanon)
      // Prefer Elo (model strength). Fall back to split WR only when Elo is missing.
      if (ownElo != null && oppElo != null) {
        if (oppElo > ownElo) upsetWins += 1
        continue
      }
      const ownWr = lookupSplitWr(splitWinrate, team)
      const oppWr = lookupSplitWr(splitWinrate, oppCanon)
      if (oppWr > ownWr) upsetWins += 1
    }

    rows.push({
      team,
      weeklyWins: wins,
      weeklyGames: list.length,
      weeklyWinrate: (wins / list.length) * 100,
      weeklyAvgKda: avg(list.map((g) => avg(g.kdas))),
      weeklyAvgGd15: avg(list.flatMap((g) => g.gd15s)),
      weeklyObjControl: avg(list.map((g) => avg(g.objs))),
      avgOpponentSplitWinrate: avg(oppWrs),
      upsetWins,
      impressiveness: unitIntervalTo100(avg(gameModelScores)),
    })
  }

  return rows.sort((a, b) => {
    if (b.impressiveness !== a.impressiveness) return b.impressiveness - a.impressiveness
    if (b.upsetWins !== a.upsetWins) return b.upsetWins - a.upsetWins
    return b.weeklyWinrate - a.weeklyWinrate
  })
}
