import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { EntityLink, TeamLogo } from '../entities'
import { fetchUpcomingCitoScheduleBoard } from '../../lib/loadCitoSchedule'
import {
  invalidateRegionStrengthCache,
} from '../../lib/loadRegionStrength'
import { invalidatePlayerRatingsCache } from '../../lib/loadPlayerRatings'
import { invalidateExternalScheduleCache } from '../../lib/loadExternalSchedule'
import {
  PREDICTION_LEAGUE_FILTERS,
  matchesPredictionLeagueFilter,
  type PredictionLeagueFilter,
} from '../../lib/predictions/leagueFilter'
import {
  buildPredictionBoard,
  formatModelOdds,
  type PredictionBoardRow,
} from '../../lib/predictions/scorePrematchClient'
import {
  subscribeKalshiBoardOdds,
  type KalshiBoardQuote,
} from '../../lib/predictions/kalshiBoardOdds'
import { formatProfileDate } from '../../lib/format'
import { shellAwarePath } from '../../lib/shellPath'

const MODEL_REFRESH_MS = 5 * 60_000

function previewPath(matchId: string, pathname: string): string {
  return shellAwarePath(`/predictions/${encodeURIComponent(matchId)}`, pathname)
}

export default function PredictionScheduleTab() {
  const location = useLocation()
  const [filter, setFilter] = useState<PredictionLeagueFilter>('all')
  const [rows, setRows] = useState<PredictionBoardRow[]>([])
  const [kalshi, setKalshi] = useState<Record<string, KalshiBoardQuote>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelUpdatedAt, setModelUpdatedAt] = useState<string | null>(null)

  const loadBoard = async (forceModel = false) => {
    setError(null)
    try {
      if (forceModel) {
        invalidateRegionStrengthCache()
        invalidatePlayerRatingsCache()
        invalidateExternalScheduleCache()
      }
      const schedule = await fetchUpcomingCitoScheduleBoard({ limit: 150 })
      const board = await buildPredictionBoard(schedule, { forceArtifacts: forceModel })
      setRows(board)
      setModelUpdatedAt(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load schedule')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void loadBoard(true)
    const id = window.setInterval(() => void loadBoard(true), MODEL_REFRESH_MS)
    const onFocus = () => void loadBoard(true)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    return subscribeKalshiBoardOdds(
      () =>
        rows.map((r) => ({
          matchId: r.matchId,
          teamA: r.teamA,
          teamB: r.teamB,
          league: r.league,
          tournament: r.tournament,
        })),
      setKalshi,
    )
  }, [rows])

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesPredictionLeagueFilter(
          {
            match_id: row.matchId,
            league: row.league,
            tournament_name: row.tournament,
            team_a: row.teamA,
            team_b: row.teamB,
            scheduled_at: row.scheduledAt,
            status: 'scheduled',
            block_name: null,
          },
          filter,
        ),
      ),
    [rows, filter],
  )

  return (
    <div className="predictions-schedule-tab">
      <div className="predictions-filters" role="tablist" aria-label="League filter">
        {PREDICTION_LEAGUE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={`predictions-filter-btn${filter === item.id ? ' is-active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="predictions-refresh-meta text-secondary text-sm">
        model odds refresh with artifact updates
        {modelUpdatedAt ? ` · last check ${formatProfileDate(modelUpdatedAt)}` : ''}
        {' · '}
        kalshi polls live (~60s)
      </p>

      {error ? (
        <p className="error-banner">{error}</p>
      ) : loading ? (
        <p className="text-secondary text-sm">loading upcoming series…</p>
      ) : filtered.length === 0 ? (
        <p className="text-secondary text-sm">
          no upcoming series for this filter. EWC and other non-Riot events sync via Leaguepedia
          (`npm run sync:external-schedule`).
        </p>
      ) : (
        <div className="entity-table-wrap predictions-table-wrap">
          <table className="entity-table predictions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Matchup</th>
                <th>Tournament</th>
                <th>Format</th>
                <th>Kalshi</th>
                <th>Model</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const k = kalshi[row.matchId]
                return (
                  <tr key={row.matchId}>
                    <td className="text-secondary whitespace-nowrap">
                      {row.scheduledAt ? formatProfileDate(row.scheduledAt) : 'TBD'}
                    </td>
                    <td>
                      <span className="predictions-matchup">
                        <span className="predictions-team">
                          <TeamLogo name={row.teamA} size={20} />
                          {row.teamA === 'TBD' ? (
                            <span className="text-secondary">TBD</span>
                          ) : (
                            <EntityLink type="team" name={row.teamA} showIcon={false} />
                          )}
                        </span>
                        <span className="text-secondary">vs</span>
                        <span className="predictions-team">
                          <TeamLogo name={row.teamB} size={20} />
                          {row.teamB === 'TBD' ? (
                            <span className="text-secondary">TBD</span>
                          ) : (
                            <EntityLink type="team" name={row.teamB} showIcon={false} />
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="text-secondary">{row.tournament}</td>
                    <td>{row.formatLabel}</td>
                    <td className="text-secondary font-mono" title={k?.ticker ?? undefined}>
                      {k?.display ?? row.kalshiOdds}
                    </td>
                    <td className="text-accent font-mono">{formatModelOdds(row.model)}</td>
                    <td>
                      {row.teamA === 'TBD' || row.teamB === 'TBD' ? (
                        <span className="text-secondary text-sm">—</span>
                      ) : (
                        <Link
                          to={previewPath(row.matchId, location.pathname)}
                          className="btn btn-secondary predictions-preview-btn"
                        >
                          Preview
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
