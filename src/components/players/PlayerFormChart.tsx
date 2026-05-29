import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Player } from '../../hooks/useDashboardData'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { buildFormTrajectorySeries, type FormTrajectorySeries } from '../../lib/playerAnalytics'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface PlayerFormChartProps {
  players: Player[]
  cohortPlayers: Player[]
}

const formTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as unknown as FormTrajectorySeries['points'][number]
    return row?.playerName
  },
  (props) => {
    const row = props.payload?.[0]?.payload as unknown as FormTrajectorySeries['points'][number]
    if (!row) return []
    const rows = [
      { label: 'Game', value: String(row.game) },
      { label: 'Score', value: row.rawScore.toFixed(3) },
      { label: 'Rolling avg', value: row.rollingScore.toFixed(3) },
    ]
    if (row.opponent) rows.push({ label: 'Opponent', value: row.opponent })
    rows.push({ label: 'Result', value: row.result === 1 ? 'Win' : 'Loss' })
    if (row.champion) rows.push({ label: 'Champion', value: row.champion })
    return rows
  },
)

export default function PlayerFormChart({ players, cohortPlayers }: PlayerFormChartProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const series = useMemo(
    () => buildFormTrajectorySeries(players, cohortPlayers, 20),
    [players, cohortPlayers],
  )

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [series.length] },
  )

  if (!series.length || series.every((s) => !s.points.length)) {
    return (
      <div className="card player-chart-card">
        <h3 className="card-title">Form Trajectory</h3>
        <div className="empty-state text-sm">No game log data for selected players.</div>
      </div>
    )
  }

  return (
    <div ref={sectionRef} className="card player-chart-card">
      <h3 className="card-title">Form Trajectory</h3>
      <p className="card-subtitle">Composite score · 3-game rolling average · dotted trend</p>
      <div className="player-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="game"
              type="number"
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              label={{
                value: 'Game',
                position: 'insideBottom',
                offset: -4,
                fill: CHART.tick,
                fontSize: CHART.fontSize,
                fontFamily: CHART.fontFamily,
              }}
            />
            <YAxis
              domain={[0, 1]}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => v.toFixed(2)}
            />
            <Tooltip content={formTooltip} />
            <Legend
              wrapperStyle={{
                fontFamily: CHART.fontFamily,
                fontSize: CHART.fontSize,
                color: CHART.tick,
              }}
            />
            {series.map((s) => (
              <Line
                key={`${s.playerKey}-rolling`}
                name={s.playerName}
                data={s.points}
                type="monotone"
                dataKey="rollingScore"
                stroke={s.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
            {series.map((s) => (
              <Line
                key={`${s.playerKey}-trend`}
                name={`${s.playerName} trend`}
                data={s.points}
                type="linear"
                dataKey="trendScore"
                stroke={s.color}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                legendType="none"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
