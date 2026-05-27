import { useSearchParams } from 'react-router-dom'
import { LEAGUES, SPLITS } from '../data/mockData'

export default function TopBar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const league = searchParams.get('league') || 'All Tier 1'
  const split = searchParams.get('split') || '2025 Spring'

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(key, value)
    setSearchParams(next)
  }

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-slate-850 border-b border-slate-800">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 uppercase tracking-wider">League</label>
        <select
          value={league}
          onChange={(e) => update('league', e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
        >
          {LEAGUES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 uppercase tracking-wider">Split</label>
        <select
          value={split}
          onChange={(e) => update('split', e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
        >
          {SPLITS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
