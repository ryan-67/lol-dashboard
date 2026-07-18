import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import NuckyAiPaywall from '../components/nuckyai/NuckyAiPaywall'
import AuthModal from '../components/AuthModal'
import { EntityLink, TeamLogo } from '../components/entities'
import { useOptionalChatSession } from '../context/ChatSessionContext'
import {
  fetchUpcomingCitoScheduleBoard,
} from '../lib/loadCitoSchedule'
import {
  PREDICTION_LEAGUE_FILTERS,
  matchesPredictionLeagueFilter,
  type PredictionLeagueFilter,
} from '../lib/predictions/leagueFilter'
import {
  buildPredictionBoard,
  formatModelOdds,
  type PredictionBoardRow,
} from '../lib/predictions/scorePrematchClient'
import {
  fetchAccuracyScorecard,
  formatPct,
  type AccuracyScorecard,
} from '../lib/accuracyScorecard'
import { formatProfileDate } from '../lib/format'
import { shellAwarePath } from '../lib/shellPath'

function previewPath(matchId: string, pathname: string): string {
  return shellAwarePath(`/predictions/${encodeURIComponent(matchId)}`, pathname)
}

export default function Predictions() {
  const location = useLocation()
  const chat = useOptionalChatSession()
  const isSubscribed = Boolean(chat?.isSubscribed)
  const subscriptionReady = chat?.subscriptionReady !== false

  const [filter, setFilter] = useState<PredictionLeagueFilter>('all')
  const [rows, setRows] = useState<PredictionBoardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scorecard, setScorecard] = useState<AccuracyScorecard | null>(null)

  useEffect(() => {
    let alive = true
    void fetchAccuracyScorecard().then((sc) => {
      if (alive) setScorecard(sc)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!isSubscribed) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const schedule = await fetchUpcomingCitoScheduleBoard({ limit: 150 })
        const board = await buildPredictionBoard(schedule)
        if (!alive) return
        setRows(board)
      } catch (err) {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'failed to load schedule')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [isSubscribed])

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

  if (!subscriptionReady) {
    return (
      <div className="page-section predictions-page">
        <p className="text-secondary text-sm">loading…</p>
      </div>
    )
  }

  if (!isSubscribed) {
    return (
      <div className="page-section predictions-page">
        <PageHeader
          eyebrow="predictions"
          title="prediction model"
          subtitle="Upcoming tier-1 series with nucky model odds — subscribe for access."
        />
        <NuckyAiPaywall
          onAction={() => {
            if (!chat?.user) chat?.setShowAuth(true)
            else void chat.subscribe()
          }}
          actionLabel={
            !chat?.user
              ? 'sign in to subscribe'
              : chat.checkoutLoading
                ? 'loading…'
                : 'subscribe for access'
          }
          actionDisabled={Boolean(chat?.checkoutLoading)}
          footnote="Predictions are analytics, not betting advice. Kalshi odds shown for comparison only when available."
        />
        <AuthModal
          open={Boolean(chat?.showAuth)}
          onClose={() => chat?.setShowAuth(false)}
        />
      </div>
    )
  }

  return (
    <div className="page-section predictions-page">
      <PageHeader
        eyebrow="predictions"
        title="prediction model"
        subtitle="Confirmed upcoming series — model odds from nucky team Elo (Kalshi display-only)."
      />

      {scorecard ? (
        <div className="predictions-scorecard" aria-label="Model track record">
          <span className="predictions-scorecard-label">holdout accuracy</span>
          <span className="predictions-scorecard-value text-accent">
            {formatPct(scorecard.aggregate.model.accuracy, 1)}
          </span>
          <span className="predictions-scorecard-meta text-secondary">
            vs {formatPct(scorecard.aggregate.baseline.accuracy, 1)} baseline ·{' '}
            {scorecard.holdoutSeries} series
          </span>
        </div>
      ) : null}

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

      {error ? (
        <p className="error-banner">{error}</p>
      ) : loading ? (
        <p className="text-secondary text-sm">loading upcoming series…</p>
      ) : filtered.length === 0 ? (
        <p className="text-secondary text-sm">
          no confirmed upcoming series for this filter. check back after the next schedule sync.
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
              {filtered.map((row) => (
                <tr key={row.matchId}>
                  <td className="text-secondary whitespace-nowrap">
                    {row.scheduledAt ? formatProfileDate(row.scheduledAt) : 'TBD'}
                  </td>
                  <td>
                    <span className="predictions-matchup">
                      <span className="predictions-team">
                        <TeamLogo name={row.teamA} size={20} />
                        <EntityLink type="team" name={row.teamA} showIcon={false} />
                      </span>
                      <span className="text-secondary">vs</span>
                      <span className="predictions-team">
                        <TeamLogo name={row.teamB} size={20} />
                        <EntityLink type="team" name={row.teamB} showIcon={false} />
                      </span>
                    </span>
                  </td>
                  <td className="text-secondary">{row.tournament}</td>
                  <td>{row.formatLabel}</td>
                  <td className="text-secondary">{row.kalshiOdds}</td>
                  <td className="text-accent font-mono">{formatModelOdds(row.model)}</td>
                  <td>
                    <Link
                      to={previewPath(row.matchId, location.pathname)}
                      className="btn btn-secondary predictions-preview-btn"
                    >
                      Preview
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
