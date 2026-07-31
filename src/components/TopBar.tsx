import { useLocation } from 'react-router-dom'
import { useDashboard } from '../context/DashboardContext'
import { formatRefreshTimestamp } from '../lib/format'
import { FilterStripControls, FilterStripShell } from './FilterStrip'

export default function TopBar() {
  const location = useLocation()
  const isOverview =
    location.pathname === '/dashboard' ||
    location.pathname === '/duo' ||
    location.pathname === '/'
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
          <span className="filter-sync">
            <span className="filter-sync-dot" aria-hidden />
            synced {formatRefreshTimestamp(lastUpdated, { includeYear: true })}
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
        hideYearAndSplit={isOverview}
      />
    </FilterStripShell>
  )
}
