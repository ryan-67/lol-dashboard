import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Player } from '../../hooks/useDashboardData'
import { championPieColors } from '../../lib/championColors'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

const pieTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as { champion?: string }
    return row?.champion
  },
  (props) => {
    const row = props.payload?.[0]?.payload as { games?: number; winrate?: number }
    if (!row) return []
    return [
      { label: 'Games', value: String(row.games ?? 0) },
      { label: 'Winrate', value: `${(row.winrate ?? 0).toFixed(1)}%` },
    ]
  },
)

export default function PlayerChampionPie({ player }: { player: Player }) {
  const ref = useRef<HTMLDivElement>(null)
  const data = useMemo(() => {
    const entries = (player.championPool ?? [])
      .slice()
      .sort((a, b) => b.games - a.games)
      .slice(0, 8)
    const colors = championPieColors(entries.map((c) => c.champion))
    return entries.map((c) => ({
      champion: c.champion,
      games: c.games,
      winrate: c.winrate,
      fill: colors[c.champion] ?? '#c5a059',
    }))
  }, [player.championPool])

  useGSAP(() => scrollEntrance(ref.current), { scope: ref, dependencies: [data.length] })

  if (!data.length) {
    return (
      <div className="card">
        <h3 className="card-title">Champion Pool</h3>
        <div className="empty-state text-sm">No champion pool data.</div>
      </div>
    )
  }

  return (
    <div ref={ref} className="card">
      <h3 className="card-title">Champion Pool</h3>
      <p className="card-subtitle">Pick distribution for {player.name}</p>
      <div className="entity-chart-body">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="games"
              nameKey="champion"
              cx="50%"
              cy="50%"
              outerRadius={100}
              stroke={CHART.grid}
              strokeWidth={1}
            >
              {data.map((entry) => (
                <Cell key={entry.champion} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={pieTooltip} />
            <Legend
              wrapperStyle={{
                fontFamily: CHART.fontFamily,
                fontSize: CHART.fontSize,
                color: CHART.tick,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
