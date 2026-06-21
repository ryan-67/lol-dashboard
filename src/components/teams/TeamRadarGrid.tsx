import type { Team } from '../../hooks/useDashboardData'
import { teamKey, teamsForRadarDisplay, type TeamScope } from '../../lib/teamAnalytics'
import TeamRadarChart from './TeamRadarChart'

interface TeamRadarGridProps {
  teams: Team[]
  scope: TeamScope
  allTier1Selected: boolean
}

export default function TeamRadarGrid({ teams, scope, allTier1Selected }: TeamRadarGridProps) {
  const displayTeams = teamsForRadarDisplay(teams, scope, allTier1Selected)

  if (!displayTeams.length) {
    return <div className="empty-state">No teams match the current filters.</div>
  }

  return (
    <div className="radar-grid">
      {displayTeams.map((team) => (
        <TeamRadarChart
          key={teamKey(team)}
          team={team}
          cohort={teams.filter((t) => t.league === team.league)}
        />
      ))}
    </div>
  )
}
