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
import { buildComparisonRadarData } from '../../lib/teamAnalytics'
import { formatGameLength } from '../../lib/matchupAnalytics'
import { animateRadarDraw, scrollEntrance } from '../../theme/animations'
import { CHART, CHART_TOOLTIP_PROPS, MATCHUP_COLORS } from '../../theme/chartTheme'

interface TeamRadarComparisonProps {
  teamA: Team
  teamB: Team
  cohort: Team[]
}

function StatCell({ label, valueA, valueB }: { label: string; valueA: string; valueB: string }) {
  return (
    <div className="matchup-stat-cell">
      <div className="matchup-stat-label">{label}</div>
      <div className="matchup-stat-values">
        <span className="matchup-stat-value matchup-stat-value-a">{valueA}</span>
        <span className="matchup-stat-value matchup-stat-value-b">{valueB}</span>
      </div>
    </div>
  )
}

export default function TeamRadarComparison({ teamA, teamB, cohort }: TeamRadarComparisonProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const data = buildComparisonRadarData([teamA, teamB], cohort)

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [teamA.name, teamB.name] },
  )

  useGSAP(
    () => {
      animateRadarDraw(chartRef.current)
    },
    { scope: chartRef, dependencies: [teamA.name, teamB.name] },
  )

  return (
    <div ref={sectionRef} className="card page-section">
      <h2 className="card-title">Team Radar Comparison</h2>
      <p className="card-subtitle">
        {teamA.name} vs {teamB.name} — dashed line is cohort average
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
            <Tooltip
              {...CHART_TOOLTIP_PROPS}
              formatter={(_, __, item) => {
                const payload = item?.payload as Record<string, string | number>
                const index = item?.dataKey === 'team1Norm' ? 1 : 0
                const raw = payload?.[`team${index}Label`] ?? ''
                const avg = payload?.formattedAvg ?? ''
                return [`${raw} (avg ${avg})`, item?.name ?? '']
              }}
            />
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
            <Radar
              name={teamA.name}
              dataKey="team0Norm"
              stroke={MATCHUP_COLORS.teamA}
              fill={MATCHUP_COLORS.teamA}
              fillOpacity={0.1}
              strokeWidth={2}
            />
            <Radar
              name={teamB.name}
              dataKey="team1Norm"
              stroke={MATCHUP_COLORS.teamB}
              fill={MATCHUP_COLORS.teamB}
              fillOpacity={0.08}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="matchup-team-stats">
        <div className="matchup-team-stats-header">
          <span className="matchup-stat-team matchup-stat-value-a">{teamA.name}</span>
          <span className="matchup-stat-team matchup-stat-value-b">{teamB.name}</span>
        </div>
        <StatCell
          label="Win Rate"
          valueA={`${teamA.winrate.toFixed(1)}%`}
          valueB={`${teamB.winrate.toFixed(1)}%`}
        />
        <StatCell
          label="Avg Game Duration"
          valueA={formatGameLength(teamA.avgGameLength)}
          valueB={formatGameLength(teamB.avgGameLength)}
        />
        <StatCell
          label="First Blood %"
          valueA={
            typeof teamA.firstBloodRate === 'number' ? `${teamA.firstBloodRate.toFixed(1)}%` : '—'
          }
          valueB={
            typeof teamB.firstBloodRate === 'number' ? `${teamB.firstBloodRate.toFixed(1)}%` : '—'
          }
        />
        <StatCell
          label="Dragons / Game"
          valueA={(teamA.dragonsPerGame ?? 0).toFixed(2)}
          valueB={(teamB.dragonsPerGame ?? 0).toFixed(2)}
        />
        <StatCell
          label="Barons / Game"
          valueA={(teamA.baronsPerGame ?? 0).toFixed(2)}
          valueB={(teamB.baronsPerGame ?? 0).toFixed(2)}
        />
      </div>
    </div>
  )
}
