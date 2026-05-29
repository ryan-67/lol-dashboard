import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { Team } from '../../hooks/useDashboardData'
import { leagueColor } from '../../lib/teamAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

const teamScatterTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as { name?: string; league?: string }
    return row?.name ? `${row.name} (${row.league ?? ''})` : undefined
  },
  (props) => {
    const row = props.payload?.[0]?.payload as { x?: number; y?: number; games?: number }
    if (!row) return []
    const rows = []
    if (typeof row.x === 'number') {
      rows.push({ label: 'Gold Diff@15', value: `${row.x > 0 ? '+' : ''}${row.x}` })
    }
    if (typeof row.y === 'number') {
      rows.push({ label: 'Win Rate', value: `${row.y.toFixed(1)}%` })
    }
    if (typeof row.games === 'number') {
      rows.push({ label: 'Games', value: String(row.games) })
    }
    return rows
  },
)

interface TeamScatterPlotProps {
  teams: Team[]
}

export default function TeamScatterPlot({ teams }: TeamScatterPlotProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const data = teams.map((t) => ({
    ...t,
    x: t.avgGd15 ?? 0,
    y: t.winrate,
    z: t.games,
    key: `${t.name}|${t.league}`,
  }))

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [teams.length] },
  )

  return (
    <div ref={sectionRef} className="card page-section">
      <h2 className="card-title">Win Rate vs Early Game Gold</h2>
      <p className="card-subtitle">X = avg Gold Diff@15 · Y = win rate · dot size = games played</p>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="Gold Diff@15"
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Win Rate"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
            />
            <ZAxis type="number" dataKey="z" range={[80, 400]} />
            <Tooltip
              content={teamScatterTooltip}
              cursor={{ strokeDasharray: '3 3', stroke: CHART.grid }}
            />
            <Scatter
              name="Teams"
              data={data}
              onMouseEnter={(p) => setActiveKey((p as { key: string }).key)}
              onMouseLeave={() => setActiveKey(null)}
            >
              {data.map((entry) => {
                const isActive = activeKey === entry.key
                const base = leagueColor(entry.league)
                return (
                  <Cell
                    key={entry.key}
                    fill={isActive ? CHART.accent : base}
                    stroke={isActive ? CHART.accent : base}
                    strokeWidth={isActive ? 2 : 1}
                  />
                )
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
