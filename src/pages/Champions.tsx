import { champions } from '../data/mockData'
import { useState } from 'react'

export default function Champions() {
  const [sortKey, setSortKey] = useState<keyof typeof champions[0]>('presence')
  const [sortDesc, setSortDesc] = useState(true)

  const sorted = [...champions].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDesc ? bv - av : av - bv
    }
    return sortDesc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
  })

  const toggleSort = (key: keyof typeof champions[0]) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else { setSortKey(key); setSortDesc(true) }
  }

  const th = (label: string, key: keyof typeof champions[0]) => (
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
          {sorted.map((c) => (
            <tr key={c.name} className="border-b border-slate-800/50 hover:bg-slate-800/50">
              <td className="px-3 py-2 font-medium text-white">{c.name}</td>
              <td className="px-3 py-2 text-slate-400 text-xs uppercase">{c.positions.join(', ')}</td>
              <td className="px-3 py-2 text-slate-300">{c.picks}</td>
              <td className="px-3 py-2 text-slate-300">{c.bans}</td>
              <td className="px-3 py-2 font-bold text-blue-400">{c.presence}%</td>
              <td className="px-3 py-2 text-slate-300">{c.winrate.toFixed(1)}%</td>
              <td className="px-3 py-2 text-slate-300">{c.avgKda.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
