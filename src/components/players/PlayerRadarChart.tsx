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
import ChartFrame, { ChartReadout } from '../ui/ChartFrame'
import { EntityLink } from '../entities'
import { radarColorForPlayer } from '../../lib/entities/teamBrandColor'
import {
  buildRadarSeries,
  type RoleKey,
} from '../../lib/playerRadar'
import { CHART } from '../../theme/chartTheme'

interface PlayerRadarChartProps {
  player: Player
  role: RoleKey
  cohort: Player[]
  compact?: boolean
  /** Hide card header when parent already shows player / team / role (e.g. Overview hub). */
  hideHeader?: boolean
}

export default function PlayerRadarChart({
  player,
  role,
  cohort,
  compact = false,
  hideHeader = false,
}: PlayerRadarChartProps) {
  const plotKey = `${player.name}-${role}-${compact}`
  const color = radarColorForPlayer(player.team, player.league)
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

  return (
    <ChartFrame
      className={compact ? 'radar-card radar-card-compact' : 'radar-card'}
      kind="radar"
      drawKey={plotKey}
      hideShare={compact}
      title={
        hideHeader ? undefined : (
          <EntityLink type="player" name={player.name} player={player} showIcon={false} />
        )
      }
      subtitle={
        hideHeader ? undefined : (
          <span className="entity-inline-row">
            <EntityLink type="team" name={player.team} />
            <span> · </span>
            <span style={{ color }}>{role.toUpperCase()}</span>
          </span>
        )
      }
      meta={hideHeader ? undefined : <ChartReadout label="role" value={role.toUpperCase()} accent />}
    >
      <div className="radar-chart-wrap">
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
              fillOpacity={0.18}
              strokeWidth={2.25}
              dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}
