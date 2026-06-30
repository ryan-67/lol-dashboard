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
import { TeamLogo } from '../entities'
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

interface GoldLeadTooltipProps {
  teamA: string
  teamB: string
  colorA: string
  colorB: string
  active?: boolean
  payload?: Array<{ payload?: { minute?: number; goldDiff?: number } }>
}

function GoldLeadTooltip({ teamA, teamB, colorA, colorB, active, payload }: GoldLeadTooltipProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point || point.goldDiff == null || point.minute == null) return null
  const gd = point.goldDiff
  const leader = gd > 0 ? teamA : gd < 0 ? teamB : null
  const color = gd > 0 ? colorA : gd < 0 ? colorB : 'var(--text-secondary)'
  return (
    <div
      className="chart-tooltip"
      style={{
        backgroundColor: CHART.tooltip.backgroundColor,
        border: CHART.tooltip.border,
        color: CHART.tooltip.color,
        fontFamily: CHART.fontFamily,
        fontSize: CHART.fontSize,
        padding: '10px 12px',
      }}
    >
      <div className="chart-tooltip-name">{Math.round(point.minute)} min</div>
      <div className="chart-tooltip-row" style={{ color }}>
        {leader
          ? `${recapTeamTag(leader)} +${Math.abs(Math.round(gd)).toLocaleString()} gold`
          : 'Even gold'}
      </div>
    </div>
  )
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
  const colorBRaw = radarColorForTeam(series.teamB, series.league)
  // Guarantee the two team lines are visually distinct even if brand colors collide.
  const colorB = colorBRaw.toLowerCase() === colorA.toLowerCase() ? '#3a7bd5' : colorBRaw

  const maxMinute = useMemo(() => {
    if (!goldSeries?.points.length) return 30
    return Math.min(40, Math.max(...goldSeries.points.map((p) => p.minute), 30))
  }, [goldSeries])

  // Per-minute gold diff from teamA's perspective (positive = teamA ahead).
  const goldChartData = useMemo(() => {
    if (!goldSeries) return []
    const minutes = Array.from({ length: maxMinute + 1 }, (_, i) => i)
    return minutes.map((minute) => ({
      minute,
      goldDiff: interpolateGoldAtMinute(goldSeries.points, minute) ?? 0,
    }))
  }, [goldSeries, maxMinute])

  // Symmetric y-axis bound so 0 sits at the vertical center; both directions
  // measure the gold lead of whichever team is ahead.
  const absMax = useMemo(() => {
    const peak = Math.max(0, ...goldChartData.map((d) => Math.abs(d.goldDiff)))
    if (peak <= 0) return 1000
    const step = peak > 8000 ? 2000 : peak > 4000 ? 1000 : 500
    return Math.ceil(peak / step) * step
  }, [goldChartData])

  // Split the single timeline into two sign-clamped series so the line is
  // colored by the leading team, inserting a zero point at each lead change.
  const dualChartData = useMemo(() => {
    const out: Array<{ minute: number; goldDiff: number; aLead: number | null; bLead: number | null }> = []
    for (let i = 0; i < goldChartData.length; i++) {
      const cur = goldChartData[i]!
      out.push({
        minute: cur.minute,
        goldDiff: cur.goldDiff,
        aLead: cur.goldDiff >= 0 ? cur.goldDiff : null,
        bLead: cur.goldDiff <= 0 ? cur.goldDiff : null,
      })
      const next = goldChartData[i + 1]
      if (next && ((cur.goldDiff > 0 && next.goldDiff < 0) || (cur.goldDiff < 0 && next.goldDiff > 0))) {
        const t = cur.goldDiff / (cur.goldDiff - next.goldDiff)
        const crossMinute = cur.minute + t * (next.minute - cur.minute)
        out.push({ minute: crossMinute, goldDiff: 0, aLead: 0, bLead: 0 })
      }
    }
    return out
  }, [goldChartData])

  const xTicks = useMemo(() => {
    const ticks: number[] = []
    for (let m = 0; m <= maxMinute; m += 5) ticks.push(m)
    if (ticks[ticks.length - 1] !== maxMinute) ticks.push(maxMinute)
    return ticks
  }, [maxMinute])

  const yTicks = useMemo(
    () => [-absMax, -absMax / 2, 0, absMax / 2, absMax],
    [absMax],
  )

  return (
    <div className="series-game-insights">
      {goldSeries ? (
        <ShareableChart className="card">
          <h3 className="card-title">Gold Timeline</h3>
          <p className="card-subtitle">
            Gold lead by team — line color shows who is ahead at each minute
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dualChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="minute"
                domain={[0, maxMinute]}
                ticks={xTicks}
                allowDecimals={false}
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
              />
              <YAxis
                domain={[-absMax, absMax]}
                ticks={yTicks}
                allowDecimals={false}
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
                tickFormatter={(v) => {
                  const a = Math.abs(Number(v))
                  return a >= 1000 ? `${(a / 1000).toFixed(a % 1000 === 0 ? 0 : 1)}k` : String(a)
                }}
              />
              <ReferenceLine y={0} stroke="rgba(240, 236, 226, 0.45)" />
              <Tooltip
                content={
                  <GoldLeadTooltip
                    teamA={series.teamA}
                    teamB={series.teamB}
                    colorA={colorA}
                    colorB={colorB}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="aLead"
                name={recapTeamTag(series.teamA)}
                stroke={colorA}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="bLead"
                name={recapTeamTag(series.teamB)}
                stroke={colorB}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="gold-timeline-legend">
            <span className="gold-timeline-legend-item">
              <TeamLogo name={series.teamA} size={18} />
              <span className="gold-timeline-legend-swatch" style={{ backgroundColor: colorA }} />
              <span className="gold-timeline-legend-label">{recapTeamTag(series.teamA)} lead</span>
            </span>
            <span className="gold-timeline-legend-item">
              <TeamLogo name={series.teamB} size={18} />
              <span className="gold-timeline-legend-swatch" style={{ backgroundColor: colorB }} />
              <span className="gold-timeline-legend-label">{recapTeamTag(series.teamB)} lead</span>
            </span>
          </div>
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
