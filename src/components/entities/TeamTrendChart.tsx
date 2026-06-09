import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TeamTrendPoint } from '../../lib/entities/entityAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

const tooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as unknown as TeamTrendPoint
    return row?.date
  },
  (props) => {
    const row = props.payload?.[0]?.payload as unknown as TeamTrendPoint
    if (!row) return []
    return [
      { label: 'Rolling WR', value: `${row.winrate.toFixed(1)}%` },
      { label: 'Avg GD@15', value: row.gd15.toFixed(1) },
    ]
  },
)

export default function TeamTrendChart({ points }: { points: TeamTrendPoint[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const data = useMemo(() => points, [points])
  useGSAP(() => scrollEntrance(ref.current), { scope: ref, dependencies: [data.length] })

  if (!data.length) {
    return (
      <div className="card">
        <h3 className="card-title">Performance Trend</h3>
        <div className="empty-state text-sm">No match history for trend.</div>
      </div>
    )
  }

  return (
    <div ref={ref} className="card">
      <h3 className="card-title">Performance Trend</h3>
      <p className="card-subtitle">Rolling winrate and average GD@15 over recent matches</p>
      <div className="entity-chart-body">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis dataKey="game" tick={{ fill: CHART.tick, fontSize: 10 }} />
            <YAxis yAxisId="wr" tick={{ fill: CHART.tick, fontSize: 10 }} domain={[0, 100]} />
            <YAxis yAxisId="gd" orientation="right" tick={{ fill: CHART.tick, fontSize: 10 }} />
            <Tooltip content={tooltip} />
            <Line
              yAxisId="wr"
              type="monotone"
              dataKey="winrate"
              stroke={CHART.accent}
              strokeWidth={2}
              dot={false}
              name="Winrate %"
            />
            <Line
              yAxisId="gd"
              type="monotone"
              dataKey="gd15"
              stroke="#5c8a8a"
              strokeWidth={1.5}
              dot={false}
              name="GD@15"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
