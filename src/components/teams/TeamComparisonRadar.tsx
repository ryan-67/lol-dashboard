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
  Legend,
} from 'recharts'
import type { Team } from '../../hooks/useDashboardData'
import {
  buildComparisonRadarData,
  COMPARISON_COLORS,
  leagueColor,
  teamKey,
} from '../../lib/teamAnalytics'
import { animateRadarDraw } from '../../theme/animations'
import { CHART, CHART_TOOLTIP_PROPS } from '../../theme/chartTheme'

interface TeamComparisonRadarProps {
  teams: Team[]
  cohort: Team[]
}

export default function TeamComparisonRadar({ teams, cohort }: TeamComparisonRadarProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const data = buildComparisonRadarData(teams, cohort)

  useGSAP(
    () => {
      animateRadarDraw(chartRef.current)
    },
    { scope: chartRef, dependencies: [teams.map((t) => teamKey(t)).join(',')] },
  )

  return (
    <div className="card page-section">
      <h2 className="card-title">Team Comparison</h2>
      <p className="card-subtitle">
        Overlay of {teams.length} teams vs league-relative average (dashed).
      </p>
      <div ref={chartRef} className="radar-chart-wrap" style={{ minHeight: 360 }}>
        <ResponsiveContainer width="100%" height={360}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke={CHART.grid} />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
            />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip {...CHART_TOOLTIP_PROPS} />
            <Legend
              wrapperStyle={{
                fontFamily: CHART.fontFamily,
                fontSize: CHART.fontSize,
                color: CHART.tick,
              }}
            />
            <Radar
              name="Cohort average"
              dataKey="avgNorm"
              stroke="rgba(240, 236, 226, 0.35)"
              fill="transparent"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
            {teams.map((team, index) => {
              const color = COMPARISON_COLORS[index % COMPARISON_COLORS.length] ?? leagueColor(team.league)
              return (
                <Radar
                  key={teamKey(team)}
                  name={`${team.name} (${team.league})`}
                  dataKey={`team${index}Norm`}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.08}
                  strokeWidth={2}
                />
              )
            })}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
