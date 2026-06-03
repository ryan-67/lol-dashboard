import type { Team } from '../../hooks/useDashboardData'
import { defaultCompareKeys, type TeamScope, teamsForScope } from '../../lib/teamAnalytics'
import TeamComparePicker from './TeamComparePicker'

interface TeamFilterBarProps {
  teams: Team[]
  scope: TeamScope
  onScopeChange: (scope: TeamScope) => void
  compareKeys: string[]
  onCompareChange: (keys: string[]) => void
}

export default function TeamFilterBar({
  teams,
  scope,
  onScopeChange,
  compareKeys,
  onCompareChange,
}: TeamFilterBarProps) {
  const scopeTeams = teamsForScope(teams, scope)

  const useTopDefaults = () => {
    onScopeChange('top')
    onCompareChange(defaultCompareKeys(teams, 'top'))
  }

  const clearCompare = () => onCompareChange([])

  return (
    <div className="team-filter-bar">
      <div className="role-filter-bar" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
        <button
          type="button"
          className={`role-filter-btn${scope === 'top' ? ' active' : ''}`}
          onClick={() => onScopeChange('top')}
        >
          Top Teams
        </button>
        <button
          type="button"
          className={`role-filter-btn${scope === 'all' ? ' active' : ''}`}
          onClick={() => onScopeChange('all')}
        >
          All Teams
        </button>
      </div>

      <div className="team-compare-row">
        <TeamComparePicker teams={scopeTeams} selectedKeys={compareKeys} onChange={onCompareChange} />
        <button type="button" className="btn" onClick={useTopDefaults}>
          Top Per League
        </button>
        <button type="button" className="btn" onClick={clearCompare} disabled={compareKeys.length === 0}>
          Clear
        </button>
      </div>
      <p className="card-subtitle" style={{ marginBottom: 0 }}>
        {compareKeys.length >= 1
          ? 'Comparison overlay active — click teams in the list to add or remove.'
          : scope === 'top'
            ? 'Top team per tier-1 league around your favorite team (center).'
            : 'All teams in filter. Click teams to compare on one radar.'}
      </p>
    </div>
  )
}
