import { useDashboard } from '../context/DashboardContext'
import Select from './ui/Select'

export default function TopBar() {
  const { league, setLeague, split, setSplit, refresh, loading, lastUpdated, leagues, splits } =
    useDashboard()

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
            <span className="label-field">Split</span>
            <Select label="Split" value={split} onChange={(e) => setSplit(e.target.value)}>
              {splits.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-tertiary">
              updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button type="button" onClick={refresh} disabled={loading} className="btn">
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  )
}
