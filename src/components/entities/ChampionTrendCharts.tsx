import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Champion } from '../../hooks/useDashboardData'
import { championWeeklyTrend } from '../../lib/entities/entityAnalytics'
import { getPresence } from '../../lib/championAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

const tooltip = makeChartTooltipContent(
  () => 'Weekly',
  (props) => {
    const row = props.payload?.[0]?.payload as { presence?: number; winrate?: number; picks?: number; bans?: number }
    if (!row) return []
    return [
      { label: 'Presence', value: `${(row.presence ?? 0).toFixed(1)}%` },
      { label: 'Winrate', value: `${(row.winrate ?? 0).toFixed(1)}%` },
      { label: 'Picks', value: String(row.picks ?? 0) },
      { label: 'Bans', value: String(row.bans ?? 0) },
    ]
  },
)

export default function ChampionTrendCharts({
  champion,
  totalGames,
}: {
  champion: Champion
  totalGames: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const weekly = useMemo(() => championWeeklyTrend(champion), [champion])
  useGSAP(() => scrollEntrance(ref.current), { scope: ref, dependencies: [weekly.length] })

  if (!weekly.length) {
    return (
      <div className="card">
        <h3 className="card-title">Trends</h3>
        <div className="empty-state text-sm">No weekly trend data.</div>
      </div>
    )
  }

  return (
    <div ref={ref} className="card">
      <h3 className="card-title">Presence & Winrate Trends</h3>
      <p className="card-subtitle">
        Overall presence {getPresence(champion, totalGames).toFixed(1)}% · WR {champion.winrate.toFixed(1)}%
      </p>
      <div className="entity-chart-body">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={weekly}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="week"
              tick={{ fill: CHART.tick, fontSize: 9, fontFamily: CHART.fontFamily }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fill: CHART.tick, fontSize: 10 }} />
            <Tooltip content={tooltip} />
            <Legend wrapperStyle={{ fontFamily: CHART.fontFamily, fontSize: CHART.fontSize, color: CHART.tick }} />
            <Line type="monotone" dataKey="presence" stroke={CHART.accent} strokeWidth={2} dot={false} name="Presence %" />
            <Line type="monotone" dataKey="winrate" stroke="#5c8a8a" strokeWidth={1.5} dot={false} name="Winrate %" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
