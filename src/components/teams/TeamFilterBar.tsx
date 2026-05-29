import type { ChangeEvent } from 'react'
import type { Team } from '../../hooks/useDashboardData'
import {
  defaultCompareKeys,
  teamKey,
  type TeamScope,
  teamsForScope,
} from '../../lib/teamAnalytics'

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

  const handleSelect = (e: ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value)
    onCompareChange(selected)
  }

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
        <label className="label-field" htmlFor="team-compare-select">
          Compare Teams
        </label>
        <div className="select-wrap select-wide team-multi-select-wrap">
          <select
            id="team-compare-select"
            multiple
            value={compareKeys}
            onChange={handleSelect}
            className="team-multi-select"
            aria-label="Compare teams"
          >
            {scopeTeams.map((t) => {
              const key = teamKey(t)
              return (
                <option key={key} value={key}>
                  {t.name} ({t.league}) — {t.winrate.toFixed(1)}% WR
                </option>
              )
            })}
          </select>
        </div>
        <button type="button" className="btn" onClick={useTopDefaults}>
          Top Per League
        </button>
        <button type="button" className="btn" onClick={clearCompare} disabled={compareKeys.length === 0}>
          Clear
        </button>
      </div>
      <p className="card-subtitle" style={{ marginBottom: 0 }}>
        {compareKeys.length >= 2
          ? 'Comparison overlay active — select 2+ teams to compare on one radar.'
          : scope === 'top'
            ? 'Showing best team per league. Select teams to compare.'
            : 'All teams in filter. Select 2+ teams to compare on one radar.'}
      </p>
    </div>
  )
}
