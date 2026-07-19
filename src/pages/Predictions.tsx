import { useEffect, useState } from 'react'
import PageHeader from '../components/ui/PageHeader'
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
import {
  PredictionChampionRankings,
  PredictionPlayerRankings,
  PredictionTeamRankings,
} from '../components/predictions/PredictionRankingsPanels'

type ModelTab =
  | 'schedule'
  | 'team-rankings'
  | 'player-rankings'
  | 'champion-rankings'
  | 'analysis'

const MODEL_TABS: { id: ModelTab; label: string }[] = [
  { id: 'schedule', label: 'Schedule' },
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
        subtitle="Upcoming series with live Kalshi comparison, model odds that track retrain artifacts, and current power boards."
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
      {tab === 'team-rankings' ? <PredictionTeamRankings /> : null}
      {tab === 'player-rankings' ? <PredictionPlayerRankings /> : null}
      {tab === 'champion-rankings' ? <PredictionChampionRankings /> : null}
      {tab === 'analysis' ? <PredictionAnalysisTab /> : null}
    </div>
  )
}
