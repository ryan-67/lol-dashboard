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
  ReferenceLine,
  Cell,
} from 'recharts'
import type { Champion } from '../../hooks/useDashboardData'
import { cohortAverages, getPickRate, roleColor } from '../../lib/championAnalytics'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface ChampionScatterPlotProps {
  champions: Champion[]
  focusedName: string | null
  onFocus: (name: string | null) => void
}

export default function ChampionScatterPlot({
  champions,
  focusedName,
  onFocus,
}: ChampionScatterPlotProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [hoverName, setHoverName] = useState<string | null>(null)
  const averages = cohortAverages(champions)

  const data = champions.map((c) => ({
    ...c,
    x: getPickRate(c),
    y: c.winrate,
    z: c.games ?? c.picks,
    key: c.name,
  }))

  const activeName = focusedName ?? hoverName

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [champions.length, focusedName] },
  )

  return (
    <div ref={sectionRef} className="card page-section">
      <h2 className="card-title">Win Rate vs Pick Rate</h2>
      <p className="card-subtitle">
        Dot size = games played · dashed lines = filter average
        {focusedName ? ` · focused: ${focusedName}` : ''}
      </p>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="Pick Rate"
              unit="%"
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Win Rate"
              unit="%"
              domain={[0, 100]}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 380]} />
            <ReferenceLine
              x={averages.pickRate}
              stroke="rgba(240, 236, 226, 0.25)"
              strokeDasharray="4 4"
            />
            <ReferenceLine
              y={averages.winrate}
              stroke="rgba(240, 236, 226, 0.25)"
              strokeDasharray="4 4"
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: CHART.grid }}
              contentStyle={CHART.tooltip}
              formatter={(value: number, name: string) => {
                if (name === 'Pick Rate' || name === 'Win Rate') return [`${value.toFixed(1)}%`, name]
                return [value, name]
              }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as Champion
                return row
                  ? `${row.name} · ${row.picks} picks · ${row.bans} bans · ${row.winrate.toFixed(1)}% WR`
                  : ''
              }}
            />
            <Scatter
              name="Champions"
              data={data}
              onClick={(p) => {
                const name = (p as { name: string }).name
                onFocus(activeName === name ? null : name)
              }}
              onMouseEnter={(p) => setHoverName((p as { name: string }).name)}
              onMouseLeave={() => setHoverName(null)}
            >
              {data.map((entry) => {
                const isActive = activeName === entry.name
                const base = roleColor(entry.primaryRole ?? entry.positions?.[0] ?? '')
                return (
                  <Cell
                    key={entry.name}
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
