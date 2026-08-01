import Select from './ui/Select'
import LeagueLogo from './entities/LeagueLogo'

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
  leagues,
  onLeagueChange,
}: EntityFilterStripValues & { catalogSplits?: string[] }) {
  // v3: league watching lens only — year/split archaeology removed from entity chrome.
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
