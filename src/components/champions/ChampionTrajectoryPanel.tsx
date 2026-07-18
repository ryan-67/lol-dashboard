import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Champion } from '../../hooks/useDashboardData'
import { computeOpScores } from '../../lib/championAnalytics'
import { championWeeklyTrend } from '../../lib/entities/entityAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { ChampionEntityInline } from '../entities'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

const MAX_SELECTED = 5
const TRAJECTORY_COLORS = ['#f2efe6', '#4eb0ba', '#c5a059', '#8c6a9e', '#5c9e5a']

interface ChampionTrajectoryPanelProps {
  champions: Champion[]
}

interface TrendSeries {
  name: string
  color: string
  points: ReturnType<typeof championWeeklyTrend>
}

function buildSeries(selected: Champion[]): TrendSeries[] {
  return selected.map((champion, idx) => ({
    name: champion.name,
    color: TRAJECTORY_COLORS[idx % TRAJECTORY_COLORS.length],
    points: championWeeklyTrend(champion),
  }))
}

function makeTrendTooltip(valueKey: 'presence' | 'winrate', suffix: string) {
  return makeChartTooltipContent(
    (props) => (typeof props.label === 'string' ? props.label : undefined),
    (props) =>
      (props.payload ?? [])
        .filter((p) => p.value != null)
        .map((p) => ({
          label: String(p.name ?? ''),
          value: `${Number((p.payload as Record<string, unknown>)?.[valueKey] ?? p.value ?? 0).toFixed(1)}${suffix}`,
        })),
  )
}

const presenceTooltip = makeTrendTooltip('presence', '%')
const winrateTooltip = makeTrendTooltip('winrate', '%')

export default function ChampionTrajectoryPanel({ champions }: ChampionTrajectoryPanelProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const touchedRef = useRef(false)

  const byName = useMemo(() => new Map(champions.map((c) => [c.name, c])), [champions])

  const defaultName = useMemo(() => {
    return computeOpScores(champions).top?.champion.name ?? champions[0]?.name ?? null
  }, [champions])

  useEffect(() => {
    if (touchedRef.current) return
    setSelectedNames((prev) => {
      if (prev.length) return prev
      return defaultName ? [defaultName] : []
    })
  }, [defaultName])

  useEffect(() => {
    setSelectedNames((prev) => {
      const next = prev.filter((n) => byName.has(n))
      return next.length === prev.length ? prev : next
    })
  }, [byName])

  const selected = useMemo(
    () => selectedNames.map((n) => byName.get(n)).filter((c): c is Champion => Boolean(c)),
    [selectedNames, byName],
  )

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return champions
      .filter((c) => c.name.toLowerCase().includes(q) && !selectedNames.includes(c.name))
      .slice(0, 8)
  }, [champions, query, selectedNames])

  const series = useMemo(() => buildSeries(selected), [selected])
  const hasTrendData = series.some((s) => s.points.length > 0)

  const addChampion = (name: string) => {
    touchedRef.current = true
    setSelectedNames((prev) =>
      prev.includes(name) || prev.length >= MAX_SELECTED ? prev : [...prev, name],
    )
    setQuery('')
  }

  const removeChampion = (name: string) => {
    touchedRef.current = true
    setSelectedNames((prev) => prev.filter((n) => n !== name))
  }

  useGSAP(() => scrollEntrance(sectionRef.current), {
    scope: sectionRef,
    dependencies: [selected.length],
  })

  return (
    <div ref={sectionRef} className="card champion-trajectory-panel page-section">
      <h2 className="card-title">Presence &amp; Winrate Trajectories</h2>
      <p className="card-subtitle">
        Search to add up to {MAX_SELECTED} champions and overlay their weekly presence and win
        rate trends.
      </p>

      <div className="champion-trajectory-search-wrap">
        <input
          type="search"
          className="champion-trajectory-search-input"
          placeholder="Search champion to add…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={selectedNames.length >= MAX_SELECTED}
        />
        {query.trim() && (
          <div className="champion-trajectory-search-dropdown">
            {suggestions.length === 0 ? (
              <div className="champion-trajectory-search-empty">No matches</div>
            ) : (
              suggestions.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="champion-trajectory-search-row"
                  onClick={() => addChampion(c.name)}
                >
                  <ChampionEntityInline name={c.name} iconSize={18} />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="champion-trajectory-chips">
        {selected.length === 0 ? (
          <span className="text-secondary text-sm">No champions selected.</span>
        ) : (
          selected.map((c, idx) => (
            <span key={c.name} className="champion-trajectory-chip">
              <span
                className="champion-trajectory-chip-swatch"
                style={{ backgroundColor: TRAJECTORY_COLORS[idx % TRAJECTORY_COLORS.length] }}
              />
              <ChampionEntityInline name={c.name} iconSize={16} />
              <button
                type="button"
                className="champion-trajectory-chip-remove"
                aria-label={`Remove ${c.name}`}
                onClick={() => removeChampion(c.name)}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      {!hasTrendData ? (
        <div className="empty-state text-sm">No weekly trend data for the selected champions.</div>
      ) : (
        <div className="champion-trajectory-charts">
          <ShareableChart>
            <h3 className="card-title">Presence over time</h3>
            <div className="entity-chart-body">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="week"
                    type="category"
                    allowDuplicatedCategory={false}
                    tick={{ fill: CHART.tick, fontSize: 9, fontFamily: CHART.fontFamily }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fill: CHART.tick, fontSize: 10 }} unit="%" />
                  <Tooltip content={presenceTooltip} />
                  <Legend
                    wrapperStyle={{ fontFamily: CHART.fontFamily, fontSize: CHART.fontSize, color: CHART.tick }}
                  />
                  {series.map((s) => (
                    <Line
                      key={`${s.name}-presence`}
                      name={s.name}
                      data={s.points}
                      type="monotone"
                      dataKey="presence"
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ShareableChart>

          <ShareableChart>
            <h3 className="card-title">Winrate over time</h3>
            <div className="entity-chart-body">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="week"
                    type="category"
                    allowDuplicatedCategory={false}
                    tick={{ fill: CHART.tick, fontSize: 9, fontFamily: CHART.fontFamily }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fill: CHART.tick, fontSize: 10 }} unit="%" domain={[0, 100]} />
                  <Tooltip content={winrateTooltip} />
                  <Legend
                    wrapperStyle={{ fontFamily: CHART.fontFamily, fontSize: CHART.fontSize, color: CHART.tick }}
                  />
                  {series.map((s) => (
                    <Line
                      key={`${s.name}-winrate`}
                      name={s.name}
                      data={s.points}
                      type="monotone"
                      dataKey="winrate"
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ShareableChart>
        </div>
      )}
    </div>
  )
}
