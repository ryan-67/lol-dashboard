import { useMemo } from 'react'
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
import ChartFrame, { ChartReadout } from '../ui/ChartFrame'
import ChampionAxisTick from '../ui/ChampionAxisTick'
import { AXIS_PROPS, CHART, GRID_PROPS } from '../../theme/chartTheme'

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
  const { filteredTeams } = useDashboard()
  const totalGames = useMemo(() => totalGamesInCohort(filteredTeams), [filteredTeams])
  const data = useMemo(
    () => buildPresenceBarData(champions, totalGames),
    [champions, totalGames],
  )

  return (
    <ChartFrame
      className="page-section"
      kind="bars"
      drawKey={`${champions.length}-${totalGames}`}
      title="Champion Presence"
      subtitle="Top 20 by presence — pick rate (signal) vs ban rate (cream)"
      meta={<ChartReadout label="n" value={String(data.length)} accent />}
    >
      <div className="h-[520px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 96, bottom: 8 }}>
            <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
            <XAxis
              type="number"
              domain={[0, 200]}
              {...AXIS_PROPS}
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={92}
              {...AXIS_PROPS}
              tick={<ChampionAxisTick />}
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
              radius={[0, 2, 2, 0]}
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
    </ChartFrame>
  )
}
