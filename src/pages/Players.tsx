import { useState } from 'react'
import { useDashboard } from '../context/DashboardContext'

export default function Players() {
  const { filteredPlayers } = useDashboard()
  const [sortKey, setSortKey] = useState<keyof (typeof filteredPlayers)[number]>('kda')
  const [sortDesc, setSortDesc] = useState(true)

  const sorted = [...filteredPlayers].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDesc ? bv - av : av - bv
    }
    return sortDesc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
  })

  const toggleSort = (key: keyof (typeof filteredPlayers)[number]) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else { setSortKey(key); setSortDesc(true) }
  }

  const th = (label: string, key: keyof (typeof filteredPlayers)[number]) => (
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
            {th('GD@15', 'gd15')}
            {th('CSD@15', 'csd15')}
            {th('XPD@15', 'xpd15')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.name} className="border-b border-slate-800/50 hover:bg-slate-800/50">
              <td className="px-3 py-2 font-medium text-white">{p.name}</td>
              <td className="px-3 py-2 text-slate-300">{p.team}</td>
              <td className="px-3 py-2 text-slate-400">{p.league}</td>
              <td className="px-3 py-2 text-slate-300 uppercase">{p.position}</td>
              <td className="px-3 py-2 text-slate-300">{p.games}</td>
              <td className="px-3 py-2 font-bold text-blue-400">{p.kda.toFixed(2)}</td>
              <td className="px-3 py-2 text-slate-300">{p.kp.toFixed(1)}%</td>
              <td className="px-3 py-2 text-slate-300">{p.dmgShare.toFixed(1)}%</td>
              <td className="px-3 py-2 text-slate-300">{p.gd15 > 0 ? '+' : ''}{p.gd15.toFixed(1)}</td>
              <td className="px-3 py-2 text-slate-300">{p.csd15 > 0 ? '+' : ''}{p.csd15.toFixed(1)}</td>
              <td className="px-3 py-2 text-slate-300">{p.xpd15 > 0 ? '+' : ''}{p.xpd15.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
