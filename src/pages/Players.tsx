import { useSearchParams } from 'react-router-dom'
import { players } from '../data/mockData'
import { useState } from 'react'

export default function Players() {
  const [searchParams] = useSearchParams()
  const league = searchParams.get('league') || 'All Tier 1'
  const [sortKey, setSortKey] = useState<keyof typeof players[0]>('kda')
  const [sortDesc, setSortDesc] = useState(true)
  const [posFilter, setPosFilter] = useState('all')

  let filtered = league === 'All Tier 1' ? players : players.filter((p) => p.league === league)
  if (posFilter !== 'all') filtered = filtered.filter((p) => p.position === posFilter)

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDesc ? bv - av : av - bv
    }
    return sortDesc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
  })

  const toggleSort = (key: keyof typeof players[0]) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else { setSortKey(key); setSortDesc(true) }
  }

  const th = (label: string, key: keyof typeof players[0]) => (
    <th
      onClick={() => toggleSort(key)}
      className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2 cursor-pointer hover:text-white select-none"
    >
      {label} {sortKey === key ? (sortDesc ? '↓' : '↑') : ''}
    </th>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 uppercase">Position</span>
        {['all', 'top', 'jungle', 'mid', 'adc', 'support'].map((pos) => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            className={`px-3 py-1 rounded text-xs font-medium ${
              posFilter === pos ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      <div className="bg-slate-850 border border-slate-800 rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 border-b border-slate-800">
            <tr>
              {th('Player', 'name')}
              {th('Team', 'team')}
              {th('League', 'league')}
              {th('Pos', 'position')}
              {th('Games', 'games')}
              {th('KDA', 'kda')}
              {th('KP%', 'kp')}
              {th('DMG%', 'dmgShare')}
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
                <td className="px-3 py-2 text-slate-500 uppercase text-xs">{p.position}</td>
                <td className="px-3 py-2 text-slate-300">{p.games}</td>
                <td className="px-3 py-2 font-bold text-blue-400">{p.kda.toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-300">{p.kp.toFixed(1)}%</td>
                <td className="px-3 py-2 text-slate-300">{p.dmgShare.toFixed(1)}%</td>
                <td className="px-3 py-2 text-slate-300">{p.gd15 > 0 ? '+' : ''}{p.gd15}</td>
                <td className="px-3 py-2 text-slate-300">{p.csd15 > 0 ? '+' : ''}{p.csd15}</td>
                <td className="px-3 py-2 text-slate-300">{p.xpd15 > 0 ? '+' : ''}{p.xpd15}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
