import { useMemo } from 'react'
import type { Player } from '../../hooks/useDashboardData'
import type { ResolvedSeries } from '../../lib/seriesAnalytics'
import { playersForRole, ROLES, type RoleKey } from '../../lib/playerRadar'
import { rosterPlayersForTeam } from '../../lib/teamComparisonAnalytics'
import PlayerRadarChart from '../players/PlayerRadarChart'
import { formatNum, formatPct } from '../../lib/format'
import { recapTeamTag } from '../../lib/recapTeamTag'
import type { Team } from '../../hooks/useDashboardData'
import { EntityLink, TeamLogo } from '../entities'

interface SeriesRoleComparisonProps {
  series: ResolvedSeries
  teams: Team[]
  players: Player[]
  cohortPlayers: Player[]
}

function seriesStarter(
  roster: ReturnType<typeof rosterPlayersForTeam>,
  role: RoleKey,
): Player | null {
  return roster.find((r) => r.role === role)?.player ?? null
}

export default function SeriesRoleComparison({
  series,
  teams,
  players,
  cohortPlayers,
}: SeriesRoleComparisonProps) {
  const teamA = teams.find((t) => t.name === series.teamA) ?? teams[0]
  const teamB = teams.find((t) => t.name === series.teamB) ?? teams[1]

  const rosterA = useMemo(
    () => (teamA ? rosterPlayersForTeam(players, teamA) : []),
    [players, teamA],
  )
  const rosterB = useMemo(
    () => (teamB ? rosterPlayersForTeam(players, teamB) : []),
    [players, teamB],
  )

  if (!teamA || !teamB) return null

  return (
    <div className="series-role-comparison">
      {ROLES.map((role) => {
        const playerA = seriesStarter(rosterA, role)
        const playerB = seriesStarter(rosterB, role)
        if (!playerA && !playerB) return null
        const cohort = playersForRole(cohortPlayers, role)

        return (
          <section key={role} className="series-role-block card">
            <h3 className="card-title">{role.toUpperCase()}</h3>
            <div className="series-role-grid">
              <div>
                <p className="card-subtitle entity-inline-row">
                  <TeamLogo name={series.teamA} size={18} />
                  {recapTeamTag(series.teamA)}
                </p>
                {playerA ? (
                  <>
                    <p className="series-role-player-name">
                      <EntityLink type="player" name={playerA.name} showIcon={false}>
                        {playerA.name}
                      </EntityLink>
                    </p>
                    <PlayerRadarChart player={playerA} role={role} cohort={cohort} compact hideHeader />
                    <ul className="series-role-stats">
                      <li>
                        <span>KDA</span>
                        <span>{formatNum(playerA.kda, 2)}</span>
                      </li>
                      <li>
                        <span>GD@15</span>
                        <span>{playerA.gd15}</span>
                      </li>
                      <li>
                        <span>KP%</span>
                        <span>{formatPct(playerA.kp, 1)}</span>
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="text-secondary text-sm">—</p>
                )}
              </div>
              <div>
                <p className="card-subtitle entity-inline-row">
                  <TeamLogo name={series.teamB} size={18} />
                  {recapTeamTag(series.teamB)}
                </p>
                {playerB ? (
                  <>
                    <p className="series-role-player-name">
                      <EntityLink type="player" name={playerB.name} showIcon={false}>
                        {playerB.name}
                      </EntityLink>
                    </p>
                    <PlayerRadarChart player={playerB} role={role} cohort={cohort} compact hideHeader />
                    <ul className="series-role-stats">
                      <li>
                        <span>KDA</span>
                        <span>{formatNum(playerB.kda, 2)}</span>
                      </li>
                      <li>
                        <span>GD@15</span>
                        <span>{playerB.gd15}</span>
                      </li>
                      <li>
                        <span>KP%</span>
                        <span>{formatPct(playerB.kp, 1)}</span>
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="text-secondary text-sm">—</p>
                )}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
