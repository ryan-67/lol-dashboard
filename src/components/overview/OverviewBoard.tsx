import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { EntityLink, TeamLogo } from '../entities'
import { fetchUpcomingCitoScheduleBoard } from '../../lib/loadCitoSchedule'
import {
  PREDICTION_LEAGUE_FILTERS,
  matchesPredictionLeagueFilter,
  type PredictionLeagueFilter,
} from '../../lib/predictions/leagueFilter'
import {
  draftByMatchId,
  fetchLiveDraftsBundle,
  type LiveDraftsBundle,
} from '../../lib/loadLiveDrafts'
import { formatProfileDate } from '../../lib/format'
import { shellAwarePath } from '../../lib/shellPath'
import type { CitoScheduleRow } from '../../lib/loadCitoSchedule'
import TrackRecordStrip from '../predictions/TrackRecordStrip'

/**
 * Free Overview Board — upcoming schedule + tournament context + post-draft badges.
 * Win% / full packets stay on Predictions (V3-3 gate); Board never blank.
 */
export default function OverviewBoard() {
  const location = useLocation()
  const [filter, setFilter] = useState<PredictionLeagueFilter>('all')
  const [rows, setRows] = useState<CitoScheduleRow[]>([])
  const [drafts, setDrafts] = useState<LiveDraftsBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void Promise.all([
      fetchUpcomingCitoScheduleBoard({ limit: 150 }),
      fetchLiveDraftsBundle(true),
    ])
      .then(([schedule, draftBundle]) => {
        if (cancelled) return
        setRows(schedule)
        setDrafts(draftBundle)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'failed to load schedule')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(
    () => rows.filter((row) => matchesPredictionLeagueFilter(row, filter)),
    [rows, filter],
  )

  const predictionsPath = shellAwarePath('/predictions', location.pathname)

  return (
    <section className="overview-board" aria-label="Upcoming board">
      <section className="card overview-hub-card overview-hub-hero">
        <div className="overview-hub-hero-copy">
          <p className="page-header-eyebrow">foresight</p>
          <h2 className="card-title">Board</h2>
          <p className="card-subtitle">
            Upcoming tier-1 series — who plays whom, when, and in what event. Post-draft games are
            flagged when Cito locks picks. Model win probabilities and full packets live on{' '}
            <Link to={predictionsPath} className="text-accent">
              Predictions
            </Link>
            .
          </p>
        </div>
      </section>

      <TrackRecordStrip />

      <div className="predictions-filters" role="tablist" aria-label="League filter">
        {PREDICTION_LEAGUE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            tabIndex={0}
            className={`predictions-filter-btn${filter === item.id ? ' is-active' : ''}`}
            onClick={() => setFilter(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setFilter(item.id)
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="error-banner">{error}</p>
      ) : loading ? (
        <p className="text-secondary text-sm">loading upcoming series…</p>
      ) : filtered.length === 0 ? (
        <p className="text-secondary text-sm">no upcoming series for this filter.</p>
      ) : (
        <div className="entity-table-wrap predictions-table-wrap">
          <table className="entity-table predictions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Matchup</th>
                <th>Tournament</th>
                <th>Format</th>
                <th>Draft</th>
                <th>Analysis</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const format =
                  typeof row.best_of === 'number' ? `Bo${row.best_of}` : 'TBD'
                const preview = shellAwarePath(
                  `/predictions/${encodeURIComponent(row.match_id)}`,
                  location.pathname,
                )
                const draft = draftByMatchId(drafts, row.match_id)
                return (
                  <tr key={row.match_id}>
                    <td className="text-secondary whitespace-nowrap">
                      {row.scheduled_at ? formatProfileDate(row.scheduled_at) : 'TBD'}
                    </td>
                    <td>
                      <span className="predictions-matchup">
                        <span className="predictions-team">
                          <TeamLogo name={row.team_a} size={20} />
                          {row.team_a === 'TBD' ? (
                            <span className="text-secondary">TBD</span>
                          ) : (
                            <EntityLink type="team" name={row.team_a} showIcon={false} />
                          )}
                        </span>
                        <span className="text-secondary">vs</span>
                        <span className="predictions-team">
                          <TeamLogo name={row.team_b} size={20} />
                          {row.team_b === 'TBD' ? (
                            <span className="text-secondary">TBD</span>
                          ) : (
                            <EntityLink type="team" name={row.team_b} showIcon={false} />
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="text-secondary">
                      {row.tournament_name ?? row.league}
                    </td>
                    <td>{format}</td>
                    <td>
                      {draft?.draftComplete ? (
                        <span className="text-accent text-sm">
                          post-draft
                          {draft.gameNumber != null ? ` g${draft.gameNumber}` : ''}
                        </span>
                      ) : (
                        <span className="text-tertiary text-sm">—</span>
                      )}
                    </td>
                    <td>
                      {row.team_a === 'TBD' || row.team_b === 'TBD' ? (
                        <span className="text-secondary text-sm">—</span>
                      ) : (
                        <Link
                          to={preview}
                          className="btn btn-secondary predictions-preview-btn"
                        >
                          {draft?.draftComplete ? 'Post-draft' : 'Open'}
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
    </section>
  )
}
