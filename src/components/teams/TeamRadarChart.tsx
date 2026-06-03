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
import type { Team } from '../../hooks/useDashboardData'
import { buildTeamRadarSeries, leagueColor } from '../../lib/teamAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { animateRadarDraw } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface TeamRadarChartProps {
  team: Team
  cohort: Team[]
  highlighted?: boolean
}

export default function TeamRadarChart({ team, cohort, highlighted = false }: TeamRadarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const color = leagueColor(team.league)
  const data = buildTeamRadarSeries(team, cohort)

  const tooltipContent = makeChartTooltipContent(
    () => team.name,
    (props) => {
      const point = props.payload?.[0]?.payload as {
        metric?: string
        formatted?: string
        formattedAvg?: string
      }
      if (!point?.metric) return []
      return [
        { label: point.metric, value: point.formatted ?? '—' },
        { label: 'Cohort avg', value: point.formattedAvg ?? '—' },
      ]
    },
  )

  useGSAP(
    () => {
      animateRadarDraw(chartRef.current)
    },
    { scope: chartRef, dependencies: [team.name, team.league] },
  )

  return (
    <div className={`radar-card${highlighted ? ' radar-card-favorite' : ''}`}>
      <div className="radar-card-header">
        <h3 className="radar-card-title">{team.name}</h3>
        <p className="radar-card-subtitle">
          <span style={{ color }}>{team.league}</span> · {team.winrate.toFixed(1)}% WR · {team.wins}W-
          {team.losses}L
        </p>
      </div>
      <div ref={chartRef} className="radar-chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid stroke={CHART.grid} />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
            />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip content={tooltipContent} />
            <Radar
              name="League average"
              dataKey="avgNorm"
              stroke="rgba(240, 236, 226, 0.35)"
              fill="transparent"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
            <Radar
              name={team.name}
              dataKey="valueNorm"
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
