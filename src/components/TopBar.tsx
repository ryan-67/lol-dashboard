import { useDashboard } from '../context/DashboardContext'
import { formatRefreshTimestamp } from '../lib/format'
import { FilterStripControls, FilterStripShell } from './FilterStrip'

export default function TopBar() {
  const { league, setLeague, year, setYear, split, setSplit, lastUpdated, leagues, years, splits } =
    useDashboard()

  return (
    <FilterStripShell
      trailing={
        lastUpdated ? (
          <span className="text-xs text-tertiary">
            updated {formatRefreshTimestamp(lastUpdated, { includeYear: true })}
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
        showAllSplit
      />
    </FilterStripShell>
  )
}
