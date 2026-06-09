import { useDashboard } from '../context/DashboardContext'
import Select from './ui/Select'

export default function TopBar() {
  const { league, setLeague, year, setYear, split, setSplit, lastUpdated, leagues, years, splits } =
    useDashboard()

  const splitLabel = (value: string) => value.replace(/^\d{4}\s+/, '')

  return (
    <div
      className="border-t"
      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
    >
      <div className="app-header-inner flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="label-field">League</span>
            <Select label="League" value={league} onChange={(e) => setLeague(e.target.value)}>
              {leagues.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="label-field">Year</span>
            <Select label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="label-field">Split</span>
            <Select label="Split" value={split} onChange={(e) => setSplit(e.target.value)}>
              {splits.map((s) => (
                <option key={s} value={s}>
                  {splitLabel(s)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {lastUpdated && (
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
        )}
      </div>
    </div>
  )
}
