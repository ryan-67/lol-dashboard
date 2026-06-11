import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Player } from '../../hooks/useDashboardData'
import { buildPlayerChampionStats } from '../../lib/playerAnalytics'
import { ROLE_METRICS, type RoleKey } from '../../lib/playerRadar'
import { formatPct } from '../../lib/format'
import { scrollEntrance } from '../../theme/animations'
import ChampionEntityInline from './ChampionEntityInline'

interface PlayerChampionTableProps {
  player: Player
  role: RoleKey
}

export default function PlayerChampionTable({ player, role }: PlayerChampionTableProps) {
  const ref = useRef<HTMLDivElement>(null)
  const metrics = ROLE_METRICS[role]
  const rows = useMemo(() => buildPlayerChampionStats(player, role), [player, role])

  useGSAP(() => scrollEntrance(ref.current), { scope: ref, dependencies: [rows.length, role] })

  if (!rows.length) {
    return (
      <div className="card">
        <h3 className="card-title">Champion Pool</h3>
        <div className="empty-state text-sm">No champion pool data.</div>
      </div>
    )
  }

  return (
    <div ref={ref} className="card">
      <h3 className="card-title">Champion Pool</h3>
      <p className="card-subtitle">Per-champion stats for {player.name}</p>
      <div className="entity-table-wrap">
        <table className="entity-table entity-table-compact">
          <thead>
            <tr>
              <th>Champion</th>
              <th>Games</th>
              <th>Winrate</th>
              {metrics.map((m) => (
                <th key={m.key}>{m.shortLabel}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.champion}>
                <td>
                  <ChampionEntityInline name={row.champion} iconSize={20} />
                </td>
                <td>{row.games}</td>
                <td>{formatPct(row.winrate, 1)}</td>
                {metrics.map((m) => {
                  const value = row.metrics[m.key]
                  return (
                    <td key={m.key}>{value != null ? m.format(value) : '—'}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
