import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { Champion } from '../../hooks/useDashboardData'
import { CHAMPION_ROLE_COLORS, roleDistribution } from '../../lib/championAnalytics'
import { animateRadarDraw } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface RoleDistributionRingProps {
  champions: Champion[]
}

export default function RoleDistributionRing({ champions }: RoleDistributionRingProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const data = roleDistribution(champions)
  const total = champions.length

  useGSAP(
    () => {
      animateRadarDraw(chartRef.current)
    },
    { scope: chartRef, dependencies: [champions.length] },
  )

  return (
    <div className="card page-section">
      <h2 className="card-title">Role Distribution</h2>
      <p className="card-subtitle">Share of champions by primary role in current filter</p>
      <div ref={chartRef} className="relative h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="role"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              stroke="var(--bg-base)"
              strokeWidth={1}
            >
              {data.map((entry) => (
                <Cell key={entry.role} fill={CHAMPION_ROLE_COLORS[entry.role]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={CHART.tooltip}
              formatter={(value: number, name: string) => [
                `${value} champions (${total ? ((value / total) * 100).toFixed(1) : 0}%)`,
                name.toUpperCase(),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="ring-center-label">
          <div className="ring-center-value">{total}</div>
          <div className="ring-center-caption">champions</div>
        </div>
      </div>
    </div>
  )
}
