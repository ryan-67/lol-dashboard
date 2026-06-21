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
import ShareableChart from '../ui/ShareableChart'
import ChampionAxisTick from '../ui/ChampionAxisTick'
import {
  buildChampionPoolBars,
  playerKey,
} from '../../lib/playerAnalytics'
import { radarColorForPlayer } from '../../lib/entities/teamBrandColor'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface PlayerChampionPoolProps {
  players: Player[]
}

const poolTooltip = makeChartTooltipContent(
  (props) => {
    const item = props.payload?.[0]
    const row = item?.payload as Record<string, string | number> | undefined
    if (!row?.champion) return undefined
    const match = String(item?.dataKey ?? '').match(/^games_(\d+)$/)
    const index = match ? Number(match[1]) : 0
    const playerName = row[`playerName_${index}`] ?? ''
    return playerName ? `${row.champion} · ${playerName}` : String(row.champion)
  },
  (props) => {
    const item = props.payload?.[0]
    if (!item) return []
    const row = item.payload as Record<string, string | number>
    const match = String(item.dataKey ?? '').match(/^games_(\d+)$/)
    const index = match ? Number(match[1]) : 0
    const games = Number(row[`games_${index}`] ?? 0)
    const wins = Number(row[`wins_${index}`] ?? 0)
    const losses = Number(row[`losses_${index}`] ?? 0)
    const winrate = Number(row[`wr_${index}`] ?? 0)
    return [
      { label: 'Games', value: String(games) },
      { label: 'Wins', value: String(wins) },
      { label: 'Losses', value: String(losses) },
      { label: 'Winrate', value: `${winrate.toFixed(1)}%` },
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
        row[`wins_${index}`] = entry?.wins ?? 0
        row[`losses_${index}`] = entry?.losses ?? 0
        row[`wr_${index}`] = entry?.winrate ?? 0
        row[`playerName_${index}`] = player.name
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
    <ShareableChart ref={sectionRef} className="card player-chart-card">
      <h3 className="card-title">Champion Pool</h3>
      <p className="card-subtitle">Top 5 champions by games · winrate label</p>
      <div className="player-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 96, bottom: 8 }}
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
              width={92}
              stroke={CHART.axis}
              tick={<ChampionAxisTick />}
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
            {players.map((player, index) => {
              const playerColor = radarColorForPlayer(player.team, player.league)
              return (
              <Bar
                key={playerKey(player)}
                dataKey={`games_${index}`}
                name={player.name}
                fill={playerColor}
              >
                {chartData.map((row, rowIndex) => {
                  const wr = Number(row[`wr_${index}`] ?? 0)
                  const fill =
                    wr < 50
                      ? 'rgba(140, 115, 64, 0.35)'
                      : playerColor
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
            )})}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ShareableChart>
  )
}
