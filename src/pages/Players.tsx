import { useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import type { Player } from '../hooks/useDashboardData'
import { formatNum, formatPct } from '../lib/format'

function isDisplayablePlayer(p: Player): boolean {
  return (
    Boolean(p?.name) &&
    typeof p.kda === 'number' &&
    typeof p.games === 'number'
  )
}

export default function Players() {
  const { filteredPlayers } = useDashboard()
  const [sortKey, setSortKey] = useState<keyof Player>('kda')
  const [sortDesc, setSortDesc] = useState(true)

  const players = useMemo(
    () => filteredPlayers.filter(isDisplayablePlayer),
    [filteredPlayers]
  )

  const sorted = useMemo(() => {
    return [...players].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDesc ? bv - av : av - bv
      }
      return sortDesc
        ? String(bv ?? '').localeCompare(String(av ?? ''))
        : String(av ?? '').localeCompare(String(bv ?? ''))
    })
  }, [players, sortKey, sortDesc])

  const toggleSort = (key: keyof Player) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const th = (label: string, key: keyof Player) => (
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
            {th('Player', 'name')}
            {th('Team', 'team')}
            {th('League', 'league')}
            {th('Position', 'position')}
            {th('Games', 'games')}
            {th('KDA', 'kda')}
            {th('KP', 'kp')}
            {th('DMG Share', 'dmgShare')}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                No players match the current filters.
              </td>
            </tr>
          ) : (
            sorted.map((p) => (
              <tr
                key={`${p.name}-${p.team}-${p.league}`}
                className="border-b border-slate-800/50 hover:bg-slate-800/50"
              >
                <td className="px-3 py-2 font-medium text-white">{p.name}</td>
                <td className="px-3 py-2 text-slate-300">{p.team ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400">{p.league ?? '—'}</td>
                <td className="px-3 py-2 text-slate-300 uppercase">{p.position ?? '—'}</td>
                <td className="px-3 py-2 text-slate-300">{p.games ?? '—'}</td>
                <td className="px-3 py-2 font-bold text-blue-400">{formatNum(p.kda, 2)}</td>
                <td className="px-3 py-2 text-slate-300">{formatPct(p.kp, 1)}</td>
                <td className="px-3 py-2 text-slate-300">{formatPct(p.dmgShare, 1)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
