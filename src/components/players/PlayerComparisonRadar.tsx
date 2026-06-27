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
import type { Player } from '../../hooks/useDashboardData'
import {
  ROLE_METRICS,
  buildRadarSeries,
  normalizePosition,
} from '../../lib/playerRadar'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { animateRadarDraw } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

const COMPARE_COLORS = ['#c5a059', '#5c7a9e', '#c45c5c', '#5c9e5a', '#8c6a9e', '#6a7a8c']

const comparisonTooltip = makeChartTooltipContent(
  (props) => {
    const point = props.payload?.[0]?.payload as { label?: string; metric?: string }
    return point?.label ?? point?.metric
  },
  (props) => {
    if (!props.payload?.length) return []
    const point = props.payload[0]?.payload as Record<string, string | number>
    return props.payload
      .filter((item) => String(item.dataKey ?? '').endsWith('Norm'))
      .map((item) => {
        const key = String(item.dataKey ?? '')
        const idx = key.match(/^player(\d+)Norm$/)?.[1]
        const label = idx != null ? String(point?.[`player${idx}Label`] ?? '—') : '—'
        return { label: String(item.name ?? ''), value: label }
      })
  },
)

interface PlayerComparisonRadarProps {
  players: Player[]
  cohort: Player[]
}

export default function PlayerComparisonRadar({ players, cohort }: PlayerComparisonRadarProps) {
  const chartRef = useRef<HTMLDivElement>(null)

  if (!players.length) return null

  const role = normalizePosition(players[0]!.position) ?? 'mid'
  const metrics = ROLE_METRICS[role]

  const data = metrics.map((def) => {
    const base: Record<string, string | number> = {
      metric: def.shortLabel,
      label: def.label,
    }
    players.forEach((player, index) => {
      const playerRole = normalizePosition(player.position) ?? role
      const playerCohort = cohort.filter((p) => normalizePosition(p.position) === playerRole)
      const series = buildRadarSeries(player, playerRole, playerCohort.length ? playerCohort : cohort)
      const point = series.find((p) => p.metric === def.shortLabel)
      base[`player${index}Norm`] = point?.playerNorm ?? 0
      base[`player${index}Label`] = point?.formattedPlayer ?? '—'
    })
    return base
  })

  useGSAP(
    () => {
      animateRadarDraw(chartRef.current)
    },
    { scope: chartRef, dependencies: [players.length, role] },
  )

  return (
    <ShareableChart className="card player-chart-card">
      <h3 className="card-title">Performance Radar</h3>
      <p className="card-subtitle">Overlay · tournament stats · normalized within role</p>
      <div ref={chartRef} className="radar-chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid stroke={CHART.grid} />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
            />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip content={comparisonTooltip} />
            {players.map((player, index) => (
              <Radar
                key={player.name}
                name={player.name}
                dataKey={`player${index}Norm`}
                stroke={COMPARE_COLORS[index % COMPARE_COLORS.length]}
                fill={COMPARE_COLORS[index % COMPARE_COLORS.length]}
                fillOpacity={0.12}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </ShareableChart>
  )
}
