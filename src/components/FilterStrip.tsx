import MultiSelectDropdown from './ui/MultiSelectDropdown'
import LeagueLogo from './entities/LeagueLogo'
import {
  isAllTier1Selected,
  leaguesToLeagueLabel,
  splitSeasonLabel,
  splitsToLabel,
  yearsToLabel,
} from '../lib/filterLabels'

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
  const leagueLabel = leaguesToLeagueLabel(selectedLeagues)
  const yearLabel = yearsToLabel(selectedYears)
  const splitLabel = splitsToLabel(selectedSplits)

  const leagueOptions = leagues.map((l) => ({ value: l, label: l }))
  const yearOptions = years.map((y) => ({ value: y, label: y }))
  const splitOptions = [
    { value: 'ALL', label: 'ALL' },
    ...splits.map((s) => ({ value: s, label: splitSeasonLabel(s) })),
  ]

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="label-field">League</span>
        {isAllTier1Selected(selectedLeagues) ? null : (
          <LeagueLogo league={selectedLeagues[0] ?? 'LCK'} size={18} />
        )}
        <MultiSelectDropdown
          label="League"
          displayValue={leagueLabel}
          options={leagueOptions}
          selected={selectedLeagues}
          onToggle={toggleLeague}
          allValue="All Tier 1"
          isAllSelected={isAllTier1Selected(selectedLeagues)}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="label-field">Year</span>
        <MultiSelectDropdown
          label="Year"
          displayValue={yearLabel}
          options={yearOptions}
          selected={selectedYears}
          onToggle={toggleYear}
          minWidth={120}
          allValue="ALL"
          isAllSelected={selectedYears.includes('ALL')}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="label-field">Split</span>
        <MultiSelectDropdown
          label="Split"
          displayValue={splitLabel}
          options={splitOptions}
          selected={selectedSplits}
          onToggle={toggleSplit}
          allValue="ALL"
          isAllSelected={selectedSplits.includes('ALL')}
        />
      </div>
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
