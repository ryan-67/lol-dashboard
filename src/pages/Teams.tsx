import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { useDashboard } from '../context/DashboardContext'
import type { Team } from '../hooks/useDashboardData'
import { formatNum, formatPct } from '../lib/format'
import {
  isDisplayableTeam,
  teamKey,
  type TeamScope,
  teamsForScope,
} from '../lib/teamAnalytics'
import {
  TeamFilterBar,
  TeamRadarGrid,
  TeamComparisonSection,
} from '../components/teams'
import SortableTh from '../components/ui/SortableTh'
import { EntityLink, LeagueLogo } from '../components/entities'
import { scrollEntranceStagger, refreshScrollTrigger } from '../theme/animations'

export default function Teams() {
  const { filteredTeams, filteredPlayers, filteredChampions, data, league, split } =
    useDashboard()
  const [scope, setScope] = useState<TeamScope>('top')
  const [compareKeys, setCompareKeys] = useState<string[]>([])
  const [showTable, setShowTable] = useState(false)
  const [sortKey, setSortKey] = useState<keyof Team>('winrate')
  const [sortDesc, setSortDesc] = useState(true)

  const teams = useMemo(
    () => filteredTeams.filter(isDisplayableTeam),
    [filteredTeams],
  )

  const scopeTeams = useMemo(() => teamsForScope(teams, scope), [teams, scope])
  const allTier1Selected = league === 'All Tier 1'

  const radarGridRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      scrollEntranceStagger(radarGridRef.current, '.radar-card')
    },
    { scope: radarGridRef, dependencies: [scope, league, split, teams.length] },
  )

  useEffect(() => {
    requestAnimationFrame(() => refreshScrollTrigger())
  }, [scope, league, split, showTable, compareKeys.length])

  const sorted = useMemo(() => {
    return [...scopeTeams].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDesc ? bv - av : av - bv
      }
      return sortDesc
        ? String(bv ?? '').localeCompare(String(av ?? ''))
        : String(av ?? '').localeCompare(String(bv ?? ''))
    })
  }, [scopeTeams, sortKey, sortDesc])

  const toggleSort = (key: keyof Team) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  return (
    <div className="page-section">
      <TeamFilterBar scope={scope} onScopeChange={setScope} />

      {teams.length === 0 ? (
        <div className="empty-state">No teams match the current filters.</div>
      ) : (
        <div ref={radarGridRef}>
          <TeamRadarGrid teams={teams} scope={scope} allTier1Selected={allTier1Selected} />
        </div>
      )}

      <TeamComparisonSection
        teams={teams}
        compareKeys={compareKeys}
        onCompareChange={setCompareKeys}
        players={filteredPlayers}
        teamChampions={data?.teamChampions ?? []}
        champions={filteredChampions}
      />

      <div className="players-table-toggle">
        <button type="button" className="btn" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Hide Full Metrics Table' : 'Show Full Metrics Table'}
        </button>
      </div>

      {showTable && (
        <div className="card">
          <h2 className="card-title">Full Team Metrics</h2>
          <p className="card-subtitle">
            {scope === 'top' ? 'Top team per league in current filter.' : 'All teams in current filter.'}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Team" columnKey="name" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="League" columnKey="league" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Wins" columnKey="wins" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Losses" columnKey="losses" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Win %" columnKey="winrate" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="GoldDiff@15" columnKey="avgGd15" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Dragons/Game" columnKey="dragonsPerGame" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Barons/Game" columnKey="baronsPerGame" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Towers/Game" columnKey="towersPerGame" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="First Blood %" columnKey="firstBloodRate" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Avg Game Duration" columnKey="avgGameLength" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={11}>No teams match the current filters.</td>
                  </tr>
                ) : (
                  sorted.map((t) => (
                    <tr key={teamKey(t)}>
                      <td className="font-medium">
                        <EntityLink type="team" name={t.name} />
                      </td>
                      <td className="text-secondary">
                        <span className="entity-inline-row">
                          <LeagueLogo league={t.league} size={16} />
                          {t.league}
                        </span>
                      </td>
                      <td className="text-secondary">{t.wins}</td>
                      <td className="text-tertiary">{t.losses}</td>
                      <td className="text-accent font-medium">{formatPct(t.winrate, 1)}</td>
                      <td className="text-secondary">
                        {typeof t.avgGd15 === 'number' ? `${t.avgGd15 > 0 ? '+' : ''}${t.avgGd15}` : '—'}
                      </td>
                      <td className="text-secondary">{formatNum(t.dragonsPerGame, 2)}</td>
                      <td className="text-secondary">{formatNum(t.baronsPerGame, 2)}</td>
                      <td className="text-secondary">{formatNum(t.towersPerGame, 2)}</td>
                      <td className="text-secondary">{formatPct(t.firstBloodRate, 1)}</td>
                      <td className="text-secondary">
                        {t.avgGameLength ? `${Math.round(t.avgGameLength / 60)}:${String(t.avgGameLength % 60).padStart(2, '0')}` : '—'}
                      </td>
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
