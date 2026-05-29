import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { Player } from '../../hooks/useDashboardData'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { buildConsistencyData } from '../../lib/playerAnalytics'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface PlayerConsistencyStripProps {
  players: Player[]
  cohortPlayers: Player[]
}

const WIN_COLOR = '#5c9e5a'
const LOSS_COLOR = '#c45c5c'

function ResultDot(props: unknown) {
  const { cx, cy, payload } = props as {
    cx?: number
    cy?: number
    payload?: { result?: number }
  }
  if (cx == null || cy == null) return <g />
  const fill = payload?.result === 1 ? WIN_COLOR : LOSS_COLOR
  return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="none" />
}

const consistencyTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as { playerName?: string }
    return row?.playerName
  },
  (props) => {
    const row = props.payload?.[0]?.payload as {
      game?: number
      score?: number
      result?: number
    }
    if (!row) return []
    return [
      { label: 'Game', value: String(row.game ?? '') },
      { label: 'Score', value: (row.score ?? 0).toFixed(3) },
      { label: 'Result', value: row.result === 1 ? 'Win' : 'Loss' },
    ]
  },
)

export default function PlayerConsistencyStrip({
  players,
  cohortPlayers,
}: PlayerConsistencyStripProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const stats = useMemo(
    () => buildConsistencyData(players, cohortPlayers, 20),
    [players, cohortPlayers],
  )

  const scatterData = useMemo(
    () =>
      stats.points.map((p) => ({
        ...p,
        x: p.game + p.jitter,
      })),
    [stats.points],
  )

  const byPlayer = useMemo(() => {
    const map = new Map<string, typeof scatterData>()
    for (const point of scatterData) {
      const list = map.get(point.playerKey) ?? []
      list.push(point)
      map.set(point.playerKey, list)
    }
    return [...map.entries()]
  }, [scatterData])

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [scatterData.length] },
  )

  if (!scatterData.length) {
    return (
      <div className="card player-chart-card player-chart-card-wide">
        <h3 className="card-title">Game-to-Game Consistency</h3>
        <div className="empty-state text-sm">No game log data for selected players.</div>
      </div>
    )
  }

  return (
    <div ref={sectionRef} className="card player-chart-card player-chart-card-wide">
      <div className="player-chart-header-row">
        <div>
          <h3 className="card-title">Game-to-Game Consistency</h3>
          <p className="card-subtitle">Every game as a dot · green win · red loss</p>
        </div>
        <div className="player-consistency-stat text-secondary">
          Std Dev: <span className="text-accent">{stats.stdDev.toFixed(3)}</span>
        </div>
      </div>
      <div className="player-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="Game"
              domain={[0.5, 'dataMax + 0.5']}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => String(Math.round(Number(v)))}
            />
            <YAxis
              type="number"
              dataKey="score"
              name="Score"
              domain={[0, 1]}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => Number(v).toFixed(2)}
            />
            <ZAxis range={[40, 40]} />
            <Tooltip
              content={consistencyTooltip}
              cursor={{ strokeDasharray: '3 3', stroke: CHART.grid }}
            />
            <ReferenceLine y={stats.mean} stroke={CHART.accent} strokeWidth={1.5} />
            <ReferenceLine
              y={stats.plusOne}
              stroke="rgba(240, 236, 226, 0.35)"
              strokeDasharray="4 4"
            />
            <ReferenceLine
              y={stats.minusOne}
              stroke="rgba(240, 236, 226, 0.35)"
              strokeDasharray="4 4"
            />
            {byPlayer.map(([key, data]) => (
              <Scatter
                key={key}
                name={data[0]?.playerName ?? key}
                data={data}
                shape={ResultDot}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
