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
import { buildMiniRadarSeries } from '../../lib/matchupAnalytics'
import { CHART, CHART_TOOLTIP_PROPS, MATCHUP_COLORS } from '../../theme/chartTheme'

interface MiniPlayerRadarProps {
  playerA: Player
  playerB: Player
}

export default function MiniPlayerRadar({ playerA, playerB }: MiniPlayerRadarProps) {
  const data = buildMiniRadarSeries(playerA, playerB)

  return (
    <div className="mini-radar-wrap">
      <ResponsiveContainer width="100%" height={140}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="68%">
          <PolarGrid stroke={CHART.grid} />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fill: CHART.tick, fontSize: 8, fontFamily: CHART.fontFamily }}
          />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            formatter={(_, __, item) => {
              const payload = item?.payload as {
                formattedA?: string
                formattedB?: string
              }
              const side = item?.dataKey === 'playerBNorm' ? 'B' : 'A'
              const val = side === 'A' ? payload?.formattedA : payload?.formattedB
              return [val ?? '', side === 'A' ? playerA.name : playerB.name]
            }}
          />
          <Radar
            name={playerA.name}
            dataKey="playerANorm"
            stroke={MATCHUP_COLORS.teamA}
            fill={MATCHUP_COLORS.teamA}
            fillOpacity={0.12}
            strokeWidth={1.5}
          />
          <Radar
            name={playerB.name}
            dataKey="playerBNorm"
            stroke={MATCHUP_COLORS.teamB}
            fill={MATCHUP_COLORS.teamB}
            fillOpacity={0.08}
            strokeWidth={1.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
