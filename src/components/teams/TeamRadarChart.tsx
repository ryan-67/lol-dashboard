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
import ChartFrame, { ChartReadout } from '../ui/ChartFrame'
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

  return (
    <ChartFrame
      className={`radar-card${highlighted ? ' radar-card-favorite' : ''}${compact ? ' radar-card-compact' : ''}`}
      kind="radar"
      drawKey={`${team.name}-${team.league}-${compact}`}
      title={
        compact ? (
          'Team Radar'
        ) : (
          <span className="entity-title-row">
            <TeamLogo name={team.name} size={24} />
            <EntityLink type="team" name={team.name} showIcon={false} />
          </span>
        )
      }
      subtitle={
        compact ? undefined : (
          <span className="entity-subtitle">
            <LeagueLogo league={team.league} size={16} />
            <span className="radar-card-league">{team.league}</span>
            <span className="radar-card-record">
              {' '}
              · {team.winrate.toFixed(1)}% WR · {team.wins}W-{team.losses}L
            </span>
          </span>
        )
      }
      meta={
        compact ? undefined : (
          <ChartReadout label="wr" value={`${team.winrate.toFixed(1)}%`} accent />
        )
      }
    >
      <div className="radar-chart-wrap">
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
              fillOpacity={0.18}
              strokeWidth={2.25}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}
