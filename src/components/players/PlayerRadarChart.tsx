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
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import {
  PLAYERS_ROLE_COLORS,
  buildRadarSeries,
  type RoleKey,
} from '../../lib/playerRadar'
import { animateRadarDraw } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface PlayerRadarChartProps {
  player: Player
  role: RoleKey
  cohort: Player[]
  compact?: boolean
}

export default function PlayerRadarChart({
  player,
  role,
  cohort,
  compact = false,
}: PlayerRadarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const color = PLAYERS_ROLE_COLORS[role]
  const data = buildRadarSeries(player, role, cohort)
  const chartHeight = compact ? 200 : 260

  const tooltipContent = makeChartTooltipContent(
    () => player.name,
    (props) => {
      const point = props.payload?.[0]?.payload as {
        label?: string
        formattedPlayer?: string
        formattedAvg?: string
      }
      if (!point?.label) return []
      return [
        { label: point.label, value: point.formattedPlayer ?? '—' },
        { label: 'Role avg', value: point.formattedAvg ?? '—' },
      ]
    },
  )

  useGSAP(
    () => {
      animateRadarDraw(chartRef.current)
    },
    { scope: chartRef, dependencies: [player.name, role, compact] },
  )

  return (
    <div className={compact ? 'radar-card radar-card-compact' : 'radar-card'}>
      <div className="radar-card-header">
        <h3 className="radar-card-title">{player.name}</h3>
        <p className="radar-card-subtitle">
          {player.team} · <span style={{ color }}>{role.toUpperCase()}</span>
        </p>
      </div>
      <div ref={chartRef} className="radar-chart-wrap">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius={compact ? '68%' : '72%'}>
            <PolarGrid stroke={CHART.grid} />
            <PolarAngleAxis
              dataKey="metric"
              tick={{
                fill: CHART.tick,
                fontSize: compact ? 9 : 10,
                fontFamily: CHART.fontFamily,
              }}
            />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip content={tooltipContent} />
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
              dot={{ r: 3, fill: color, strokeWidth: 0 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
