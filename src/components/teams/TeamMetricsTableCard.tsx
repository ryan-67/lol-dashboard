import { useMemo, useState } from 'react'
import type { Player, Team } from '../../hooks/useDashboardData'
import { formatNum, formatPct } from '../../lib/format'
import {
  computeTeamScore,
  getTeamRadarRaw,
  TEAM_RANKINGS_STAT_COLUMNS,
  teamKey,
  type TeamRadarMetricKey,
  type TeamTableStatColumn,
} from '../../lib/teamAnalytics'
import { EntityLink, LeagueLogo } from '../entities'
import SegmentFilterBar from '../ui/SegmentFilterBar'
import SortableTh from '../ui/SortableTh'

export type TeamTableView = 'full' | 'rankings'

const VIEW_OPTIONS: { value: TeamTableView; label: string }[] = [
  { value: 'full', label: 'Full Metrics' },
  { value: 'rankings', label: 'Statistical Team Rankings' },
]

type TeamSortKey = keyof Team | 'perfScore' | TeamRadarMetricKey

interface TeamMetricsTableCardProps {
  teams: Team[]
  players?: Player[]
  subtitle?: string
  className?: string
  defaultView?: TeamTableView
}

interface TeamRankingRow {
  team: Team
  score: number
}

function sortTeamRows(
  rows: TeamRankingRow[],
  sortKey: TeamSortKey,
  sortDesc: boolean,
  cohort: Team[],
): TeamRankingRow[] {
  return [...rows].sort((a, b) => {
    if (sortKey === 'perfScore') {
      return sortDesc ? b.score - a.score : a.score - b.score
    }
    const radarCol = TEAM_RANKINGS_STAT_COLUMNS.find((c) => c.sortKey === sortKey)
    if (radarCol) {
      const av = getTeamRadarRaw(a.team, sortKey as TeamRadarMetricKey, cohort)
      const bv = getTeamRadarRaw(b.team, sortKey as TeamRadarMetricKey, cohort)
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDesc ? bv - av : av - bv
      }
      const rawAv = a.team[sortKey as keyof Team]
      const rawBv = b.team[sortKey as keyof Team]
      if (typeof rawAv === 'number' && typeof rawBv === 'number') {
        return sortDesc ? rawBv - rawAv : rawAv - rawBv
      }
      return sortDesc ? -1 : 1
    }
    const av = a.team[sortKey as keyof Team]
    const bv = b.team[sortKey as keyof Team]
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDesc ? bv - av : av - bv
    }
    return sortDesc
      ? String(bv ?? '').localeCompare(String(av ?? ''))
      : String(av ?? '').localeCompare(String(bv ?? ''))
  })
}

export default function TeamMetricsTableCard({
  teams,
  players = [],
  subtitle = 'All teams in the current filter.',
  className = '',
  defaultView = 'rankings',
}: TeamMetricsTableCardProps) {
  const [view, setView] = useState<TeamTableView>(defaultView)
  const [sortKey, setSortKey] = useState<TeamSortKey>(
    defaultView === 'rankings' ? 'perfScore' : 'winrate',
  )
  const [sortDesc, setSortDesc] = useState(true)

  const rankingRows = useMemo<TeamRankingRow[]>(() => {
    return teams.map((team) => ({
      team,
      score: computeTeamScore(team, teams, players),
    }))
  }, [teams, players])

  const perfRankByTeam = useMemo(() => {
    const ordered = [...rankingRows].sort((a, b) => b.score - a.score)
    const map = new Map<string, number>()
    ordered.forEach((row, index) => {
      map.set(teamKey(row.team), index + 1)
    })
    return map
  }, [rankingRows])

  const sortedRankingRows = useMemo(
    () => sortTeamRows(rankingRows, sortKey, sortDesc, teams),
    [rankingRows, sortKey, sortDesc, teams],
  )

  const sortedFullRows = useMemo(() => {
    return [...teams].sort((a, b) => {
      const av = a[sortKey as keyof Team]
      const bv = b[sortKey as keyof Team]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDesc ? bv - av : av - bv
      }
      return sortDesc
        ? String(bv ?? '').localeCompare(String(av ?? ''))
        : String(av ?? '').localeCompare(String(bv ?? ''))
    })
  }, [teams, sortDesc, sortKey])

  const toggleSort = (key: TeamSortKey) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const handleViewChange = (next: TeamTableView) => {
    setView(next)
    setSortKey(next === 'rankings' ? 'perfScore' : 'winrate')
    setSortDesc(true)
  }

  const statColumns: TeamTableStatColumn[] = TEAM_RANKINGS_STAT_COLUMNS

  return (
    <div className={`card${className ? ` ${className}` : ''}`}>
      <h2 className="card-title">Team Tables</h2>
      <p className="card-subtitle">{subtitle}</p>
      <SegmentFilterBar
        value={view}
        onChange={handleViewChange}
        options={VIEW_OPTIONS}
        ariaLabel="Team table view"
      />

      {!teams.length ? (
        <p className="text-secondary">No teams match the current filters.</p>
      ) : view === 'rankings' ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <SortableTh
                  label="Perf"
                  columnKey="perfScore"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Team"
                  columnKey="name"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="League"
                  columnKey="league"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="W-L"
                  columnKey="wins"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Win %"
                  columnKey="winrate"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                {statColumns.map((col) => (
                  <SortableTh
                    key={String(col.sortKey)}
                    label={col.label}
                    columnKey={col.sortKey}
                    sortKey={sortKey}
                    sortDesc={sortDesc}
                    onSort={toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRankingRows.map(({ team, score }, index) => {
                const key = teamKey(team)
                const rank =
                  sortKey === 'perfScore' && sortDesc ? index + 1 : perfRankByTeam.get(key) ?? '—'
                return (
                  <tr key={key}>
                    <td className="text-secondary">{rank}</td>
                    <td className="text-accent font-medium">{formatNum(score * 100, 1)}</td>
                    <td className="font-medium">
                      <EntityLink type="team" name={team.name} />
                    </td>
                    <td className="text-secondary">
                      <span className="entity-inline-row">
                        <LeagueLogo league={team.league} size={16} />
                        {team.league}
                      </span>
                    </td>
                    <td className="text-secondary">
                      {team.wins}-{team.losses}
                    </td>
                    <td className="text-accent font-medium">{formatPct(team.winrate, 1)}</td>
                    {statColumns.map((col) => (
                      <td key={String(col.sortKey)} className="text-secondary">
                        {col.format(team, teams)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh
                  label="Team"
                  columnKey="name"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="League"
                  columnKey="league"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Wins"
                  columnKey="wins"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Losses"
                  columnKey="losses"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Win %"
                  columnKey="winrate"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="GoldDiff@15"
                  columnKey="avgGd15"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Dragons/Game"
                  columnKey="dragonsPerGame"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Barons/Game"
                  columnKey="baronsPerGame"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Towers/Game"
                  columnKey="towersPerGame"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="First Blood %"
                  columnKey="firstBloodRate"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Avg Game Duration"
                  columnKey="avgGameLength"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {sortedFullRows.map((t) => (
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
                    {t.avgGameLength
                      ? `${Math.round(t.avgGameLength / 60)}:${String(t.avgGameLength % 60).padStart(2, '0')}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
