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
import {
  draftByMatchId,
  fetchLiveDraftsBundle,
  type LiveDraftsBundle,
} from '../../lib/loadLiveDrafts'
import { formatProfileDate } from '../../lib/format'
import { shellAwarePath } from '../../lib/shellPath'
import FutureOddsGate from './FutureOddsGate'

const MODEL_REFRESH_MS = 5 * 60_000

function previewPath(matchId: string, pathname: string): string {
  return shellAwarePath(`/predictions/${encodeURIComponent(matchId)}`, pathname)
}

interface PredictionScheduleTabProps {
  /** When false, hide win% / Kalshi and show unlock CTA (V3-3 future gate). */
  showForecast?: boolean
  onUnlockForecast?: () => void
  unlockLabel?: string
  unlockDisabled?: boolean
}

export default function PredictionScheduleTab({
  showForecast = true,
  onUnlockForecast,
  unlockLabel = 'subscribe for odds',
  unlockDisabled = false,
}: PredictionScheduleTabProps) {
  const location = useLocation()
  const [filter, setFilter] = useState<PredictionLeagueFilter>('all')
  const [rows, setRows] = useState<PredictionBoardRow[]>([])
  const [kalshi, setKalshi] = useState<Record<string, KalshiBoardQuote>>({})
  const [drafts, setDrafts] = useState<LiveDraftsBundle | null>(null)
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
      if (showForecast) {
        const board = await buildPredictionBoard(schedule, { forceArtifacts: forceModel })
        setRows(board)
        setModelUpdatedAt(new Date().toISOString())
      } else {
        setRows(
          schedule.map((row) => ({
            matchId: row.match_id,
            scheduledAt: row.scheduled_at,
            teamA: row.team_a,
            teamB: row.team_b,
            league: row.league,
            tournament: row.tournament_name ?? row.league,
            formatLabel: typeof row.best_of === 'number' ? `Bo${row.best_of}` : 'TBD',
            bestOf: typeof row.best_of === 'number' ? row.best_of : null,
            kalshiOdds: '—',
            model: {
              winProbA: 0.5,
              winProbB: 0.5,
              eloA: null,
              eloB: null,
              powerA: null,
              powerB: null,
              rosterPowerA: null,
              rosterPowerB: null,
              confidence: 'low',
              source: 'unavailable',
            },
          })),
        )
      }
      const draftBundle = await fetchLiveDraftsBundle(forceModel)
      setDrafts(draftBundle)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when gate flips
  }, [showForecast])

  useEffect(() => {
    if (!showForecast) return
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
  }, [rows, showForecast])

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

      <p className="predictions-refresh-meta text-secondary text-sm">
        {showForecast
          ? `model odds refresh with artifact updates${
              modelUpdatedAt ? ` · last check ${formatProfileDate(modelUpdatedAt)}` : ''
            } · kalshi polls live (~60s)`
          : 'schedule free · win probabilities and packets require a subscription'}
        {drafts?.drafts?.length
          ? ` · ${drafts.drafts.length} post-draft game${drafts.drafts.length === 1 ? '' : 's'} live`
          : ''}
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
                <th>Draft</th>
                {showForecast ? (
                  <>
                    <th>Kalshi</th>
                    <th>Model</th>
                    <th>Preview</th>
                  </>
                ) : (
                  <th>Forecast</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const k = kalshi[row.matchId]
                const draft = draftByMatchId(drafts, row.matchId)
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
                    <td>
                      {draft?.draftComplete ? (
                        <span className="text-accent text-sm" title="Draft locked — post-draft packet available">
                          post-draft
                          {draft.gameNumber != null ? ` g${draft.gameNumber}` : ''}
                        </span>
                      ) : (
                        <span className="text-tertiary text-sm">—</span>
                      )}
                    </td>
                    {showForecast ? (
                      <>
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
                              {draft?.draftComplete ? 'Post-draft' : 'Preview'}
                            </Link>
                          )}
                        </td>
                      </>
                    ) : (
                      <td>
                        {onUnlockForecast ? (
                          <FutureOddsGate
                            compact
                            onSubscribe={onUnlockForecast}
                            actionLabel={unlockLabel}
                            actionDisabled={unlockDisabled}
                          />
                        ) : (
                          <span className="text-tertiary text-sm">subscribe</span>
                        )}
                      </td>
                    )}
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
