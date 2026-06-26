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
import type { TeamObjectiveGameSeries } from '../../lib/entities/entityAnalytics'
import { objectiveDiffTimeline, teamSideForObjectiveRow } from '../../lib/entities/entityAnalytics'
import type { CitoGameGoldRecord } from '../../lib/citoGoldMatch'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { formatGameDate } from '../../lib/format'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

const WIN_COLOR = '#5c8a5a'
const LOSS_COLOR = '#8a5c5c'

interface TeamObjectivesGraphProps {
  games: TeamObjectiveGameSeries[]
  citoRows: CitoGameGoldRecord[]
  teamSlugOrName: string
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

export default function TeamObjectivesGraph({
  games,
  citoRows,
  teamSlugOrName,
  loading = false,
}: TeamObjectivesGraphProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const maxDuration = 40

  const visibleGames = useMemo(
    () => games.filter((g) => !hidden.has(g.id)),
    [games, hidden],
  )

  const chartData = useMemo(() => {
    const minutes = Array.from({ length: maxDuration + 1 }, (_, i) => i)
    return minutes.map((minute) => {
      const row: Record<string, number | string | null> = { minute }
      for (const game of visibleGames) {
        const cito = citoRows.find((r) => r.oeGameId === game.id)
        const side = cito ? teamSideForObjectiveRow(cito, teamSlugOrName) : 'blue'
        if (!side) continue
        const timeline = objectiveDiffTimeline(game.events, side, maxDuration)
        const pt = timeline.filter((p) => p.minute <= minute).pop()
        row[game.id] = pt?.goldDiff ?? null
      }
      return row
    })
  }, [visibleGames, citoRows, teamSlugOrName])

  useGSAP(() => scrollEntrance(ref.current), { scope: ref, dependencies: [games.length] })

  if (!games.length) {
    return null
  }

  return (
    <div ref={ref} className="card">
      <ShareableChart className="entity-gold-graph-chart-wrap">
        <h3 className="card-title">Objectives Timeline</h3>
        <p className="card-subtitle">
          Cumulative objective advantage (secured minus lost){loading ? ' · loading…' : ''}
        </p>
        <div className="entity-chart-body entity-gold-graph-chart">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="minute"
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
              />
              <YAxis
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
                allowDecimals={false}
              />
              <ReferenceLine y={0} stroke="rgba(240, 236, 226, 0.35)" strokeWidth={1} />
              <Tooltip content={tooltip} />
              {visibleGames.map((game) => (
                <Line
                  key={game.id}
                  type="stepAfter"
                  dataKey={game.id}
                  name={game.label}
                  stroke={game.result === 'W' ? WIN_COLOR : LOSS_COLOR}
                  strokeWidth={1}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ShareableChart>
      <aside className="entity-gold-graph-legend mt-3">
        {games.map((game) => {
          const off = hidden.has(game.id)
          return (
            <button
              key={game.id}
              type="button"
              className={`entity-gold-legend-item${off ? ' entity-gold-legend-item-off' : ''}`}
              onClick={() =>
                setHidden((prev) => {
                  const next = new Set(prev)
                  if (next.has(game.id)) next.delete(game.id)
                  else next.add(game.id)
                  return next
                })
              }
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
  )
}
