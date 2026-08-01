import type { OverviewPane } from '../../lib/overviewPane'

interface OverviewPaneToggleProps {
  value: OverviewPane
  onChange: (pane: OverviewPane) => void
}

/** Hub (catch-up) | Board (upcoming foresight) — v3 Overview composition. */
export default function OverviewPaneToggle({ value, onChange }: OverviewPaneToggleProps) {
  return (
    <div className="overview-pane-toggle" role="tablist" aria-label="Overview surface">
      <div
        className="role-filter-bar"
        style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === 'hub'}
          tabIndex={0}
          className={`role-filter-btn${value === 'hub' ? ' active' : ''}`}
          onClick={() => onChange('hub')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onChange('hub')
            }
          }}
        >
          Hub
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'board'}
          tabIndex={0}
          className={`role-filter-btn${value === 'board' ? ' active' : ''}`}
          onClick={() => onChange('board')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onChange('board')
            }
          }}
        >
          Board
        </button>
      </div>
    </div>
  )
}
