import FilterToggleGroup from './ui/FilterToggleGroup'
import { isAllTier1Selected, splitSeasonLabel } from '../lib/filterLabels'

export interface FilterStripValues {
  selectedLeagues: string[]
  selectedYears: string[]
  selectedSplits: string[]
  leagues: string[]
  years: string[]
  splits: string[]
  toggleLeague: (v: string) => void
  toggleYear: (v: string) => void
  toggleSplit: (v: string) => void
}

export function FilterStripControls({
  selectedLeagues,
  selectedYears,
  selectedSplits,
  leagues,
  years,
  splits,
  toggleLeague,
  toggleYear,
  toggleSplit,
}: FilterStripValues) {
  const leagueOptions = leagues.map((l) => ({ value: l, label: l }))
  const yearOptions = years.map((y) => ({ value: y, label: y }))
  const splitOptions = [
    { value: 'ALL', label: 'ALL' },
    ...splits.map((s) => ({ value: s, label: splitSeasonLabel(s) })),
  ]

  return (
    <div className="filter-strip-controls">
      <FilterToggleGroup
        label="League"
        options={leagueOptions}
        selected={selectedLeagues}
        onToggle={toggleLeague}
        allValue="All Tier 1"
        isAllSelected={isAllTier1Selected(selectedLeagues)}
      />
      <FilterToggleGroup
        label="Year"
        options={yearOptions}
        selected={selectedYears}
        onToggle={toggleYear}
      />
      <FilterToggleGroup
        label="Split"
        options={splitOptions}
        selected={selectedSplits}
        onToggle={toggleSplit}
      />
    </div>
  )
}

interface FilterStripShellProps {
  children: React.ReactNode
  trailing?: React.ReactNode
}

export function FilterStripShell({ children, trailing }: FilterStripShellProps) {
  return (
    <div
      className="border-t"
      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
    >
      <div className="app-header-inner flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 py-3">
        {children}
        {trailing}
      </div>
    </div>
  )
}
