import { useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import type { Team } from '../hooks/useDashboardData'
import { formatNum, formatPct } from '../lib/format'
import SortableTh from '../components/ui/SortableTh'
import { useScrollReveal } from '../hooks/useScrollReveal'

function isDisplayableTeam(t: Team): boolean {
  return (
    Boolean(t?.name) &&
    typeof t.wins === 'number' &&
    typeof t.losses === 'number' &&
    !Array.isArray((t as Team & { positions?: unknown }).positions)
  )
}

export default function Teams() {
  const { filteredTeams, league, split } = useDashboard()
  const [sortKey, setSortKey] = useState<keyof Team>('winrate')
  const [sortDesc, setSortDesc] = useState(true)
  const sectionRef = useScrollReveal(undefined, [league, split])

  const teams = useMemo(
    () => filteredTeams.filter(isDisplayableTeam),
    [filteredTeams],
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

  return (
    <div ref={sectionRef} className="page-section">
      <div className="card">
        <h2 className="card-title">Teams</h2>
        <p className="card-subtitle">Team records and objective stats for the current filters.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="Team" columnKey="name" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="League" columnKey="league" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Games" columnKey="games" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="W" columnKey="wins" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="L" columnKey="losses" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Winrate" columnKey="winrate" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Avg KDA" columnKey="avgKda" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Avg GD@15" columnKey="avgGd15" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Towers" columnKey="towers" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Drakes" columnKey="dragons" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Barons" columnKey="barons" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Heralds" columnKey="heralds" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={12}>No teams match the current filters.</td>
                </tr>
              ) : (
                sorted.map((t) => (
                  <tr key={`${t.name}-${t.league}`}>
                    <td className="font-medium">{t.name}</td>
                    <td className="text-secondary">{t.league ?? '—'}</td>
                    <td className="text-secondary">{t.games ?? '—'}</td>
                    <td className="text-secondary">{t.wins ?? '—'}</td>
                    <td className="text-tertiary">{t.losses ?? '—'}</td>
                    <td className="text-accent font-medium">{formatPct(t.winrate, 1)}</td>
                    <td className="text-secondary">{formatNum(t.avgKda, 2)}</td>
                    <td className="text-secondary">
                      {typeof t.avgGd15 === 'number'
                        ? `${t.avgGd15 > 0 ? '+' : ''}${t.avgGd15}`
                        : '—'}
                    </td>
                    <td className="text-secondary">{t.towers ?? '—'}</td>
                    <td className="text-secondary">{t.dragons ?? '—'}</td>
                    <td className="text-secondary">{t.barons ?? '—'}</td>
                    <td className="text-secondary">{t.heralds ?? '—'}</td>
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
