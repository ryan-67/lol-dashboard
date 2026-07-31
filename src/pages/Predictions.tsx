import { useEffect, useState } from 'react'
import PageHeader, { PageHeaderReadout } from '../components/ui/PageHeader'
import NuckyAiPaywall from '../components/nuckyai/NuckyAiPaywall'
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

const MODEL_TABS: { id: ModelTab; label: string }[] = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'log', label: 'Log' },
  { id: 'team-rankings', label: 'Team rankings' },
  { id: 'player-rankings', label: 'Player rankings' },
  { id: 'champion-rankings', label: 'Champion rankings' },
  { id: 'analysis', label: 'Analysis' },
]

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
          eyebrow="nucky prediction model"
          title="nucky prediction model"
          subtitle="Schedule board, model power rankings, and pre-match analysis — subscribe for access."
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
          footnote="Predictions are analytics, not betting advice. Kalshi odds are display-only."
        />
        <AuthModal open={Boolean(chat?.showAuth)} onClose={() => chat?.setShowAuth(false)} />
      </div>
    )
  }

  return (
    <div className="page-section predictions-page">
      <PageHeader
        eyebrow="nucky prediction model"
        title="nucky prediction model"
        subtitle="Upcoming series, a completed-series accuracy log, model power rankings, and pre-match analysis."
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

      <div className="predictions-model-tabs" role="tablist" aria-label="Prediction model sections">
        {MODEL_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`predictions-model-tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'schedule' ? <PredictionScheduleTab /> : null}
      {tab === 'log' ? <PredictionLogTab /> : null}
      {tab === 'team-rankings' ? <PredictionTeamRankings /> : null}
      {tab === 'player-rankings' ? <PredictionPlayerRankings /> : null}
      {tab === 'champion-rankings' ? <PredictionChampionRankings /> : null}
      {tab === 'analysis' ? <PredictionAnalysisTab /> : null}
    </div>
  )
}
