import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import type { PlayerPowerRow, PlayerRatingsBundle, RatingRole } from './loadPlayerRatings'
import { formUnitTo100 } from './scoreNormalize'
import { ROLES, type RoleKey } from './playerRadar'
import type { TeamWeekStats } from './hottestTeam'

export interface FormTeamRow {
  name: string
  region: string
  rating: number
  score100: number
}

interface WeeklyFormPlayer {
  base: Player
  role: RoleKey
  weeklyGames: PlayerGameLog[]
  scoreAvg: number
}

export function buildCurrentFormPlayerBundle(
  weeklyPlayers: WeeklyFormPlayer[],
  generatedAt: string,
  limit = 10,
): PlayerRatingsBundle {
  const roles = {} as PlayerRatingsBundle['roles']
  for (const role of ROLES as RatingRole[]) {
    const ranked = weeklyPlayers
      .filter((p) => p.role === role)
      .sort((a, b) => b.scoreAvg - a.scoreAvg)
      .slice(0, limit)
      .map((p, idx) => {
        const games = p.weeklyGames.length
        const row: PlayerPowerRow = {
          rank: idx + 1,
          player: p.base.name,
          team: p.base.team,
          region: p.base.league,
          games,
          effGames: games,
          boxScoreZ: p.scoreAvg,
          regionShift: 0,
          powerScore: 0,
          displayScore100: formUnitTo100(p.scoreAvg, games),
        }
        return row
      })
    roles[role] = ranked
  }
  return {
    version: 'form-window',
    generatedAt,
    roles,
  }
}

export function buildCurrentFormTeamRows(
  hottest: TeamWeekStats[],
  leagueByTeam: Map<string, string>,
  limit = 10,
): FormTeamRow[] {
  return hottest.slice(0, limit).map((row) => {
    const games = row.weeklyGames
    const raw = Math.min(row.impressiveness, 96)
    const score100 =
      games < 4 ? 50 + (raw - 50) * Math.max(0.4, games / 4) : raw
    return {
      name: row.team,
      region: leagueByTeam.get(row.team) ?? '',
      rating: row.weeklyWinrate,
      score100,
    }
  })
}
