import { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import type { Champion } from '../hooks/useDashboardData'
import { formatNum, formatPct } from '../lib/format'
import {
  filterByRole,
  isDisplayableChampion,
  roleLabel,
  type RoleFilter,
} from '../lib/championAnalytics'
import {
  ChampionScatterPlot,
  MostOpChampion,
  PresenceBarChart,
  RisingFallingChampions,
  RoleFilterBar,
  TopPerformerCards,
} from '../components/champions'
import SortableTh from '../components/ui/SortableTh'
import { refreshScrollTrigger } from '../theme/animations'

export default function Champions() {
  const { filteredChampions, league, split } = useDashboard()
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [showTable, setShowTable] = useState(false)
  const [focusedName, setFocusedName] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<keyof Champion>('presence')
  const [sortDesc, setSortDesc] = useState(true)

  const champions = useMemo(
    () => filteredChampions.filter(isDisplayableChampion),
    [filteredChampions],
  )

  const roleFiltered = useMemo(
    () => filterByRole(champions, roleFilter),
    [champions, roleFilter],
  )

  useEffect(() => {
    requestAnimationFrame(() => refreshScrollTrigger())
  }, [roleFilter, league, split, showTable, focusedName, roleFiltered.length])

  const sorted = useMemo(() => {
    return [...roleFiltered].sort((a, b) => {
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
  }, [roleFiltered, sortKey, sortDesc])

  const toggleSort = (key: keyof Champion) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  return (
    <div className="page-section">
      <RoleFilterBar value={roleFilter} onChange={setRoleFilter} />

      {roleFiltered.length === 0 ? (
        <div className="empty-state">No champions match the current filters.</div>
      ) : (
        <>
          <MostOpChampion champions={roleFiltered} />
          <PresenceBarChart champions={roleFiltered} />
          <ChampionScatterPlot
            champions={roleFiltered}
            focusedName={focusedName}
            onFocus={setFocusedName}
          />
          <RisingFallingChampions champions={roleFiltered} />
          <TopPerformerCards champions={roleFiltered} />
        </>
      )}

      <div className="players-table-toggle">
        <button type="button" className="btn" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Hide Full Metrics Table' : 'Show Full Metrics Table'}
        </button>
      </div>

      {showTable && (
        <div className="card">
          <h2 className="card-title">Full Champion Metrics</h2>
          <p className="card-subtitle">
            {roleFilter === 'all'
              ? 'All champions in the current league and split.'
              : `Champions with ${roleLabel(roleFilter)} in their role pool.`}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Champion" columnKey="name" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Role" columnKey="primaryRole" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Games" columnKey="games" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Pick %" columnKey="pickRate" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Ban %" columnKey="banRate" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Presence %" columnKey="presence" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Win %" columnKey="winrate" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Avg KDA" columnKey="avgKda" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Avg CS@15" columnKey="avgCsd15" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Avg DPM" columnKey="avgDpm" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Avg Gold/min" columnKey="avgGoldPerMin" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={11}>No champions match the current filters.</td>
                  </tr>
                ) : (
                  sorted.map((c) => (
                    <tr key={c.name}>
                      <td className="font-medium">{c.name}</td>
                      <td className="text-secondary uppercase">
                        {(c.positions ?? []).join(', ') || '—'}
                      </td>
                      <td className="text-secondary">{c.games ?? c.picks}</td>
                      <td className="text-secondary">{formatPct(c.pickRate, 1)}</td>
                      <td className="text-secondary">{formatPct(c.banRate, 1)}</td>
                      <td className="text-accent font-medium">{formatPct(c.presence, 1)}</td>
                      <td className="text-secondary">{formatPct(c.winrate, 1)}</td>
                      <td className="text-secondary">{formatNum(c.avgKda, 2)}</td>
                      <td className="text-secondary">
                        {typeof c.avgCsd15 === 'number' ? `${c.avgCsd15 > 0 ? '+' : ''}${c.avgCsd15}` : '—'}
                      </td>
                      <td className="text-secondary">{formatNum(c.avgDpm, 0)}</td>
                      <td className="text-secondary">{formatNum(c.avgGoldPerMin, 1)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
