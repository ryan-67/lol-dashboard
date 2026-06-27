import Select from './ui/Select'
import LeagueLogo from './entities/LeagueLogo'
import { entitySplitOptions } from '../lib/filterOptions'

export interface EntityFilterStripValues {
  league: string
  year: string
  split: string
  leagues: string[]
  years: string[]
  splits: string[]
  onLeagueChange: (v: string) => void
  onYearChange: (v: string) => void
  onSplitChange: (v: string) => void
  showAllSplit?: boolean
}

export function EntityFilterStripControls({
  league,
  year,
  split,
  leagues,
  years,
  splits: _splits,
  onLeagueChange,
  onYearChange,
  onSplitChange,
  showAllSplit = true,
  catalogSplits = [] as string[],
}: EntityFilterStripValues & { catalogSplits?: string[] }) {
  const splitOptions = entitySplitOptions(catalogSplits, year)
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="label-field">League</span>
        {league !== 'All Tier 1' ? <LeagueLogo league={league} size={18} /> : null}
        <Select label="League" value={league} onChange={(e) => onLeagueChange(e.target.value)}>
          {leagues.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="label-field">Year</span>
        <Select label="Year" value={year} onChange={(e) => onYearChange(e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="label-field">Split</span>
        <Select label="Split" value={split} onChange={(e) => onSplitChange(e.target.value)}>
          {showAllSplit ? (
            <option key="ALL" value="ALL">
              ALL
            </option>
          ) : null}
          {splitOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}

interface EntityFilterStripShellProps {
  children: React.ReactNode
  trailing?: React.ReactNode
}

export function EntityFilterStripShell({ children, trailing }: EntityFilterStripShellProps) {
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
