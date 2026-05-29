import { useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import type { Champion } from '../hooks/useDashboardData'
import { formatNum, formatPct } from '../lib/format'
import SortableTh from '../components/ui/SortableTh'
import { useScrollReveal } from '../hooks/useScrollReveal'

function isDisplayableChampion(c: Champion): boolean {
  return Boolean(c?.name) && Array.isArray(c.positions)
}

export default function Champions() {
  const { filteredChampions, league, split } = useDashboard()
  const [sortKey, setSortKey] = useState<keyof Champion>('presence')
  const [sortDesc, setSortDesc] = useState(true)
  const sectionRef = useScrollReveal(undefined, [league, split])

  const champions = useMemo(
    () => filteredChampions.filter(isDisplayableChampion),
    [filteredChampions],
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

  return (
    <div ref={sectionRef} className="page-section">
      <div className="card">
        <h2 className="card-title">Champions</h2>
        <p className="card-subtitle">Pick, ban, and performance rates for the current filters.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="Champion" columnKey="name" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Positions" columnKey="positions" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Picks" columnKey="picks" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Bans" columnKey="bans" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Presence" columnKey="presence" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Winrate" columnKey="winrate" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                <SortableTh label="Avg KDA" columnKey="avgKda" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={7}>No champions match the current filters.</td>
                </tr>
              ) : (
                sorted.map((c) => (
                  <tr key={c.name}>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-secondary text-xs uppercase">
                      {(c.positions ?? []).join(', ') || '—'}
                    </td>
                    <td className="text-secondary">{c.picks ?? '—'}</td>
                    <td className="text-secondary">{c.bans ?? '—'}</td>
                    <td className="text-accent font-medium">{formatPct(c.presence, 1)}</td>
                    <td className="text-secondary">{formatPct(c.winrate, 1)}</td>
                    <td className="text-secondary">{formatNum(c.avgKda, 2)}</td>
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
