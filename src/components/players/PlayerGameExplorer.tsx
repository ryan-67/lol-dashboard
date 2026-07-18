import { useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Player, PlayerGameLog } from '../../hooks/useDashboardData'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { formatGameDate, formatNum } from '../../lib/format'
import { animateChartDraw } from '../../theme/animations'
import { CHART, RESULT_COLORS } from '../../theme/chartTheme'

type ExplorerMetricKey =
  | 'gd15'
  | 'csd15'
  | 'kda'
  | 'dpm'
  | 'kp'
  | 'dmgShare'
  | 'visionScore'
  | 'gpm'

interface ExplorerMetric {
  key: ExplorerMetricKey
  label: string
  digits: number
  suffix?: string
  /** Player-level aggregate field used for the role-average baseline. */
  cohortField?: keyof Player
}

const METRICS: ExplorerMetric[] = [
  { key: 'gd15', label: 'GD@15', digits: 0, cohortField: 'gd15' },
  { key: 'csd15', label: 'CSD@15', digits: 1, cohortField: 'csd15' },
  { key: 'kda', label: 'KDA', digits: 2, cohortField: 'kda' },
  { key: 'dpm', label: 'DPM', digits: 0, cohortField: 'dpm' },
  { key: 'kp', label: 'KP%', digits: 1, suffix: '%', cohortField: 'kp' },
  { key: 'dmgShare', label: 'DMG%', digits: 1, suffix: '%', cohortField: 'dmgShare' },
  { key: 'visionScore', label: 'Vision', digits: 1, cohortField: 'visionScore' },
  { key: 'gpm', label: 'GPM', digits: 0 },
]

const WINDOWS = [10, 20, 30, 50]

interface ExplorerPoint {
  index: number
  dateLabel: string
  value: number
  result: number
  champion: string
  opponent: string
  date: string
}

function metricValue(game: PlayerGameLog, key: ExplorerMetricKey): number | null {
  const raw = game[key]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

const explorerTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as ExplorerPoint | undefined
    return row ? formatGameDate(row.date) : undefined
  },
  (props) => {
    const row = props.payload?.[0]?.payload as ExplorerPoint | undefined
    const metricLabel = (props.payload?.[0]?.name as string | undefined) ?? 'Value'
    if (!row) return []
    const rows = [
      { label: metricLabel, value: formatNum(row.value, 2) },
      { label: 'Result', value: row.result === 1 ? 'Win' : 'Loss' },
      { label: 'Champion', value: row.champion },
    ]
    if (row.opponent) rows.push({ label: 'vs', value: row.opponent })
    return rows
  },
)

interface PlayerGameExplorerProps {
  player: Player
  cohort: Player[]
}

/**
 * Interactive game-by-game metric explorer: pick a metric and window,
 * every game rendered as a W/L-colored bar against the role-average baseline.
 */
export default function PlayerGameExplorer({ player, cohort }: PlayerGameExplorerProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [metricKey, setMetricKey] = useState<ExplorerMetricKey>('gd15')
  const [window, setWindow] = useState(20)
  const [mode, setMode] = useState<'bars' | 'line'>('bars')

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0]!

  const availableMetrics = useMemo(() => {
    const log = player.gameLog ?? []
    return METRICS.filter((m) => log.some((g) => metricValue(g, m.key) != null))
  }, [player])

  const points = useMemo<ExplorerPoint[]>(() => {
    const games = [...(player.gameLog ?? [])]
      .sort((a, b) => a.date.localeCompare(b.date) || (a.gameId ?? '').localeCompare(b.gameId ?? ''))
      .slice(-window)
    return games
      .map((g, i) => {
        const value = metricValue(g, metric.key)
        if (value == null) return null
        return {
          index: i + 1,
          dateLabel: formatGameDate(g.date, { month: 'numeric' }),
          value: Math.round(value * 100) / 100,
          result: g.result,
          champion: g.champion,
          opponent: g.opponent ?? '',
          date: g.date,
        }
      })
      .filter((p): p is ExplorerPoint => p !== null)
  }, [player, metric.key, window])

  const roleAverage = useMemo(() => {
    const field = metric.cohortField
    const vals = field
      ? cohort
          .map((p) => p[field])
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : []
    if (!vals.length) {
      // No trustworthy role aggregate (e.g. GPM) — fall back to the player's own window mean.
      if (!points.length) return null
      return points.reduce((s, p) => s + p.value, 0) / points.length
    }
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }, [cohort, metric, points])

  useGSAP(
    () => {
      animateChartDraw(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [metricKey, window, mode, points.length] },
  )

  if (!availableMetrics.length || !(player.gameLog ?? []).length) return null

  const wins = points.filter((p) => p.result === 1).length

  return (
    <ShareableChart ref={sectionRef} className="card player-chart-card player-chart-card-wide game-explorer">
      <div className="player-chart-header-row">
        <div>
          <h3 className="card-title">Game Explorer</h3>
          <p className="card-subtitle">
            Every game as a data point · green win · red loss · dashed line = role average
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
              domain={['auto', 'auto']}
            />
            <Tooltip content={explorerTooltip} cursor={{ fill: 'rgba(244, 241, 232, 0.04)' }} />
            {roleAverage != null ? (
              <ReferenceLine
                y={Math.round(roleAverage * 100) / 100}
                stroke="rgba(240, 236, 226, 0.4)"
                strokeDasharray="5 5"
              />
            ) : null}
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
                      fill={(payload as ExplorerPoint).result === 1 ? RESULT_COLORS.win : RESULT_COLORS.loss}
                      stroke="none"
                    />
                  ) : (
                    <g key={`dot-${index}`} />
                  )
                }
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ShareableChart>
  )
}
