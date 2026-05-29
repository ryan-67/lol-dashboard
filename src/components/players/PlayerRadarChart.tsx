import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { Player } from '../../hooks/useDashboardData'
import {
  PLAYERS_ROLE_COLORS,
  buildRadarSeries,
  type RoleKey,
} from '../../lib/playerRadar'
import { animateRadarDraw } from '../../theme/animations'
import { CHART, CHART_TOOLTIP_PROPS } from '../../theme/chartTheme'

interface PlayerRadarChartProps {
  player: Player
  role: RoleKey
  cohort: Player[]
}

export default function PlayerRadarChart({ player, role, cohort }: PlayerRadarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const color = PLAYERS_ROLE_COLORS[role]
  const data = buildRadarSeries(player, role, cohort)

  useGSAP(
    () => {
      animateRadarDraw(chartRef.current)
    },
    { scope: chartRef, dependencies: [player.name, role] },
  )

  return (
    <div className="radar-card">
      <div className="radar-card-header">
        <h3 className="radar-card-title">{player.name}</h3>
        <p className="radar-card-subtitle">
          {player.team} · <span style={{ color }}>{role.toUpperCase()}</span>
        </p>
      </div>
      <div ref={chartRef} className="radar-chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid stroke={CHART.grid} />
            <PolarAngleAxis
              dataKey="metric"
              tick={{
                fill: CHART.tick,
                fontSize: 10,
                fontFamily: CHART.fontFamily,
              }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Tooltip
              {...CHART_TOOLTIP_PROPS}
              formatter={(_, __, item) => {
                const payload = item?.payload as {
                  formattedPlayer?: string
                  formattedAvg?: string
                }
                return [
                  `${payload?.formattedPlayer ?? ''} (avg ${payload?.formattedAvg ?? ''})`,
                  player.name,
                ]
              }}
            />
            <Radar
              name="Role average"
              dataKey="avgNorm"
              stroke="rgba(240, 236, 226, 0.35)"
              fill="transparent"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
            <Radar
              name={player.name}
              dataKey="playerNorm"
              stroke={color}
              fill={color}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
