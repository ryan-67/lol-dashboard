import { useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import type { Player } from '../hooks/useDashboardData'
import { formatNum, formatPct } from '../lib/format'
import SortableTh from '../components/ui/SortableTh'
import { useScrollReveal } from '../hooks/useScrollReveal'

function isDisplayablePlayer(p: Player): boolean {
  return Boolean(p?.name) && typeof p.kda === 'number' && typeof p.games === 'number'
}

export default function Players() {
  const { filteredPlayers, league, split } = useDashboard()
  const [sortKey, setSortKey] = useState<keyof Player>('kda')
  const [sortDesc, setSortDesc] = useState(true)
  const sectionRef = useScrollReveal(undefined, [league, split])

  const players = useMemo(
    () => filteredPlayers.filter(isDisplayablePlayer),
    [filteredPlayers],
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

  return (
    <div ref={sectionRef} className="page-section">
      <div className="card">
        <h2 className="card-title">Players</h2>
        <p className="card-subtitle">All players matching the current league and split filters.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="Player" columnKey="name" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Team" columnKey="team" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="League" columnKey="league" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Position" columnKey="position" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Games" columnKey="games" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="KDA" columnKey="kda" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="KP" columnKey="kp" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="DMG Share" columnKey="dmgShare" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={8}>No players match the current filters.</td>
                </tr>
              ) : (
                sorted.map((p) => (
                  <tr key={`${p.name}-${p.team}-${p.league}`}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-secondary">{p.team ?? '—'}</td>
                    <td className="text-secondary">{p.league ?? '—'}</td>
                    <td className="text-secondary uppercase">{p.position ?? '—'}</td>
                    <td className="text-secondary">{p.games ?? '—'}</td>
                    <td className="text-accent font-medium">{formatNum(p.kda, 2)}</td>
                    <td className="text-secondary">{formatPct(p.kp, 1)}</td>
                    <td className="text-secondary">{formatPct(p.dmgShare, 1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
