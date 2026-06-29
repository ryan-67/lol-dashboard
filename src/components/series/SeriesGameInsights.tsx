import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Player } from '../../hooks/useDashboardData'
import type { EnrichedSeriesGame, ResolvedSeries, SeriesGameRosterPlayer } from '../../lib/seriesAnalytics'
import {
  buildGameDistributionRows,
  buildSeriesGameGoldSeries,
  findGameStatHighlights,
} from '../../lib/seriesGameInsights'
import { recapTeamTag } from '../../lib/recapTeamTag'
import { teamMatchesCanonical } from '../../lib/entities/slugs'
import { radarColorForTeam } from '../../lib/entities/teamBrandColor'
import { CHART } from '../../theme/chartTheme'
import ShareableChart from '../ui/ShareableChart'

interface SeriesGameInsightsProps {
  series: ResolvedSeries
  game: EnrichedSeriesGame
  roster: SeriesGameRosterPlayer[]
  players: Player[]
  cohortPlayers: Player[]
}

function DistributionChart({
  title,
  rows,
  dataKey,
  colorA,
  colorB,
  teamA,
}: {
  title: string
  rows: ReturnType<typeof buildGameDistributionRows>
  dataKey: 'dmgShare' | 'goldShare'
  colorA: string
  colorB: string
  teamA: string
}) {
  const chartData = rows.map((row) => ({
    name: row.name,
    value: row[dataKey],
    fill:
      row.team === teamA || teamMatchesCanonical(row.team, teamA)
        ? colorA
        : colorB,
  }))

  if (!chartData.length) return null

  return (
    <ShareableChart className="card series-game-insight-chart">
      <h3 className="card-title">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 24 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: CHART.tick, fontSize: 9, fontFamily: CHART.fontFamily }}
            interval={0}
            angle={-22}
            textAnchor="end"
            height={48}
          />
          <YAxis
            tick={{ fill: CHART.tick, fontSize: 9, fontFamily: CHART.fontFamily }}
            tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
            width={40}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(1)}%`, title]}
            contentStyle={{
              background: CHART.tooltip.backgroundColor,
              border: CHART.tooltip.border,
            }}
          />
          <Bar dataKey="value" radius={0}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ShareableChart>
  )
}

export default function SeriesGameInsights({
  series,
  game,
  roster,
  players,
  cohortPlayers,
}: SeriesGameInsightsProps) {
  const goldSeriesA = useMemo(
    () => buildSeriesGameGoldSeries(game, series, players, series.teamA),
    [game, series, players],
  )
  const goldSeriesB = useMemo(
    () => buildSeriesGameGoldSeries(game, series, players, series.teamB),
    [game, series, players],
  )

  const distributionRows = useMemo(
    () => buildGameDistributionRows(roster, players, game.id),
    [roster, players, game.id],
  )

  const highlights = useMemo(
    () => findGameStatHighlights(roster, players, game.id, cohortPlayers),
    [roster, players, game.id, cohortPlayers],
  )

  const colorA = radarColorForTeam(series.teamA, series.league)
  const colorB = radarColorForTeam(series.teamB, series.league)

  const goldChartData = useMemo(() => {
    const maxMinute = 30
    const minutes = Array.from({ length: maxMinute + 1 }, (_, i) => i)
    return minutes.map((minute) => {
      const row: Record<string, number | string> = { minute }
      for (const [key, seriesRow] of [
        ['teamA', goldSeriesA],
        ['teamB', goldSeriesB],
      ] as const) {
        if (!seriesRow) continue
        const exact = seriesRow.points.find((p) => p.minute === minute)
        row[key] = exact?.goldDiff ?? 0
      }
      return row
    })
  }, [goldSeriesA, goldSeriesB])

  const hasGold = goldSeriesA || goldSeriesB

  return (
    <div className="series-game-insights">
      {hasGold ? (
        <ShareableChart className="card">
          <h3 className="card-title">Gold Timeline</h3>
          <p className="card-subtitle">
            Gold difference from each team&apos;s perspective (positive = ahead)
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={goldChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="minute"
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
              />
              <YAxis
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
                tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v}`}
              />
              <ReferenceLine y={0} stroke="rgba(240, 236, 226, 0.35)" />
              <Tooltip />
              {goldSeriesA ? (
                <Line
                  type="monotone"
                  dataKey="teamA"
                  name={recapTeamTag(series.teamA)}
                  stroke={colorA}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
              {goldSeriesB ? (
                <Line
                  type="monotone"
                  dataKey="teamB"
                  name={recapTeamTag(series.teamB)}
                  stroke={colorB}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </ShareableChart>
      ) : null}

      <div className="overview-grid overview-grid-2">
        <DistributionChart
          title="Damage Share"
          rows={distributionRows}
          dataKey="dmgShare"
          colorA={colorA}
          colorB={colorB}
          teamA={series.teamA}
        />
        <DistributionChart
          title="Gold Share"
          rows={distributionRows}
          dataKey="goldShare"
          colorA={colorA}
          colorB={colorB}
          teamA={series.teamA}
        />
      </div>

      {highlights.length ? (
        <section className="card">
          <h3 className="card-title">Key Stat Highlights</h3>
          <p className="card-subtitle">Standout performances vs split/tournament role averages</p>
          <ul className="series-game-highlights">
            {highlights.map((h) => (
              <li
                key={`${h.player}-${h.label}`}
                className={`series-game-highlight series-game-highlight-${h.direction}`}
              >
                <span className="series-game-highlight-player">{h.player}</span>
                <span className="series-game-highlight-stat">{h.label}</span>
                <span className="series-game-highlight-value">{h.formatted}</span>
                <span className="text-secondary">
                  {' '}
                  (split avg {h.cohortAvgFormatted})
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
