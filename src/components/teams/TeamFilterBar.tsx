import type { TeamScope } from '../../lib/teamAnalytics'

interface TeamFilterBarProps {
  scope: TeamScope
  onScopeChange: (scope: TeamScope) => void
  /** Hide the helper subtitle (e.g. when embedded in a sticky subnav). */
  compact?: boolean
}

export default function TeamFilterBar({ scope, onScopeChange, compact = false }: TeamFilterBarProps) {
  return (
    <div className="team-filter-bar">
      <div
        className="role-filter-bar"
        style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}
      >
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
      {!compact ? (
        <p className="card-subtitle" style={{ marginBottom: 0, marginTop: 'var(--component-gap)' }}>
          {scope === 'top'
            ? 'Best team per tier-1 league, or top 4 in a selected league.'
            : 'Radar charts for every team in the current league filter.'}
        </p>
      ) : null}
    </div>
  )
}
