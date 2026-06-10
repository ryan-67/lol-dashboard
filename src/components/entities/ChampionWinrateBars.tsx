import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChampionWinrateEntry } from '../../lib/entities/entityAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'
import ChampionEntityInline from './ChampionEntityInline'

const tooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as unknown as ChampionWinrateEntry
    return row?.champion
  },
  (props) => {
    const row = props.payload?.[0]?.payload as unknown as ChampionWinrateEntry
    if (!row) return []
    return [
      { label: 'Games', value: String(row.games) },
      { label: 'Winrate', value: `${row.winrate.toFixed(1)}%` },
      { label: 'KDA', value: row.kda ? row.kda.toFixed(2) : '—' },
    ]
  },
)

export default function ChampionWinrateBars({
  title,
  entries,
  tone,
}: {
  title: string
  entries: ChampionWinrateEntry[]
  tone: 'best' | 'worst'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const color = tone === 'best' ? '#5c9e5a' : '#c45c5c'

  useGSAP(() => scrollEntrance(ref.current), { scope: ref, dependencies: [entries.length] })

  if (!entries.length) {
    return (
      <div className="card">
        <h3 className="card-title">{title}</h3>
        <div className="empty-state text-sm">Not enough games on individual champions.</div>
      </div>
    )
  }

  return (
    <div ref={ref} className="card">
      <h3 className="card-title">{title}</h3>
      <div className="entity-chart-body entity-chart-body-sm">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={entries} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: CHART.tick, fontSize: 10 }} />
            <YAxis
              type="category"
              dataKey="champion"
              width={100}
              tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
            />
            <Tooltip content={tooltip} />
            <Bar dataKey="winrate" radius={0}>
              {entries.map((e) => (
                <Cell key={e.champion} fill={color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="entity-champ-win-list">
        {entries.map((e) => (
          <li key={e.champion}>
            <ChampionEntityInline name={e.champion} />
            <span className="text-secondary">
              {e.games}G · {e.winrate.toFixed(1)}% · {e.kda ? e.kda.toFixed(2) : '—'} KDA
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
