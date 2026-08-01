import { useEffect, useState } from 'react'
import PageHeader, { PageHeaderReadout } from '../components/ui/PageHeader'
import AuthModal from '../components/AuthModal'
import { useOptionalChatSession } from '../context/ChatSessionContext'
import {
  fetchAccuracyScorecard,
  formatPct,
  type AccuracyScorecard,
} from '../lib/accuracyScorecard'
import PredictionScheduleTab from '../components/predictions/PredictionScheduleTab'
import PredictionAnalysisTab from '../components/predictions/PredictionAnalysisTab'
import PredictionLogTab from '../components/predictions/PredictionLogTab'
import FutureOddsGate from '../components/predictions/FutureOddsGate'
import TrackRecordStrip from '../components/predictions/TrackRecordStrip'
import {
  PredictionChampionRankings,
  PredictionPlayerRankings,
  PredictionTeamRankings,
} from '../components/predictions/PredictionRankingsPanels'

type ModelTab =
  | 'schedule'
  | 'log'
  | 'team-rankings'
  | 'player-rankings'
  | 'champion-rankings'
  | 'analysis'

const FREE_TABS: { id: ModelTab; label: string }[] = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'log', label: 'Log' },
  { id: 'team-rankings', label: 'Team rankings' },
  { id: 'player-rankings', label: 'Player rankings' },
  { id: 'champion-rankings', label: 'Champion rankings' },
]

const PAID_TABS: { id: ModelTab; label: string }[] = [
  { id: 'analysis', label: 'Analysis' },
]

/**
 * V3-3: Predictions shell is free (schedule + track record + current rankings).
 * Future win% / packets / analysis depth require subscription.
 */
export default function Predictions() {
  const chat = useOptionalChatSession()
  const isSubscribed = Boolean(chat?.isSubscribed)
  const subscriptionReady = chat?.subscriptionReady !== false
  const [tab, setTab] = useState<ModelTab>('schedule')
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
    if (!isSubscribed && tab === 'analysis') setTab('schedule')
  }, [isSubscribed, tab])

  const handleUnlock = () => {
    if (!chat?.user) chat?.setShowAuth(true)
    else void chat.subscribe()
  }

  const unlockLabel = !chat?.user
    ? 'sign in to subscribe'
    : chat.checkoutLoading
      ? 'loading…'
      : 'subscribe for future odds'

  if (!subscriptionReady) {
    return (
      <div className="page-section predictions-page">
        <p className="text-secondary text-sm">loading…</p>
      </div>
    )
  }

  const tabs = isSubscribed ? [...FREE_TABS, ...PAID_TABS] : FREE_TABS

  return (
    <div className="page-section predictions-page">
      <PageHeader
        eyebrow="nucky prediction model"
        title="nucky prediction model"
        subtitle={
          isSubscribed
            ? 'Upcoming series, post-draft packets, completed-series log, and model rankings.'
            : 'Schedule and current power boards are free. Win probabilities and full packets are paid.'
        }
        meta={
          scorecard ? (
            <>
              <PageHeaderReadout
                label="holdout"
                value={
                  <span className="text-accent">
                    {formatPct(scorecard.aggregate.model.accuracy, 1)}
                  </span>
                }
              />
              <PageHeaderReadout
                label="baseline"
                value={formatPct(scorecard.aggregate.baseline.accuracy, 1)}
              />
              <PageHeaderReadout label="series" value={scorecard.holdoutSeries} />
            </>
          ) : undefined
        }
      />

      <TrackRecordStrip />

      <div className="predictions-model-tabs" role="tablist" aria-label="Prediction model sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            tabIndex={0}
            className={`predictions-model-tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTab(item.id)
              }
            }}
          >
            {item.label}
          </button>
        ))}
        {!isSubscribed ? (
          <button
            type="button"
            className="predictions-model-tab"
            onClick={handleUnlock}
            aria-label="Unlock analysis"
          >
            Analysis · paid
          </button>
        ) : null}
      </div>

      {tab === 'schedule' ? (
        <PredictionScheduleTab
          showForecast={isSubscribed}
          onUnlockForecast={handleUnlock}
          unlockLabel={unlockLabel}
          unlockDisabled={Boolean(chat?.checkoutLoading)}
        />
      ) : null}
      {tab === 'log' ? <PredictionLogTab /> : null}
      {tab === 'team-rankings' ? <PredictionTeamRankings /> : null}
      {tab === 'player-rankings' ? <PredictionPlayerRankings /> : null}
      {tab === 'champion-rankings' ? <PredictionChampionRankings /> : null}
      {tab === 'analysis' && isSubscribed ? <PredictionAnalysisTab /> : null}
      {tab === 'analysis' && !isSubscribed ? (
        <FutureOddsGate
          onSubscribe={handleUnlock}
          actionLabel={unlockLabel}
          actionDisabled={Boolean(chat?.checkoutLoading)}
        />
      ) : null}

      {!isSubscribed && tab === 'schedule' ? (
        <div style={{ marginTop: '1.25rem' }}>
          <FutureOddsGate
            onSubscribe={handleUnlock}
            actionLabel={unlockLabel}
            actionDisabled={Boolean(chat?.checkoutLoading)}
          />
        </div>
      ) : null}

      <AuthModal open={Boolean(chat?.showAuth)} onClose={() => chat?.setShowAuth(false)} />
    </div>
  )
}
