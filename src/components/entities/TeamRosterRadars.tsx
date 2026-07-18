import { useMemo } from 'react'
import type { Player } from '../../hooks/useDashboardData'
import { computeAggregateScore, normalizePosition, playersForRole, type RoleKey } from '../../lib/playerRadar'
import { formatNum } from '../../lib/format'
import PlayerRadarChart from '../players/PlayerRadarChart'

interface RosterRow {
  player?: Player
  name: string
  position: string
  isSub: boolean
}

interface TeamRosterRadarsProps {
  roster: RosterRow[]
  players: Player[]
}

/**
 * Radar-per-starter grid — each rostered starter's role-normalized profile
 * with an aggregate performance score underneath.
 */
export default function TeamRosterRadars({ roster, players }: TeamRosterRadarsProps) {
  const entries = useMemo(() => {
    return roster
      .filter((row) => !row.isSub && row.player)
      .map((row) => {
        const player = row.player!
        const role = (normalizePosition(player.position) ?? normalizePosition(row.position) ?? 'mid') as RoleKey
        const cohort = playersForRole(players, role)
        const score = computeAggregateScore(player, role, cohort) * 100
        return { player, role, cohort, score }
      })
  }, [roster, players])

  if (!entries.length) return null

  return (
    <div className="card">
      <h3 className="card-title">Roster Radars</h3>
      <p className="card-subtitle">Role-normalized performance profile for each starter</p>
      <div className="team-roster-radars-grid">
        {entries.map(({ player, role, cohort, score }) => (
          <div key={player.name} className="team-roster-radar-item">
            <PlayerRadarChart player={player} role={role} cohort={cohort} compact />
            <div className="team-roster-radar-score">
              <span className="text-secondary text-xs">Performance</span>
              <span className="text-accent">{formatNum(score, 1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
