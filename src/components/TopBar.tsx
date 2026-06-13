import { useDashboard } from '../context/DashboardContext'
import { formatRefreshTimestamp } from '../lib/format'
import { FilterStripControls, FilterStripShell } from './FilterStrip'

export default function TopBar() {
  const {
    lastUpdated,
    leagues,
    years,
    splits,
    selectedLeagues,
    selectedYears,
    selectedSplits,
    toggleLeague,
    toggleYear,
    toggleSplit,
  } = useDashboard()

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
        selectedLeagues={selectedLeagues}
        selectedYears={selectedYears}
        selectedSplits={selectedSplits}
        leagues={leagues}
        years={years}
        splits={splits}
        toggleLeague={toggleLeague}
        toggleYear={toggleYear}
        toggleSplit={toggleSplit}
      />
    </FilterStripShell>
  )
}
