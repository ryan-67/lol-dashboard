import { useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import type { Team } from '../hooks/useDashboardData'
import { formatNum, formatPct } from '../lib/format'

function isDisplayableTeam(t: Team): boolean {
  return (
    Boolean(t?.name) &&
    typeof t.wins === 'number' &&
    typeof t.losses === 'number' &&
    !Array.isArray((t as Team & { positions?: unknown }).positions)
  )
}

export default function Teams() {
  const { filteredTeams } = useDashboard()
  const [sortKey, setSortKey] = useState<keyof Team>('winrate')
  const [sortDesc, setSortDesc] = useState(true)

  const teams = useMemo(
    () => filteredTeams.filter(isDisplayableTeam),
    [filteredTeams]
  )

  const sorted = useMemo(() => {
    return [...teams].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDesc ? bv - av : av - bv
      }
      return sortDesc
        ? String(bv ?? '').localeCompare(String(av ?? ''))
        : String(av ?? '').localeCompare(String(bv ?? ''))
    })
  }, [teams, sortKey, sortDesc])

  const toggleSort = (key: keyof Team) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const th = (label: string, key: keyof Team) => (
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
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                No teams match the current filters.
              </td>
            </tr>
          ) : (
            sorted.map((t) => (
              <tr key={`${t.name}-${t.league}`} className="border-b border-slate-800/50 hover:bg-slate-800/50">
                <td className="px-3 py-2 font-medium text-white">{t.name}</td>
                <td className="px-3 py-2 text-slate-400">{t.league ?? '—'}</td>
                <td className="px-3 py-2 text-slate-300">{t.games ?? '—'}</td>
                <td className="px-3 py-2 text-green-400">{t.wins ?? '—'}</td>
                <td className="px-3 py-2 text-red-400">{t.losses ?? '—'}</td>
                <td className="px-3 py-2 font-bold text-blue-400">{formatPct(t.winrate, 1)}</td>
                <td className="px-3 py-2 text-slate-300">{formatNum(t.avgKda, 2)}</td>
                <td className="px-3 py-2 text-slate-300">
                  {typeof t.avgGd15 === 'number'
                    ? `${t.avgGd15 > 0 ? '+' : ''}${t.avgGd15}`
                    : '—'}
                </td>
                <td className="px-3 py-2 text-slate-300">{t.towers ?? '—'}</td>
                <td className="px-3 py-2 text-slate-300">{t.dragons ?? '—'}</td>
                <td className="px-3 py-2 text-slate-300">{t.barons ?? '—'}</td>
                <td className="px-3 py-2 text-slate-300">{t.heralds ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
