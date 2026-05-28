import { useDashboard } from '../context/DashboardContext'

export default function TopBar() {
  const { league, setLeague, split, setSplit, refresh, loading, lastUpdated, leagues, splits } =
    useDashboard()

  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-6 py-3 bg-slate-900/50 border-b border-slate-800">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
            League
          </label>
          <select
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
          >
            {leagues.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
            Split
          </label>
          <select
            value={split}
            onChange={(e) => setSplit(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
          >
            {splits.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {lastUpdated && (
          <span className="text-xs text-slate-500">
            updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button
          onClick={refresh}
          disabled={loading}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
            loading
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'
          }`}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
