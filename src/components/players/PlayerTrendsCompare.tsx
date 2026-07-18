import { useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Player } from '../../hooks/useDashboardData'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { formatGameDate } from '../../lib/format'
import { animateChartDraw } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'
import { PLAYER_CHART_COLORS, getPlayerRole, playerKey } from '../../lib/playerAnalytics'
import { gameMetricRaw, playersForRole, ROLE_METRICS, type RadarMetricKey } from '../../lib/playerRadar'

const WINDOWS = [10, 20, 30, 50]

interface TrendPoint {
  game: number
  value: number
  result: number
  champion: string
  opponent: string
  date: string
  playerName: string
}

interface TrendSeries {
  key: string
  name: string
  color: string
  points: TrendPoint[]
}

interface PlayerTrendsCompareProps {
  players: Player[]
  cohortPlayers: Player[]
}

const trendsTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as TrendPoint | undefined
    return row ? `${row.playerName} · ${formatGameDate(row.date)}` : undefined
  },
  (props) => {
    const item = props.payload?.[0]
    const row = item?.payload as TrendPoint | undefined
    if (!row) return []
    const rows = [
      { label: String(item?.name ?? 'Value'), value: row.value.toFixed(2) },
      { label: 'Result', value: row.result === 1 ? 'Win' : 'Loss' },
      { label: 'Champion', value: row.champion },
    ]
    if (row.opponent) rows.push({ label: 'vs', value: row.opponent })
    return rows
  },
)

/**
 * Multi-player "Statistical Trends" chart — overlays a chosen metric's game-by-game
 * series for every selected player (one line per player, shared metric/window toggles).
 * Metric options come from ROLE_METRICS for the first selected player's role.
 */
export default function PlayerTrendsCompare({ players, cohortPlayers }: PlayerTrendsCompareProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const role = players[0] ? getPlayerRole(players[0]) : 'mid'
  const metrics = ROLE_METRICS[role]
  const [metricKey, setMetricKey] = useState<RadarMetricKey>(metrics[0]?.key ?? 'kda')
  const [window, setWindow] = useState(20)

  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0]

  const series = useMemo<TrendSeries[]>(() => {
    if (!metric) return []
    return players.map((player, index) => {
      const pRole = getPlayerRole(player)
      const cohort = playersForRole(cohortPlayers, pRole)
      const games = [...(player.gameLog ?? [])]
        .sort((a, b) => a.date.localeCompare(b.date) || (a.gameId ?? '').localeCompare(b.gameId ?? ''))
        .slice(-window)

      const points: TrendPoint[] = games
        .map((g, i) => {
          const value = gameMetricRaw(g, metric.key, cohort)
          if (value == null) return null
          return {
            game: i + 1,
            value: Math.round(value * 100) / 100,
            result: g.result,
            champion: g.champion,
            opponent: g.opponent ?? '',
            date: g.date,
            playerName: player.name,
          }
        })
        .filter((p): p is TrendPoint => p !== null)

      return {
        key: playerKey(player),
        name: player.name,
        color: PLAYER_CHART_COLORS[index % PLAYER_CHART_COLORS.length],
        points,
      }
    })
  }, [players, cohortPlayers, metric, window])

  useGSAP(
    () => {
      animateChartDraw(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [metricKey, window, series.length] },
  )

  if (!metrics.length || !players.length || series.every((s) => !s.points.length)) {
    return (
      <div className="card player-chart-card player-chart-card-wide">
        <h3 className="card-title">Statistical Trends</h3>
        <div className="empty-state text-sm">No game log data for selected players.</div>
      </div>
    )
  }

  return (
    <ShareableChart ref={sectionRef} className="card player-chart-card player-chart-card-wide game-explorer">
      <div className="player-chart-header-row">
        <div>
          <h3 className="card-title">Statistical Trends</h3>
          <p className="card-subtitle">Game-by-game metric overlay · one line per player</p>
        </div>
      </div>

      <div className="game-explorer-controls">
        <div className="filter-toggle-row" role="group" aria-label="Metric">
          {metrics.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`filter-toggle${m.key === metricKey ? ' filter-toggle-active' : ''}`}
              aria-pressed={m.key === metricKey}
              onClick={() => setMetricKey(m.key)}
            >
              {m.shortLabel}
            </button>
          ))}
        </div>
        <div className="game-explorer-controls-right">
          <div className="filter-toggle-row" role="group" aria-label="Games window">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                className={`filter-toggle${w === window ? ' filter-toggle-active' : ''}`}
                aria-pressed={w === window}
                onClick={() => setWindow(w)}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="player-chart-body game-explorer-body">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="game"
              type="number"
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              label={{
                value: 'Game',
                position: 'insideBottom',
                offset: -4,
                fill: CHART.tick,
                fontSize: CHART.fontSize,
                fontFamily: CHART.fontFamily,
              }}
            />
            <YAxis
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => (metric ? metric.format(Number(v)) : String(v))}
              width={56}
              domain={['auto', 'auto']}
            />
            <Tooltip content={trendsTooltip} cursor={{ fill: 'rgba(244, 241, 232, 0.04)' }} />
            <Legend
              wrapperStyle={{
                fontFamily: CHART.fontFamily,
                fontSize: CHART.fontSize,
                color: CHART.tick,
              }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                name={s.name}
                data={s.points}
                type="monotone"
                dataKey="value"
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ShareableChart>
  )
}
