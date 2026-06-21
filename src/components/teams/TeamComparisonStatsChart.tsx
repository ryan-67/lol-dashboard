import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Team } from '../../hooks/useDashboardData'
import { buildTeamComparisonStatRows, teamRecordLabel } from '../../lib/teamComparisonAnalytics'
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

const statsTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as { label?: string }
    return row?.label
  },
  (props) => {
    if (!props.payload?.length) return []
    const row = props.payload[0]?.payload as Record<string, string | number>
    return props.payload
      .filter((item) => String(item.dataKey ?? '').match(/^team\d+Norm$/))
      .map((item) => {
        const match = String(item.dataKey ?? '').match(/^team(\d+)Norm$/)
        const index = match ? Number(match[1]) : 0
        return {
          label: String(item.name ?? ''),
          value: String(row[`team${index}Label`] ?? '—'),
        }
      })
  },
)

export default function TeamComparisonStatsChart({ teams, players }: TeamComparisonStatsChartProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const data = useMemo(() => buildTeamComparisonStatRows(teams, players), [teams, players])

  const chartData = useMemo(() => {
    return data.map((row) => {
      const values = teams.map((_, index) => Number(row[`team${index}`] ?? 0))
      const min = Math.min(...values)
      const max = Math.max(...values)
      const normalized: Record<string, string | number> = { ...row }
      teams.forEach((_, index) => {
        const raw = Number(row[`team${index}`] ?? 0)
        normalized[`team${index}Norm`] =
          max === min ? 50 : ((raw - min) / (max - min)) * 100
      })
      return normalized
    })
  }, [data, teams])

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
      <div className="player-chart-body" style={{ minHeight: 320 }}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 96, bottom: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={92}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: 11, fontFamily: CHART.fontFamily }}
            />
            <Tooltip content={statsTooltip} />
            <Legend
              wrapperStyle={{
                fontFamily: CHART.fontFamily,
                fontSize: CHART.fontSize,
                color: CHART.tick,
              }}
            />
            {teams.map((team, index) => (
              <Bar
                key={teamKey(team)}
                dataKey={`team${index}Norm`}
                name={`${team.name} (${team.league})`}
                fill={colors[index]}
              >
                {chartData.map((row) => (
                  <Cell key={`${row.metric}-${teamKey(team)}`} fill={colors[index]} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ShareableChart>
  )
}
