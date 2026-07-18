import { useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import {
  CartesianGrid,
  Cell,
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buildTeamGameStats, type TeamGameStatRow } from '../../lib/entities/entityAnalytics'
import type { Player } from '../../hooks/useDashboardData'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { formatGameDate, formatNum } from '../../lib/format'
import { animateChartDraw } from '../../theme/animations'
import { CHART, RESULT_COLORS } from '../../theme/chartTheme'

type TeamMetricKey = 'winrate' | 'gd15' | 'csd15' | 'kills' | 'gpm' | 'visionScore'

interface TeamMetricDef {
  key: TeamMetricKey
  label: string
  digits: number
  suffix?: string
}

const TEAM_METRICS: TeamMetricDef[] = [
  { key: 'winrate', label: 'Rolling Winrate', digits: 1, suffix: '%' },
  { key: 'gd15', label: 'GD@15', digits: 0 },
  { key: 'csd15', label: 'CSD@15', digits: 1 },
  { key: 'kills', label: 'Team Kills', digits: 0 },
  { key: 'gpm', label: 'Team GPM', digits: 0 },
  { key: 'visionScore', label: 'Team Vision', digits: 0 },
]

const WINDOWS = [10, 20, 30, 50]

interface TrendPoint {
  index: number
  dateLabel: string
  value: number
  trend: number | null
  result: number
  opponent: string
  date: string
}

/** Simple least-squares linear regression over the point index. */
function regressionLine(points: TrendPoint[]): number[] {
  const n = points.length
  if (n < 2) return points.map((p) => p.value)
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  points.forEach((p, i) => {
    sumX += i
    sumY += p.value
    sumXY += i * p.value
    sumXX += i * i
  })
  const denom = n * sumXX - sumX * sumX
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const intercept = (sumY - slope * sumX) / n
  return points.map((_, i) => slope * i + intercept)
}

const trendTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as TrendPoint | undefined
    return row ? formatGameDate(row.date) : undefined
  },
  (props) => {
    const row = props.payload?.[0]?.payload as TrendPoint | undefined
    const metricLabel = (props.payload?.[0]?.name as string | undefined) ?? 'Value'
    if (!row) return []
    const rows = [
      { label: metricLabel, value: formatNum(row.value, 2) },
      { label: 'Result', value: row.result === 1 ? 'Win' : 'Loss' },
    ]
    if (row.opponent) rows.push({ label: 'vs', value: row.opponent })
    return rows
  },
)

function metricValue(row: TeamGameStatRow, key: TeamMetricKey): number | null {
  if (key === 'winrate') return null // computed separately (cumulative within window)
  return row[key]
}

interface TeamStatTrendsProps {
  players: Player[]
  teamSlugOrName: string
}

/**
 * Filterable team-level stat trends — winrate, GD@15, CSD@15, kills, gold, vision
 * across recent match history, with an optional linear trend line.
 */
