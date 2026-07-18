import { useEffect, useMemo, useState } from 'react'
import type { Player } from '../../hooks/useDashboardData'
import { formatNum, formatPct } from '../../lib/format'
import {
  ALL_PLAYER_RADAR_METRICS,
  computeAggregateScore,
  getMetricValue,
  normalizePosition,
  playersForRole,
  type RadarMetricKey,
  type RoleFilter,
} from '../../lib/playerRadar'
import { EntityLink } from '../entities'
import SegmentFilterBar from '../ui/SegmentFilterBar'
import SortableTh from '../ui/SortableTh'
import { fetchPlayerRatings, RATING_ROLES, type PlayerRatingsBundle } from '../../lib/loadPlayerRatings'
import { powerScoreTo100 } from '../../lib/scoreNormalize'

export type PlayerTableView = 'full' | 'rankings'

const VIEW_OPTIONS: { value: PlayerTableView; label: string }[] = [
  { value: 'full', label: 'Full Metrics' },
  { value: 'rankings', label: 'Statistical Player Rankings' },
]

type PlayerSortKey = keyof Player | 'perfScore' | RadarMetricKey

interface PlayerMetricsTableCardProps {
  players: Player[]
  filteredPlayers: Player[]
  roleFilter?: RoleFilter
  subtitle?: string
  className?: string
  defaultView?: PlayerTableView
}

interface PlayerRankingRow {
  player: Player
  score: number
  metrics: Partial<Record<RadarMetricKey, number | null>>
}

