import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Team } from '../../hooks/useDashboardData'
import {
  STAT_AXIS_KIND,
  buildTeamComparisonStatRows,
  statChartTickFormat,
  statChartYDomain,
  teamRecordLabel,
  type StatAxisKind,
} from '../../lib/teamComparisonAnalytics'
import { teamKey } from '../../lib/teamAnalytics'
import { radarColorForTeam } from '../../lib/entities/teamBrandColor'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { TeamLogo } from '../entities'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface TeamComparisonStatsChartProps {
  teams: Team[]
  players: import('../../hooks/useDashboardData').Player[]
}

const miniChartTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as { name?: string }
    return row?.name
  },
  (props) => {
    const row = props.payload?.[0]?.payload as { formatted?: string }
    if (!row) return []
    return [{ label: 'Value', value: row.formatted ?? '—' }]
  },
)

function StatMiniChart({
  label,
  metric,
  teams,
  row,
  colors,
}: {
  label: string
  metric: string
  teams: Team[]
  row: Record<string, string | number>
  colors: string[]
}) {
  const axisKind: StatAxisKind = STAT_AXIS_KIND[metric] ?? 'count'
  const chartData = teams.map((team, index) => ({
    name: team.name,
    value: Number(row[`team${index}`] ?? 0),
    formatted: String(row[`team${index}Label`] ?? '—'),
    fill: colors[index] ?? '#c5a059',
  }))
  const yDomain = statChartYDomain(
    chartData.map((d) => d.value),
    axisKind,
  )

  return (
    <div className="team-stat-mini-chart card">
      <h4 className="team-stat-mini-chart-title">{label}</h4>
      <ResponsiveContainer width="100%" height={148}>
        <BarChart data={chartData} margin={{ top: 18, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            stroke={CHART.axis}
            tick={{ fill: CHART.tick, fontSize: 9, fontFamily: CHART.fontFamily }}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={48}
          />
          <YAxis
            domain={yDomain}
            stroke={CHART.axis}
            tick={{ fill: CHART.tick, fontSize: 9, fontFamily: CHART.fontFamily }}
            tickFormatter={(v) => statChartTickFormat(Number(v), axisKind)}
            width={44}
          />
          <Tooltip content={miniChartTooltip} />
          <Bar dataKey="value" radius={0}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
            <LabelList
              dataKey="formatted"
              position="top"
              fill={CHART.accent}
              fontSize={9}
              fontFamily={CHART.fontFamily}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function TeamComparisonStatsChart({ teams, players }: TeamComparisonStatsChartProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const statRows = useMemo(() => buildTeamComparisonStatRows(teams, players), [teams, players])

  const colors = useMemo(
    () => teams.map((team) => radarColorForTeam(team.name, team.league)),
    [teams],
  )

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [teams.map((t) => teamKey(t)).join(',')] },
  )

  return (
    <ShareableChart ref={sectionRef} className="card player-chart-card">
      <h3 className="card-title">Team Stats</h3>
      <p className="card-subtitle">Record, win rate, side win rates, objectives, and pace</p>
      <div className="team-comparison-records">
        {teams.map((team) => (
          <div key={teamKey(team)} className="team-comparison-record entity-inline-row">
            <TeamLogo name={team.name} size={18} />
            <span className="font-medium">{team.name}</span>
            <span className="text-accent">{teamRecordLabel(team)}</span>
            <span className="text-secondary"> · {team.winrate.toFixed(1)}% WR</span>
          </div>
        ))}
      </div>
      <div className="team-stat-charts-grid">
        {statRows.map((row) => (
          <StatMiniChart
            key={row.metric}
            label={row.label}
            metric={row.metric}
            teams={teams}
            row={row}
            colors={colors}
          />
        ))}
      </div>
    </ShareableChart>
  )
}
