import { useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import type { Champion } from '../hooks/useDashboardData'
import { formatNum, formatPct } from '../lib/format'

function isDisplayableChampion(c: Champion): boolean {
  return Boolean(c?.name) && Array.isArray(c.positions)
}

export default function Champions() {
  const { filteredChampions } = useDashboard()
  const [sortKey, setSortKey] = useState<keyof Champion>('presence')
  const [sortDesc, setSortDesc] = useState(true)

  const champions = useMemo(
    () => filteredChampions.filter(isDisplayableChampion),
    [filteredChampions]
  )

  const sorted = useMemo(() => {
    return [...champions].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDesc ? bv - av : av - bv
      }
      if (Array.isArray(av) && Array.isArray(bv)) {
        const as = av.join(',')
        const bs = bv.join(',')
        return sortDesc ? bs.localeCompare(as) : as.localeCompare(bs)
      }
      return sortDesc
        ? String(bv ?? '').localeCompare(String(av ?? ''))
        : String(av ?? '').localeCompare(String(bv ?? ''))
    })
  }, [champions, sortKey, sortDesc])

  const toggleSort = (key: keyof Champion) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const th = (label: string, key: keyof Champion) => (
    <th
      onClick={() => toggleSort(key)}
      className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2 cursor-pointer hover:text-white select-none"
    >
      {label} {sortKey === key ? (sortDesc ? '↓' : '↑') : ''}
    </th>
  )

  return (
    <div className="bg-slate-850 border border-slate-800 rounded-lg overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 border-b border-slate-800">
          <tr>
            {th('Champion', 'name')}
            {th('Positions', 'positions')}
            {th('Picks', 'picks')}
            {th('Bans', 'bans')}
            {th('Presence', 'presence')}
            {th('Winrate', 'winrate')}
            {th('Avg KDA', 'avgKda')}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                No champions match the current filters.
              </td>
            </tr>
          ) : (
            sorted.map((c) => (
              <tr key={c.name} className="border-b border-slate-800/50 hover:bg-slate-800/50">
                <td className="px-3 py-2 font-medium text-white">{c.name}</td>
                <td className="px-3 py-2 text-slate-400 text-xs uppercase">
                  {(c.positions ?? []).join(', ') || '—'}
                </td>
                <td className="px-3 py-2 text-slate-300">{c.picks ?? '—'}</td>
                <td className="px-3 py-2 text-slate-300">{c.bans ?? '—'}</td>
                <td className="px-3 py-2 font-bold text-blue-400">{formatPct(c.presence, 1)}</td>
                <td className="px-3 py-2 text-slate-300">{formatPct(c.winrate, 1)}</td>
                <td className="px-3 py-2 text-slate-300">{formatNum(c.avgKda, 2)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
