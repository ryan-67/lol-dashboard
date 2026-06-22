import type { HubPeriod } from '../../lib/weeklyWindow'

interface OverviewHubToggleProps {
  value: HubPeriod
  onChange: (period: HubPeriod) => void
}

export default function OverviewHubToggle({ value, onChange }: OverviewHubToggleProps) {
  return (
    <div className="overview-hub-toggle">
      <div
        className="role-filter-bar"
        style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}
      >
        <button
          type="button"
          className={`role-filter-btn${value === 'weekly' ? ' active' : ''}`}
          onClick={() => onChange('weekly')}
        >
          Weekly
        </button>
        <button
          type="button"
          className={`role-filter-btn${value === 'monthly' ? ' active' : ''}`}
          onClick={() => onChange('monthly')}
        >
          Monthly
        </button>
      </div>
    </div>
  )
}
