import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { RadarChartPayload } from './types'
import ShareableChart from '../ui/ShareableChart'
import { COMPARISON_COLORS, leagueColor } from '../../lib/teamAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { CHART } from '../../theme/chartTheme'

const radarTooltip = makeChartTooltipContent(
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
        const key = String(item.dataKey ?? '')
        const teamIndex = key.match(/^team(\d+)Norm$/)?.[1]
        if (key === 'avgNorm') {
          value = String(point?.formattedAvg ?? '—')
        } else if (teamIndex !== undefined) {
          value = String(point?.[`team${teamIndex}Label`] ?? '—')
        }
        return { label: String(item.name ?? ''), value }
      })
  },
)

function buildRadarRows(payload: RadarChartPayload) {
  const metrics = payload.teams[0]?.series.map((s) => s.metric) ?? []
  const labels = payload.teams[0]?.series.map((s) => s.label ?? s.metric) ?? []
  return metrics.map((metric, metricIndex) => {
    const firstSeries = payload.teams[0]?.series[metricIndex]
    const row: Record<string, string | number> = {
      metric,
      label: labels[metricIndex] ?? metric,
      avgNorm: firstSeries?.avgNorm ?? 50,
      formattedAvg: firstSeries?.formattedAvg ?? '',
    }
    payload.teams.forEach((team, teamIndex) => {
      const point = team.series[metricIndex]
      if (point) {
        row[`team${teamIndex}Norm`] = point.valueNorm
        row[`team${teamIndex}Label`] = point.formatted
      }
    })
    return row
  })
}

export default function NuckyRadarChart({ payload }: { payload: RadarChartPayload }) {
  const data = buildRadarRows(payload)

  return (
    <ShareableChart className="border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 my-2">
      <div className="text-xs text-[var(--text-secondary)] mb-2">{payload.title}</div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke={CHART.grid} />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
            />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip content={radarTooltip} />
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
            {payload.teams.map((team, index) => {
              const color =
                COMPARISON_COLORS[index % COMPARISON_COLORS.length] ?? leagueColor(team.league)
              return (
                <Radar
                  key={`${team.name}|${team.league}`}
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
    </ShareableChart>
  )
}
