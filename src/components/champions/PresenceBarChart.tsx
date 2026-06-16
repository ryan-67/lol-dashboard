import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { buildPresenceBarData, totalGamesInCohort } from '../../lib/championAnalytics'
import type { Champion } from '../../hooks/useDashboardData'
import { useDashboard } from '../../context/DashboardContext'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

const presenceBarTooltip = makeChartTooltipContent(
  (props) => {
    const label = props.label
    return typeof label === 'string' ? label : undefined
  },
  (props) => {
    const row = props.payload?.[0]?.payload as {
      pickRate?: number
      banRate?: number
      presence?: number
      picks?: number
      bans?: number
    }
    if (!row) return []
    return [
      { label: 'Pick %', value: `${(row.pickRate ?? 0).toFixed(1)}%` },
      { label: 'Ban %', value: `${(row.banRate ?? 0).toFixed(1)}%` },
      { label: 'Presence', value: `${(row.presence ?? 0).toFixed(1)}%` },
      { label: 'Picks', value: String(Math.round(row.picks ?? 0)) },
      { label: 'Bans', value: String(Math.round(row.bans ?? 0)) },
    ]
  },
)

interface PresenceBarChartProps {
  champions: Champion[]
}

export default function PresenceBarChart({ champions }: PresenceBarChartProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const { filteredTeams } = useDashboard()
  const totalGames = useMemo(() => totalGamesInCohort(filteredTeams), [filteredTeams])
  const data = useMemo(
    () => buildPresenceBarData(champions, totalGames),
    [champions, totalGames],
  )

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [champions.length, totalGames] },
  )

  return (
    <ShareableChart ref={sectionRef} className="card page-section">
      <h2 className="card-title">Champion Presence</h2>
      <p className="card-subtitle">Top 20 by presence — pick rate (gold) vs ban rate (dim)</p>
      <div className="h-[520px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 88, bottom: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={[0, 200]}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={84}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: 11, fontFamily: CHART.fontFamily }}
            />
            <Tooltip content={presenceBarTooltip} />
            <Legend
              wrapperStyle={{
                fontFamily: CHART.fontFamily,
                fontSize: CHART.fontSize,
                color: CHART.tick,
              }}
            />
            <Bar
              dataKey="pickRate"
              name="Pick %"
              stackId="presence"
              fill={CHART.accent}
              stroke={CHART.accent}
            />
            <Bar
              dataKey="banRate"
              name="Ban %"
              stackId="presence"
              fill={CHART.accentDim}
              fillOpacity={0.55}
              stroke={CHART.accentDim}
              strokeDasharray="4 2"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ShareableChart>
  )
}