export default function PlayerMetricsTableCard({
  players,
  filteredPlayers,
  roleFilter = 'all',
  subtitle,
  className = '',
  defaultView = 'rankings',
}: PlayerMetricsTableCardProps) {
  const [view, setView] = useState<PlayerTableView>(defaultView)
  const [sortKey, setSortKey] = useState<PlayerSortKey>(
    defaultView === 'rankings' ? 'perfScore' : 'kda',
  )
  const [sortDesc, setSortDesc] = useState(true)
  const [ratingsBundle, setRatingsBundle] = useState<PlayerRatingsBundle | null>(null)

  useEffect(() => {
    let alive = true
    void fetchPlayerRatings().then((data) => {
      if (alive) setRatingsBundle(data)
    })
    return () => {
      alive = false
    }
  }, [])

  const modelScoreLookup = useMemo(() => {
    const map = new Map<string, number>()
    if (!ratingsBundle) return map
    for (const role of RATING_ROLES) {
      for (const row of ratingsBundle.roles[role] ?? []) {
        map.set(`${row.player.toLowerCase()}|${role}`, row.powerScore)
      }
    }
    return map
  }, [ratingsBundle])

  const rankingRows = useMemo<PlayerRankingRow[]>(() => {
    return filteredPlayers.map((player) => {
      const role = normalizePosition(player.position) ?? 'mid'
      const cohort = playersForRole(players, role)
      const metrics: Partial<Record<RadarMetricKey, number | null>> = {}
      for (const def of ALL_PLAYER_RADAR_METRICS) {
        metrics[def.key] = getMetricValue(player, def.key, { cohort, allowMissing: true })
      }
      const modelPowerScore = modelScoreLookup.get(`${player.name.toLowerCase()}|${role}`)
      const score =
        modelPowerScore != null
          ? powerScoreTo100(modelPowerScore) / 100
          : computeAggregateScore(player, role, cohort)
      return {
        player,
        score,
        metrics,
      }
    })
  }, [filteredPlayers, players, modelScoreLookup])

  const sortedRankingRows = useMemo(() => {
    return [...rankingRows].sort((a, b) => {
      if (sortKey === 'perfScore') {
        return sortDesc ? b.score - a.score : a.score - b.score
      }
      if (ALL_PLAYER_RADAR_METRICS.some((m) => m.key === sortKey)) {
        const av = a.metrics[sortKey as RadarMetricKey]
        const bv = b.metrics[sortKey as RadarMetricKey]
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDesc ? bv - av : av - bv
        }
        return sortDesc ? -1 : 1
      }
      const av = a.player[sortKey as keyof Player]
      const bv = b.player[sortKey as keyof Player]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDesc ? bv - av : av - bv
      }
      return sortDesc
        ? String(bv ?? '').localeCompare(String(av ?? ''))
        : String(av ?? '').localeCompare(String(bv ?? ''))
    })
  }, [rankingRows, sortDesc, sortKey])

  const sortedFullRows = useMemo(() => {
    return [...filteredPlayers].sort((a, b) => {
      const av = a[sortKey as keyof Player]
      const bv = b[sortKey as keyof Player]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDesc ? bv - av : av - bv
      }
      return sortDesc
        ? String(bv ?? '').localeCompare(String(av ?? ''))
        : String(av ?? '').localeCompare(String(bv ?? ''))
    })
  }, [filteredPlayers, sortDesc, sortKey])

  const toggleSort = (key: PlayerSortKey) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const handleViewChange = (next: PlayerTableView) => {
    setView(next)
    setSortKey(next === 'rankings' ? 'perfScore' : 'kda')
    setSortDesc(true)
  }

  const defaultSubtitle =
    roleFilter === 'all'
      ? 'All players in the current filter.'
      : `Players filtered to ${roleFilter.toUpperCase()}.`

  const perfRankByPlayer = useMemo(() => {
    const ordered = [...rankingRows].sort((a, b) => b.score - a.score)
    const map = new Map<string, number>()
    ordered.forEach((row, index) => {
      map.set(`${row.player.name}|${row.player.team}|${row.player.league}`, index + 1)
    })
    return map
  }, [rankingRows])

  return (
    <div className={`card${className ? ` ${className}` : ''}`}>
      <h2 className="card-title">Player Tables</h2>
      <p className="card-subtitle">{subtitle ?? defaultSubtitle}</p>
      <SegmentFilterBar
        value={view}
        onChange={handleViewChange}
        options={VIEW_OPTIONS}
        ariaLabel="Player table view"
      />

      {!filteredPlayers.length ? (
        <p className="text-secondary">No players match the current filters.</p>
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
                  label="Player"
                  columnKey="name"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Team"
                  columnKey="team"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Role"
                  columnKey="position"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Games"
                  columnKey="games"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                {ALL_PLAYER_RADAR_METRICS.map((def) => (
                  <SortableTh
                    key={def.key}
                    label={def.shortLabel}
                    columnKey={def.key}
                    sortKey={sortKey}
                    sortDesc={sortDesc}
                    onSort={toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRankingRows.map(({ player, score, metrics }) => {
                const rankKey = `${player.name}|${player.team}|${player.league}`
                const rank =
                  sortKey === 'perfScore' && sortDesc
                    ? sortedRankingRows.findIndex(
                        (r) =>
                          r.player.name === player.name &&
                          r.player.team === player.team &&
                          r.player.league === player.league,
                      ) + 1
                    : perfRankByPlayer.get(rankKey) ?? '—'
                return (
                  <tr key={rankKey}>
                    <td className="text-secondary">{rank}</td>
                    <td className="text-accent font-medium">{formatNum(score * 100, 1)}</td>
                    <td className="font-medium">
                      <EntityLink
                        type="player"
                        name={player.name}
                        player={player}
                        allPlayers={players}
                        showIcon={false}
                      />
                    </td>
                    <td className="text-secondary">
                      <EntityLink type="team" name={player.team ?? '—'} />
                    </td>
                    <td className="text-secondary uppercase">{player.position ?? '—'}</td>
                    <td className="text-secondary">{player.games ?? '—'}</td>
                    {ALL_PLAYER_RADAR_METRICS.map((def) => {
                      const value = metrics[def.key]
                      return (
                        <td key={def.key} className="text-secondary">
                          {value != null ? def.format(value) : '—'}
                        </td>
                      )
                    })}
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
                  label="Player"
                  columnKey="name"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Team"
                  columnKey="team"
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
                  label="Position"
                  columnKey="position"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Games"
                  columnKey="games"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="KDA"
                  columnKey="kda"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="KP"
                  columnKey="kp"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="DMG %"
                  columnKey="dmgShare"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="GD@15"
                  columnKey="gd15"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="CS@15"
                  columnKey="csd15"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="XP@15"
                  columnKey="xpd15"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="DPM"
                  columnKey="dpm"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Vision"
                  columnKey="visionScore"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Gold %"
                  columnKey="goldShare"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="FB %"
                  columnKey="firstBloodRate"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Obj Ctrl"
                  columnKey="objControl"
                  sortKey={sortKey}
                  sortDesc={sortDesc}
                  onSort={toggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {sortedFullRows.map((p) => (
                <tr key={`${p.name}-${p.team}-${p.league}`}>
                  <td className="font-medium">
                    <EntityLink type="player" name={p.name} player={p} allPlayers={players} showIcon={false} />
                  </td>
                  <td className="text-secondary">
                    <EntityLink type="team" name={p.team ?? '—'} />
                  </td>
                  <td className="text-secondary">{p.league ?? '—'}</td>
                  <td className="text-secondary uppercase">{p.position ?? '—'}</td>
                  <td className="text-secondary">{p.games ?? '—'}</td>
                  <td className="text-accent font-medium">{formatNum(p.kda, 2)}</td>
                  <td className="text-secondary">{formatPct(p.kp, 1)}</td>
                  <td className="text-secondary">{formatPct(p.dmgShare, 1)}</td>
                  <td className="text-secondary">
                    {typeof p.gd15 === 'number' ? `${p.gd15 > 0 ? '+' : ''}${p.gd15}` : '—'}
                  </td>
                  <td className="text-secondary">
                    {typeof p.csd15 === 'number' ? `${p.csd15 > 0 ? '+' : ''}${p.csd15}` : '—'}
                  </td>
                  <td className="text-secondary">
                    {typeof p.xpd15 === 'number' ? `${p.xpd15 > 0 ? '+' : ''}${p.xpd15}` : '—'}
                  </td>
                  <td className="text-secondary">{formatNum(p.dpm, 0)}</td>
                  <td className="text-secondary">{formatNum(p.visionScore, 1)}</td>
                  <td className="text-secondary">{formatPct(p.goldShare, 1)}</td>
                  <td className="text-secondary">{formatPct(p.firstBloodRate, 1)}</td>
                  <td className="text-secondary">{formatNum(p.objControl, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
