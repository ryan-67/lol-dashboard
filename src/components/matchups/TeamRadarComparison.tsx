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
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ChartFrame from '../ui/ChartFrame'
import { TeamLogo } from '../entities'
import { buildComparisonRadarData } from '../../lib/teamAnalytics'
import { formatGameLength } from '../../lib/matchupAnalytics'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'
import { radarColorForTeam } from '../../lib/entities/teamBrandColor'

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

const teamRadarTooltip = makeChartTooltipContent(
  (props) => {
    const point = props.payload?.[0]?.payload as { label?: string; metric?: string }
    return point?.label ?? point?.metric ?? (typeof props.label === 'string' ? props.label : undefined)
  },
  (props) => {
    if (!props.payload?.length) return []
    const point = props.payload[0]?.payload as Record<string, string | number>
    return props.payload
      .filter((item) => item.dataKey !== undefined)
      .map((item) => {
        let value = '—'
        if (item.dataKey === 'avgNorm') {
          value = String(point?.formattedAvg ?? '—')
        } else if (item.dataKey === 'team0Norm') {
          value = String(point?.team0Label ?? '—')
        } else if (item.dataKey === 'team1Norm') {
          value = String(point?.team1Label ?? '—')
        }
        return { label: String(item.name ?? ''), value }
      })
  },
)

export default function TeamRadarComparison({ teamA, teamB, cohort }: TeamRadarComparisonProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const data = buildComparisonRadarData([teamA, teamB], cohort)
  const colorA = radarColorForTeam(teamA.name, teamA.league)
  const colorB = radarColorForTeam(teamB.name, teamB.league)

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [teamA.name, teamB.name] },
  )

  return (
    <div ref={sectionRef} className="page-section matchup-radar-section">
      <ChartFrame
        kind="radar"
        drawKey={`${teamA.name}-${teamB.name}`}
        title="Team Radar Comparison"
        subtitle={
          <span className="entity-inline-row">
            <TeamLogo name={teamA.name} size={20} />
            <span>{teamA.name}</span>
            <span className="text-secondary"> vs </span>
            <TeamLogo name={teamB.name} size={20} />
            <span>{teamB.name}</span>
            <span className="text-secondary"> — dashed line is cohort average</span>
          </span>
        }
        footer={
          <div className="matchup-radar-legend">
            <span className="matchup-radar-legend-item entity-inline-row">
              <span className="matchup-radar-legend-swatch" style={{ background: colorA }} />
              <TeamLogo name={teamA.name} size={16} />
              <span>{teamA.name}</span>
            </span>
            <span className="matchup-radar-legend-item entity-inline-row">
              <span className="matchup-radar-legend-swatch" style={{ background: colorB }} />
              <TeamLogo name={teamB.name} size={16} />
              <span>{teamB.name}</span>
            </span>
            <span className="matchup-radar-legend-item">
              <span
                className="matchup-radar-legend-swatch"
                style={{
                  background: 'transparent',
                  borderBottom: '2px dashed rgba(240, 236, 226, 0.35)',
                }}
              />
              Cohort average
            </span>
          </div>
        }
      >
        <div className="radar-chart-wrap" style={{ minHeight: 360 }}>
          <ResponsiveContainer width="100%" height={360}>
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke={CHART.grid} />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Tooltip content={teamRadarTooltip} />
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
                stroke={colorA}
                fill={colorA}
                fillOpacity={0.16}
                strokeWidth={2.25}
                dot={{ r: 3.5, fill: colorA, strokeWidth: 0 }}
              />
              <Radar
                name={teamB.name}
                dataKey="team1Norm"
                stroke={colorB}
                fill={colorB}
                fillOpacity={0.16}
                strokeWidth={2.25}
                dot={{ r: 3.5, fill: colorB, strokeWidth: 0 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>

      <div className="matchup-team-stats">
        <div className="matchup-team-stats-header">
          <span className="matchup-stat-team matchup-stat-value-a entity-inline-row">
            <TeamLogo name={teamA.name} size={18} />
            <span>{teamA.name}</span>
          </span>
          <span className="matchup-stat-team matchup-stat-value-b entity-inline-row">
            <TeamLogo name={teamB.name} size={18} />
            <span>{teamB.name}</span>
          </span>
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
