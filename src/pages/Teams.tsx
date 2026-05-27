import { useSearchParams } from 'react-router-dom'
import { teams } from '../data/mockData'
import { useState } from 'react'

export default function Teams() {
  const [searchParams] = useSearchParams()
  const league = searchParams.get('league') || 'All Tier 1'
  const [sortKey, setSortKey] = useState<keyof typeof teams[0]>('winrate')
  const [sortDesc, setSortDesc] = useState(true)

  let filtered = league === 'All Tier 1' ? teams : teams.filter((t) => t.league === league)

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDesc ? bv - av : av - bv
    }
    return sortDesc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
  })

  const toggleSort = (key: keyof typeof teams[0]) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else { setSortKey(key); setSortDesc(true) }
  }

  const th = (label: string, key: keyof typeof teams[0]) => (
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
            {th('Team', 'name')}
            {th('League', 'league')}
            {th('Games', 'games')}
            {th('W', 'wins')}
            {th('L', 'losses')}
            {th('Winrate', 'winrate')}
            {th('Avg KDA', 'avgKda')}
            {th('Avg GD@15', 'avgGd15')}
            {th('Towers', 'towers')}
            {th('Drakes', 'dragons')}
            {th('Barons', 'barons')}
            {th('Heralds', 'heralds')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.name} className="border-b border-slate-800/50 hover:bg-slate-800/50">
              <td className="px-3 py-2 font-medium text-white">{t.name}</td>
              <td className="px-3 py-2 text-slate-400">{t.league}</td>
              <td className="px-3 py-2 text-slate-300">{t.games}</td>
              <td className="px-3 py-2 text-green-400">{t.wins}</td>
              <td className="px-3 py-2 text-red-400">{t.losses}</td>
              <td className="px-3 py-2 font-bold text-blue-400">{t.winrate.toFixed(1)}%</td>
              <td className="px-3 py-2 text-slate-300">{t.avgKda.toFixed(2)}</td>
              <td className="px-3 py-2 text-slate-300">{t.avgGd15 > 0 ? '+' : ''}{t.avgGd15}</td>
              <td className="px-3 py-2 text-slate-300">{t.towers}</td>
              <td className="px-3 py-2 text-slate-300">{t.dragons}</td>
              <td className="px-3 py-2 text-slate-300">{t.barons}</td>
              <td className="px-3 py-2 text-slate-300">{t.heralds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