export default function TeamStatTrends({ players, teamSlugOrName }: TeamStatTrendsProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [metricKey, setMetricKey] = useState<TeamMetricKey>('winrate')
  const [window, setWindow] = useState(20)
  const [mode, setMode] = useState<'bars' | 'line'>('line')
  const [showTrend, setShowTrend] = useState(false)

  const allRows = useMemo(
    () => buildTeamGameStats(players, teamSlugOrName),
    [players, teamSlugOrName],
  )

  const availableMetrics = useMemo(
    () =>
      TEAM_METRICS.filter(
        (m) => m.key === 'winrate' || allRows.some((r) => metricValue(r, m.key) != null),
      ),
    [allRows],
  )

  const metric = availableMetrics.find((m) => m.key === metricKey) ?? availableMetrics[0]

  const points = useMemo<TrendPoint[]>(() => {
    if (!metric) return []
    const rows = allRows.slice(-window)
    let wins = 0
    const raw = rows
      .map((r, i) => {
        if (r.result === 'W') wins += 1
        const value = metric.key === 'winrate' ? (wins / (i + 1)) * 100 : metricValue(r, metric.key)
        if (value == null) return null
        return {
          index: i + 1,
          dateLabel: formatGameDate(r.date, { month: 'numeric' }),
          value: Math.round(value * 100) / 100,
          trend: null as number | null,
          result: r.result === 'W' ? 1 : 0,
          opponent: r.opponent,
          date: r.date,
        }
      })
      .filter((p): p is TrendPoint => p !== null)
    if (showTrend && raw.length > 1) {
      const trend = regressionLine(raw)
      return raw.map((p, i) => ({ ...p, trend: Math.round(trend[i]! * 100) / 100 }))
    }
    return raw
  }, [allRows, metric, window, showTrend])

  useGSAP(
    () => {
      animateChartDraw(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [metricKey, window, mode, showTrend, points.length] },
  )

  if (!metric || !allRows.length) {
    return (
      <div className="card">
        <h3 className="card-title">Team Stat Trends</h3>
        <div className="empty-state text-sm">No match history for trend.</div>
      </div>
    )
  }

  const wins = points.filter((p) => p.result === 1).length

  return (
    <ShareableChart ref={sectionRef} className="card player-chart-card player-chart-card-wide game-explorer">
      <div className="player-chart-header-row">
        <div>
          <h3 className="card-title">Team Stat Trends</h3>
          <p className="card-subtitle">
            Match-by-match team performance · green win · red loss
          </p>
        </div>
        <div className="player-consistency-stat text-secondary">
          {wins}-{points.length - wins} in window
        </div>
      </div>

      <div className="game-explorer-controls">
        <div className="filter-toggle-row" role="group" aria-label="Metric">
          {availableMetrics.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`filter-toggle${m.key === metricKey ? ' filter-toggle-active' : ''}`}
              aria-pressed={m.key === metricKey}
              onClick={() => setMetricKey(m.key)}
            >
              {m.label}
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
          <div className="filter-toggle-row" role="group" aria-label="Chart type">
            {(['bars', 'line'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`filter-toggle${m === mode ? ' filter-toggle-active' : ''}`}
                aria-pressed={m === mode}
                onClick={() => setMode(m)}
              >
                {m === 'bars' ? 'Bars' : 'Line'}
              </button>
            ))}
          </div>
          <div className="filter-toggle-row" role="group" aria-label="Trend line">
            <button
              type="button"
              className={`filter-toggle${showTrend ? ' filter-toggle-active' : ''}`}
              aria-pressed={showTrend}
              onClick={() => setShowTrend((v) => !v)}
            >
              Trend
            </button>
          </div>
        </div>
      </div>

      <div className="player-chart-body game-explorer-body">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => formatNum(Number(v), metric.digits)}
              width={56}
              domain={metric.key === 'winrate' ? [0, 100] : ['auto', 'auto']}
            />
            <Tooltip content={trendTooltip} cursor={{ fill: 'rgba(244, 241, 232, 0.04)' }} />
            {points.some((p) => p.value < 0) ? (
              <ReferenceLine y={0} stroke={CHART.axis} strokeWidth={1} />
            ) : null}
            {mode === 'bars' ? (
              <Bar dataKey="value" name={metric.label} maxBarSize={26} radius={[2, 2, 0, 0]}>
                {points.map((p) => (
                  <Cell
                    key={`${p.date}-${p.index}`}
                    fill={p.result === 1 ? RESULT_COLORS.win : RESULT_COLORS.loss}
                    fillOpacity={0.9}
                  />
                ))}
              </Bar>
            ) : (
              <Line
                dataKey="value"
                name={metric.label}
                type="monotone"
                stroke={CHART.accent}
                strokeWidth={1.5}
                dot={({ cx, cy, payload, index }) =>
                  cx != null && cy != null ? (
                    <circle
                      key={`dot-${index}`}
                      cx={cx}
                      cy={cy}
                      r={3.5}
                      fill={(payload as TrendPoint).result === 1 ? RESULT_COLORS.win : RESULT_COLORS.loss}
                      stroke="none"
                    />
                  ) : (
                    <g key={`dot-${index}`} />
                  )
                }
                isAnimationActive={false}
              />
            )}
            {showTrend ? (
              <Line
                dataKey="trend"
                name="Trend"
                type="monotone"
                stroke={CHART.accentDim}
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ShareableChart>
  )
}
