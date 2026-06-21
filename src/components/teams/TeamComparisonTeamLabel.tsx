import type { Team } from '../../hooks/useDashboardData'
import { EntityLink, TeamLogo } from '../entities'

interface TeamComparisonTeamLabelProps {
  team: Team
  logoSize?: number
  as?: 'inline' | 'heading'
  className?: string
}

/** Team logo + linked name for Team Comparison charts. */
export default function TeamComparisonTeamLabel({
  team,
  logoSize = 20,
  as = 'inline',
  className = '',
}: TeamComparisonTeamLabelProps) {
  const content = (
    <>
      <TeamLogo name={team.name} size={logoSize} />
      <EntityLink type="team" name={team.name} showIcon={false} />
    </>
  )

  if (as === 'heading') {
    return (
      <h4 className={`card-title entity-inline-row ${className}`.trim()}>
        {content}
      </h4>
    )
  }

  return <span className={`entity-inline-row ${className}`.trim()}>{content}</span>
}
