import { useMemo } from 'react'
import type { Champion, TeamChampion } from '../../hooks/useDashboardData'
import {
  buildChampionPowerRows,
  type RoleFilter,
} from '../../lib/championAnalytics'
import { formatNum, formatPct } from '../../lib/format'
import { opScoreTo100 } from '../../lib/scoreNormalize'
import { CHAMPION_POWER_RANKINGS_SUBTITLE, OP_SCORE_HINT } from '../../lib/metricHints'
import { ChampionEntityInline } from '../entities'

interface ChampionPowerTableProps {
  champions: Champion[]
  teamChampions?: TeamChampion[]
  limit?: number
  role?: RoleFilter
  title?: string
  subtitle?: string
  asOf?: Date
}

export default function ChampionPowerTable({
  champions,
  teamChampions = [],
  limit = 10,
  role = 'all',
  title = 'Champion Power Rankings',
  subtitle = CHAMPION_POWER_RANKINGS_SUBTITLE,
  asOf,
}: ChampionPowerTableProps) {
  const rows = useMemo(
    () =>
      buildChampionPowerRows(champions, {
        teamChampions,
        limit,
        role,
        asOf,
      }),
    [champions, teamChampions, limit, role, asOf],
  )

  const showPickOrder =
    rows.length > 0 &&
    rows.filter((row) => row.avgPickOrder != null).length >= Math.ceil(rows.length / 2)

  return (
    <section className="card overview-hub-card">
      <h2 className="card-title">{title}</h2>
      <p className="card-subtitle" title={OP_SCORE_HINT}>
        {subtitle}
      </p>
      {rows.length === 0 ? (
        <p className="text-secondary">Not enough champion data for the current filters.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Champion</th>
                <th title={OP_SCORE_HINT}>OP Score</th>
                <th>Win %</th>
                <th>Presence</th>
                <th>Pick %</th>
                <th>Ban %</th>
                {showPickOrder ? <th>Avg pick order</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.champion.name}>
                  <td className="text-secondary">#{row.rank}</td>
                  <td className="font-medium">
                    <ChampionEntityInline name={row.champion.name} iconSize={20} />
                  </td>
                  <td className="text-accent font-medium">
                    {formatNum(opScoreTo100(row.opScore), 1)}
                  </td>
                  <td className="text-secondary">{formatPct(row.winrate, 1)}</td>
                  <td className="text-secondary">{formatPct(row.presence, 1)}</td>
                  <td className="text-secondary">{formatPct(row.pickRate, 1)}</td>
                  <td className="text-secondary">{formatPct(row.banRate, 1)}</td>
                  {showPickOrder ? (
                    <td className="text-secondary">
                      {row.avgPickOrder != null ? formatNum(row.avgPickOrder, 1) : '—'}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
