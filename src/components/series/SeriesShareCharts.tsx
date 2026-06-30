import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { teamMatchesCanonical } from '../../lib/entities/slugs'
import { radarColorForTeam } from '../../lib/entities/teamBrandColor'
import type { GameDistributionRow } from '../../lib/seriesGameInsights'
import { CHART } from '../../theme/chartTheme'
import ShareableChart from '../ui/ShareableChart'

export function ShareBarChart({
  title,
  rows,
  dataKey,
  colorA,
  colorB,
  teamA,
}: {
  title: string
  rows: GameDistributionRow[]
  dataKey: 'dmgShare' | 'goldShare'
  colorA: string
  colorB: string
  teamA: string
}) {
  const chartData = rows.map((row) => ({
    name: row.name,
    value: row[dataKey],
    fill:
      row.team === teamA || teamMatchesCanonical(row.team, teamA)
        ? colorA
        : colorB,
  }))

  if (!chartData.length) return null

  return (
    <ShareableChart className="card series-game-insight-chart">
      <h3 className="card-title">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 24 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: CHART.tick, fontSize: 9, fontFamily: CHART.fontFamily }}
            interval={0}
            angle={-22}
            textAnchor="end"
            height={48}
          />
          <YAxis
            tick={{ fill: CHART.tick, fontSize: 9, fontFamily: CHART.fontFamily }}
            tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
            width={40}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(1)}%`, title]}
            contentStyle={{
              background: CHART.tooltip.backgroundColor,
              border: CHART.tooltip.border,
            }}
          />
          <Bar dataKey="value" radius={0}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ShareableChart>
  )
}

interface SeriesShareChartsProps {
  teamA: string
  teamB: string
  league?: string
  rows: GameDistributionRow[]
}

export default function SeriesShareCharts({ teamA, teamB, league, rows }: SeriesShareChartsProps) {
  const colorA = radarColorForTeam(teamA, league)
  const colorB = radarColorForTeam(teamB, league)

  if (!rows.length) return null

  return (
    <div className="overview-grid overview-grid-2">
      <ShareBarChart
        title="Damage Share"
        rows={rows}
        dataKey="dmgShare"
        colorA={colorA}
        colorB={colorB}
        teamA={teamA}
      />
      <ShareBarChart
        title="Gold Share"
        rows={rows}
        dataKey="goldShare"
        colorA={colorA}
        colorB={colorB}
        teamA={teamA}
      />
    </div>
  )
}
