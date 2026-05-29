import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Player } from '../../hooks/useDashboardData'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import {
  buildChampionPoolBars,
  playerKey,
  PLAYER_CHART_COLORS,
} from '../../lib/playerAnalytics'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface PlayerChampionPoolProps {
  players: Player[]
}

const poolTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as {
      champion?: string
      playerName?: string
    }
    return row?.champion ? `${row.champion} · ${row.playerName ?? ''}` : undefined
  },
  (props) => {
    const row = props.payload?.[0]?.payload as {
      games?: number
      wins?: number
      losses?: number
      winrate?: number
    }
    if (!row) return []
    return [
      { label: 'Games', value: String(row.games ?? 0) },
      { label: 'Wins', value: String(row.wins ?? 0) },
      { label: 'Losses', value: String(row.losses ?? 0) },
      { label: 'Winrate', value: `${(row.winrate ?? 0).toFixed(1)}%` },
    ]
  },
)

export default function PlayerChampionPool({ players }: PlayerChampionPoolProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const bars = useMemo(() => buildChampionPoolBars(players, 5), [players])

  const chartData = useMemo(() => {
    const champions = [...new Set(bars.map((b) => b.champion))]
    return champions.map((champion) => {
      const row: Record<string, string | number> = { champion }
      players.forEach((player, index) => {
        const key = playerKey(player)
        const entry = bars.find((b) => b.champion === champion && b.playerKey === key)
        row[`games_${index}`] = entry?.games ?? 0
        row[`wr_${index}`] = entry?.winrate ?? 0
      })
      return row
    })
  }, [bars, players])

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [bars.length, players.length] },
  )

  if (!bars.length) {
    return (
      <div className="card player-chart-card">
        <h3 className="card-title">Champion Pool</h3>
        <div className="empty-state text-sm">No champion pool data.</div>
      </div>
    )
  }

  return (
    <div ref={sectionRef} className="card player-chart-card">
      <h3 className="card-title">Champion Pool</h3>
      <p className="card-subtitle">Top 5 champions by games · winrate label</p>
      <div className="player-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 72, bottom: 8 }}
          >
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
            />
            <YAxis
              type="category"
              dataKey="champion"
              width={68}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: 11, fontFamily: CHART.fontFamily }}
            />
            <Tooltip content={poolTooltip} />
            {players.length > 1 && (
              <Legend
                wrapperStyle={{
                  fontFamily: CHART.fontFamily,
                  fontSize: CHART.fontSize,
                  color: CHART.tick,
                }}
              />
            )}
            {players.map((player, index) => (
              <Bar
                key={playerKey(player)}
                dataKey={`games_${index}`}
                name={player.name}
                fill={PLAYER_CHART_COLORS[index % PLAYER_CHART_COLORS.length]}
              >
                {chartData.map((row, rowIndex) => {
                  const wr = Number(row[`wr_${index}`] ?? 0)
                  const fill =
                    wr < 50
                      ? 'rgba(140, 115, 64, 0.35)'
                      : (PLAYER_CHART_COLORS[index % PLAYER_CHART_COLORS.length] as string)
                  return <Cell key={`${row.champion}-${rowIndex}`} fill={fill} />
                })}
                <LabelList
                  dataKey={`wr_${index}`}
                  position="right"
                  formatter={(value: number) => `${value}%`}
                  fill={CHART.accent}
                  fontSize={10}
                  fontFamily={CHART.fontFamily}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
