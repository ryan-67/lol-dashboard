import Select from '../ui/Select'

interface EntityFilterBarProps {
  league: string
  year: string
  split: string
  leagues: string[]
  years: string[]
  splits: string[]
  onLeagueChange: (v: string) => void
  onYearChange: (v: string) => void
  onSplitChange: (v: string) => void
  fallbackNotice?: string | null
}

export default function EntityFilterBar({
  league,
  year,
  split,
  leagues,
  years,
  splits,
  onLeagueChange,
  onYearChange,
  onSplitChange,
  fallbackNotice,
}: EntityFilterBarProps) {
  const splitLabel = (value: string) => value.replace(/^\d{4}\s+/, '')

  return (
    <div className="entity-filter-bar">
      <div className="entity-filter-controls">
        <div className="flex items-center gap-2">
          <span className="label-field">League</span>
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
            {splits.map((s) => (
              <option key={s} value={s}>
                {splitLabel(s)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {fallbackNotice ? <p className="entity-filter-notice">{fallbackNotice}</p> : null}
    </div>
  )
}
