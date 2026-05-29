import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { buildPresenceBarData } from '../../lib/championAnalytics'
import type { Champion } from '../../hooks/useDashboardData'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface PresenceBarChartProps {
  champions: Champion[]
}

export default function PresenceBarChart({ champions }: PresenceBarChartProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const data = buildPresenceBarData(champions)

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [champions.length] },
  )

  return (
    <div ref={sectionRef} className="card page-section">
      <h2 className="card-title">Champion Presence</h2>
      <p className="card-subtitle">Top 20 by presence — pick rate (gold) vs ban rate (dim)</p>
      <div className="h-[520px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 88, bottom: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={[0, 'dataMax']}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={84}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: 11, fontFamily: CHART.fontFamily }}
            />
            <Tooltip
              contentStyle={CHART.tooltip}
              formatter={(value: number, name: string) => {
                if (name === 'Pick %') return [`${value.toFixed(1)}%`, name]
                if (name === 'Ban %') return [`${value.toFixed(1)}%`, name]
                return [value, name]
              }}
              labelFormatter={(label, payload) => {
                const row = payload?.[0]?.payload as { picks?: number; bans?: number; presence?: number }
                return row
                  ? `${label} · ${row.picks ?? 0} picks · ${row.bans ?? 0} bans · ${row.presence?.toFixed(1)}% presence`
                  : label
              }}
            />
            <Legend
              wrapperStyle={{
                fontFamily: CHART.fontFamily,
                fontSize: CHART.fontSize,
                color: CHART.tick,
              }}
            />
            <Bar
              dataKey="pickRate"
              name="Pick %"
              stackId="presence"
              fill={CHART.accent}
              stroke={CHART.accent}
            />
            <Bar
              dataKey="banRate"
              name="Ban %"
              stackId="presence"
              fill={CHART.accentDim}
              fillOpacity={0.55}
              stroke={CHART.accentDim}
              strokeDasharray="4 2"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
