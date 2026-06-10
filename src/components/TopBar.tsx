import { useDashboard } from '../context/DashboardContext'
import { FilterStripControls, FilterStripShell } from './FilterStrip'

export default function TopBar() {
  const { league, setLeague, year, setYear, split, setSplit, lastUpdated, leagues, years, splits } =
    useDashboard()

  return (
    <FilterStripShell
      trailing={
        lastUpdated ? (
          <span className="text-xs text-tertiary">
            updated{' '}
            {lastUpdated.toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ) : undefined
      }
    >
      <FilterStripControls
        league={league}
        year={year}
        split={split}
        leagues={leagues}
        years={years}
        splits={splits}
        onLeagueChange={setLeague}
        onYearChange={setYear}
        onSplitChange={setSplit}
      />
    </FilterStripShell>
  )
}
