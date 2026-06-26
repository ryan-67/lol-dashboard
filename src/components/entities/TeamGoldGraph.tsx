import { useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TeamGoldGameSeries } from '../../lib/entities/entityAnalytics'
import { averageGoldTimeline } from '../../lib/entities/entityAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { formatGameDate } from '../../lib/format'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'
import Select from '../ui/Select'

const WIN_COLOR = '#5c8a5a'
const LOSS_COLOR = '#8a5c5c'
const MAX_DURATION_OPTIONS = [25, 30, 35, 40]

interface TeamGoldGraphProps {
  games: TeamGoldGameSeries[]
  loading?: boolean
}

const tooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as { minute?: number }
    return row?.minute != null ? `${row.minute} min` : undefined
  },
  (props) => {
    const entries = props.payload ?? []
    return entries
      .filter((e) => e.dataKey !== 'minute' && e.value != null)
      .slice(0, 6)
      .map((e) => ({
        label: String(e.name ?? e.dataKey),
        value: `${Number(e.value).toFixed(0)}`,
      }))
  },
)

export default function TeamGoldGraph({ games, loading = false }: TeamGoldGraphProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [maxDuration, setMaxDuration] = useState(30)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [showAverage, setShowAverage] = useState(true)

  const citoCount = useMemo(() => games.filter((g) => g.dataSource === 'cito').length, [games])

  const subtitle = useMemo(() => {
    if (!games.length) return 'Team gold difference over time'
    if (citoCount === games.length) {
      return `Cito postgame gold · ${games.length} games · click legend to toggle`
    }
    return `${games.length} games with Cito gold timelines · click legend to toggle games`
  }, [games.length, citoCount])

  const visibleGames = useMemo(
    () => games.filter((g) => !hidden.has(g.id)),
    [games, hidden],
  )

  const avgSeries = useMemo(
    () => averageGoldTimeline(visibleGames, maxDuration),
    [visibleGames, maxDuration],
  )

  const chartData = useMemo(() => {
    const minutes = Array.from({ length: maxDuration + 1 }, (_, i) => i)
    return minutes.map((minute) => {
      const row: Record<string, number | string | null> = { minute }
      for (const game of visibleGames) {
        const exact = game.points.find((p) => p.minute === minute)
        if (exact) {
          row[game.id] = exact.goldDiff
        } else {
          const sorted = [...game.points].sort((a, b) => a.minute - b.minute)
          let val: number | null = null
          const first = sorted[0]
          if (first && minute < first.minute) {
            val = 0
          }
          for (let i = 0; i < sorted.length - 1; i++) {
            const a = sorted[i]!
            const b = sorted[i + 1]!
            if (minute >= a.minute && minute <= b.minute) {
              const t = (minute - a.minute) / Math.max(b.minute - a.minute, 1)
              val = a.goldDiff + t * (b.goldDiff - a.goldDiff)
              break
            }
          }
          if (val == null && sorted.length) {
            val = sorted[sorted.length - 1]!.goldDiff
          }
          row[game.id] = val
        }
      }
      if (showAverage) {
        const avgPt = avgSeries.find((p) => p.minute === minute)
        row.average = avgPt?.goldDiff ?? null
      }
      return row
    })
  }, [visibleGames, maxDuration, avgSeries, showAverage])

  useGSAP(() => scrollEntrance(ref.current), { scope: ref, dependencies: [games.length, maxDuration] })

  const toggleGame = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!games.length) {
    return null
  }

  return (
    <div ref={ref} className="card">
      <div className="entity-gold-graph-head">
        <div className="entity-gold-graph-controls entity-gold-graph-controls-only">
          <label className="entity-gold-graph-control">
            <span className="label-field">Max duration</span>
            <Select
              label="Max duration"
              value={String(maxDuration)}
              onChange={(e) => setMaxDuration(Number(e.target.value))}
            >
              {MAX_DURATION_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      <div className="entity-gold-graph-layout">
        <ShareableChart className="entity-gold-graph-chart-wrap">
          <h3 className="card-title">Gold Graph</h3>
          <p className="card-subtitle">{subtitle}{loading ? ' · loading Cito timelines…' : ''}</p>
          <div className="entity-chart-body entity-gold-graph-chart">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="minute"
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
                label={{
                  value: 'Minutes',
                  position: 'insideBottom',
                  offset: -4,
                  fill: CHART.tick,
                  fontSize: 10,
                  fontFamily: CHART.fontFamily,
                }}
              />
              <YAxis
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
                tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v}`}
              />
              <ReferenceLine y={0} stroke="rgba(240, 236, 226, 0.35)" strokeWidth={1} />
              <Tooltip content={tooltip} />
              {visibleGames.map((game) => (
                <Line
                  key={game.id}
                  type="monotone"
                  dataKey={game.id}
                  name={game.label}
                  stroke={game.result === 'W' ? WIN_COLOR : LOSS_COLOR}
                  strokeWidth={1}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
              {showAverage ? (
                <Line
                  type="monotone"
                  dataKey="average"
                  name="Average"
                  stroke={CHART.accent}
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
          </div>
        </ShareableChart>
        <aside className="entity-gold-graph-legend">
          <button
            type="button"
            className={`entity-gold-legend-item${showAverage ? '' : ' entity-gold-legend-item-off'}`}
            onClick={() => setShowAverage((v) => !v)}
          >
            <span className="entity-gold-legend-swatch entity-gold-legend-swatch-avg" />
            Average
          </button>
          {games.map((game) => {
            const off = hidden.has(game.id)
            return (
              <button
                key={game.id}
                type="button"
                className={`entity-gold-legend-item${off ? ' entity-gold-legend-item-off' : ''}`}
                onClick={() => toggleGame(game.id)}
              >
                <span
                  className="entity-gold-legend-swatch"
                  style={{ backgroundColor: game.result === 'W' ? WIN_COLOR : LOSS_COLOR }}
                />
                <span className="entity-gold-legend-label">{game.opponent}</span>
                <span className="text-secondary text-xs">{formatGameDate(game.date)}</span>
              </button>
            )
          })}
        </aside>
      </div>
    </div>
  )
}
