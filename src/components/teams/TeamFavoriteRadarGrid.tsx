import type { Team } from '../../hooks/useDashboardData'
import { buildFavoriteCenterLayout, teamKey, tier1LeagueSlot } from '../../lib/teamAnalytics'
import TeamRadarChart from './TeamRadarChart'

interface TeamFavoriteRadarGridProps {
  teams: Team[]
  favoriteTeamName: string | null
  allTeams: Team[]
}

export default function TeamFavoriteRadarGrid({
  teams,
  favoriteTeamName,
  allTeams,
}: TeamFavoriteRadarGridProps) {
  const { center, surrounding } = buildFavoriteCenterLayout(teams, favoriteTeamName)

  const slotTeams: Record<'top' | 'left' | 'right' | 'bottom', Team | null> = {
    top: null,
    left: null,
    right: null,
    bottom: null,
  }

  for (const team of surrounding) {
    const slot = tier1LeagueSlot(team.league)
    if (slot) slotTeams[slot] = team
  }

  const renderTeam = (team: Team, highlighted = false) => (
    <TeamRadarChart
      key={teamKey(team)}
      team={team}
      cohort={allTeams.filter((t) => t.league === team.league)}
      highlighted={highlighted}
    />
  )

  if (center) {
    return (
      <div className="radar-grid-favorite-center">
        <div className="radar-card-slot radar-card-slot-top">
          {slotTeams.top ? renderTeam(slotTeams.top) : null}
        </div>
        <div className="radar-card-slot radar-card-slot-left">
          {slotTeams.left ? renderTeam(slotTeams.left) : null}
        </div>
        <div className="radar-card-slot radar-card-slot-center">
          {renderTeam(center, true)}
        </div>
        <div className="radar-card-slot radar-card-slot-right">
          {slotTeams.right ? renderTeam(slotTeams.right) : null}
        </div>
        <div className="radar-card-slot radar-card-slot-bottom">
          {slotTeams.bottom ? renderTeam(slotTeams.bottom) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="radar-grid">
      {surrounding.map((team) => renderTeam(team))}
    </div>
  )
}
