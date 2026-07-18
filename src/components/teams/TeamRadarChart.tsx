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
import { buildTeamRadarSeries } from '../../lib/teamAnalytics'
import { radarColorForTeam } from '../../lib/entities/teamBrandColor'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { animateRadarDraw } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

import { EntityLink, TeamLogo, LeagueLogo } from '../entities'

interface TeamRadarChartProps {
  team: Team
  cohort: Team[]
  highlighted?: boolean
  compact?: boolean
}

export default function TeamRadarChart({
  team,
  cohort,
  highlighted = false,
  compact = false,
}: TeamRadarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const color = radarColorForTeam(team.name, team.league)
  const data = buildTeamRadarSeries(team, cohort)

  const tooltipContent = makeChartTooltipContent(
    () => team.name,
    (props) => {
      const point = props.payload?.[0]?.payload as {
        label?: string
        formatted?: string
        formattedAvg?: string
      }
      if (!point?.label) return []
      return [
        { label: point.label, value: point.formatted ?? '—' },
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
    <ShareableChart
      className={`radar-card${highlighted ? ' radar-card-favorite' : ''}${compact ? ' radar-card-compact' : ''}`}
    >
      {!compact ? (
        <div className="radar-card-header">
          <h3 className="radar-card-title entity-title-row">
            <TeamLogo name={team.name} size={24} />
            <EntityLink type="team" name={team.name} showIcon={false} />
          </h3>
          <p className="radar-card-subtitle entity-subtitle">
            <LeagueLogo league={team.league} size={16} />
            <span className="radar-card-league">{team.league}</span>
            <span className="radar-card-record">
              {' '}
              · {team.winrate.toFixed(1)}% WR · {team.wins}W-{team.losses}L
            </span>
          </p>
        </div>
      ) : (
        <h3 className="card-title">Team Radar</h3>
      )}
      <div ref={chartRef} className="radar-chart-wrap">
        <ResponsiveContainer width="100%" height={compact ? 200 : 260}>
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
    </ShareableChart>
  )
}
