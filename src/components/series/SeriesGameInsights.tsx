import { useMemo } from 'react'
import {
  Line,
  LineChart,
  CartesianGrid,
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
  findGameStatHighlights,
  resolveSeriesGameGoldTimeline,
} from '../../lib/seriesGameInsights'
import { recapTeamTag } from '../../lib/recapTeamTag'
import { radarColorForTeam } from '../../lib/entities/teamBrandColor'
import { CHART } from '../../theme/chartTheme'
import ShareableChart from '../ui/ShareableChart'
import SeriesShareCharts from './SeriesShareCharts'
import type { CitoGameGoldRecord } from '../../lib/citoGoldMatch'
import type { GolGameGoldRecord } from '../../lib/golGoldMatch'
import { DATA_LOADING, DATA_UNAVAILABLE } from '../../lib/userFacingError'
import type { GoldTimelinePoint } from '../../hooks/useDashboardData'

interface SeriesGameInsightsProps {
  series: ResolvedSeries
  game: EnrichedSeriesGame
  roster: SeriesGameRosterPlayer[]
  players: Player[]
  cohortPlayers: Player[]
  citoGoldRows: CitoGameGoldRecord[]
  golGoldRows?: GolGameGoldRecord[]
  citoGoldLoading?: boolean
}

function interpolateGoldAtMinute(points: GoldTimelinePoint[], minute: number): number | null {
  const exact = points.find((p) => p.minute === minute)
  if (exact) return exact.goldDiff

  const sorted = [...points].sort((a, b) => a.minute - b.minute)
  if (!sorted.length) return null

  const first = sorted[0]!
  if (minute < first.minute) return 0

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]!
    if (minute >= a.minute && minute <= b.minute) {
      const t = (minute - a.minute) / Math.max(b.minute - a.minute, 1)
      return a.goldDiff + t * (b.goldDiff - a.goldDiff)
    }
  }

  return sorted[sorted.length - 1]!.goldDiff
}

export default function SeriesGameInsights({
  series,
  game,
  roster,
  players,
  cohortPlayers,
  citoGoldRows,
  golGoldRows = [],
  citoGoldLoading = false,
}: SeriesGameInsightsProps) {
  const goldSeries = useMemo(
    () =>
      resolveSeriesGameGoldTimeline(
        game,
        series,
        players,
        citoGoldRows,
        series.teamA,
        35,
        golGoldRows,
      ),
    [game, series, players, citoGoldRows, golGoldRows],
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

  const maxMinute = useMemo(() => {
    if (!goldSeries?.points.length) return 30
    return Math.min(40, Math.max(...goldSeries.points.map((p) => p.minute), 30))
  }, [goldSeries])

  const goldChartData = useMemo(() => {
    if (!goldSeries) return []
    const minutes = Array.from({ length: maxMinute + 1 }, (_, i) => i)
    return minutes.map((minute) => ({
      minute,
      goldDiff: interpolateGoldAtMinute(goldSeries.points, minute) ?? 0,
    }))
  }, [goldSeries, maxMinute])

  return (
    <div className="series-game-insights">
      {goldSeries ? (
        <ShareableChart className="card">
          <h3 className="card-title">Gold Timeline</h3>
          <p className="card-subtitle">
            {recapTeamTag(series.teamA)} perspective (positive = ahead)
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
              <Line
                type="monotone"
                dataKey="goldDiff"
                name={recapTeamTag(series.teamA)}
                stroke={colorA}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ShareableChart>
      ) : citoGoldLoading ? (
        <div className="card">
          <h3 className="card-title">Gold Timeline</h3>
          <p className="text-secondary">{DATA_LOADING}</p>
        </div>
      ) : (
        <div className="card">
          <h3 className="card-title">Gold Timeline</h3>
          <p className="text-secondary">{DATA_UNAVAILABLE}</p>
        </div>
      )}

      <SeriesShareCharts
        teamA={series.teamA}
        teamB={series.teamB}
        league={series.league}
        rows={distributionRows}
      />

      {highlights.length ? (
        <section className="card">
          <h3 className="card-title">Key Stat Highlights</h3>
          <p className="card-subtitle">
            Standout performances vs role average for this split/tournament
          </p>
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
                  (role avg {h.cohortAvgFormatted})
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
