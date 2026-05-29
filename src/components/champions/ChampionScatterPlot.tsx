import { useMemo, useRef, useState } from 'react'
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
import { useDashboard } from '../../context/DashboardContext'
import {
  scatterCohortAverages,
  scatterPickRate,
  scatterWinRate,
  totalGamesInCohort,
  roleColor,
} from '../../lib/championAnalytics'
import { scrollEntrance } from '../../theme/animations'
import { CHART, CHART_TOOLTIP_PROPS } from '../../theme/chartTheme'

interface ChampionScatterPlotProps {
  champions: Champion[]
  focusedName: string | null
  onFocus: (name: string | null) => void
}

const AXIS_LABEL = {
  fill: CHART.tick,
  fontSize: CHART.fontSize,
  fontFamily: CHART.fontFamily,
}

const REF_LABEL = {
  value: 'Cohort average',
  position: 'insideTopRight' as const,
  fill: CHART.tick,
  fontSize: 11,
  fontFamily: CHART.fontFamily,
}

export default function ChampionScatterPlot({
  champions,
  focusedName,
  onFocus,
}: ChampionScatterPlotProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [hoverName, setHoverName] = useState<string | null>(null)
  const { filteredTeams } = useDashboard()

  const totalGames = useMemo(() => totalGamesInCohort(filteredTeams), [filteredTeams])
  const averages = useMemo(
    () => scatterCohortAverages(champions, totalGames),
    [champions, totalGames],
  )

  const data = useMemo(
    () =>
      champions.map((c) => ({
        ...c,
        x: scatterPickRate(c, totalGames),
        y: scatterWinRate(c),
        z: c.games ?? c.picks,
        key: c.name,
      })),
    [champions, totalGames],
  )

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
        Dot size = games played · dashed lines = cohort average
        {focusedName ? ` · focused: ${focusedName}` : ''}
      </p>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 24 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="Pick Rate"
              domain={[0, 100]}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => `${v}%`}
              label={{ value: 'Pick Rate', position: 'insideBottom', offset: -8, ...AXIS_LABEL }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Win Rate"
              domain={[0, 100]}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: 'Win Rate',
                angle: -90,
                position: 'insideLeft',
                ...AXIS_LABEL,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 380]} />
            <ReferenceLine
              x={averages.pickRate}
              stroke="rgba(240, 236, 226, 0.25)"
              strokeDasharray="4 4"
              label={REF_LABEL}
            />
            <ReferenceLine
              y={averages.winrate}
              stroke="rgba(240, 236, 226, 0.25)"
              strokeDasharray="4 4"
              label={REF_LABEL}
            />
            <Tooltip
              {...CHART_TOOLTIP_PROPS}
              cursor={{ strokeDasharray: '3 3', stroke: CHART.grid }}
              formatter={(value: number, name: string) => {
                const label = name === 'x' || name === 'Pick Rate' ? 'Pick Rate' : 'Win Rate'
                return [`${Number(value).toFixed(1)}%`, label]
              }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as Champion & { x: number; y: number }
                if (!row) return ''
                return `${row.name} · ${row.picks} picks · ${row.bans} bans`
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
