import { useEffect, useState } from 'react'
import {
  fetchAccuracyScorecard,
  formatPct,
  type AccuracyScorecard,
} from '../../lib/accuracyScorecard'
import { formatModelUpdatedDate } from '../../lib/format'

/** Free trust strip — track record adjacent to Board / Predictions (V3-3). */
export default function TrackRecordStrip() {
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

  if (!scorecard) return null

  return (
    <section className="predictions-track-strip card" aria-label="Model track record">
      <div className="predictions-track-strip-copy">
        <p className="page-header-eyebrow">track record</p>
        <p className="card-subtitle" style={{ marginBottom: 0 }}>
          Walk-forward holdout — free trust signal for the forecasts behind the paywall.
          {scorecard.generatedAt
            ? ` · model ${formatModelUpdatedDate(scorecard.generatedAt)}`
            : ''}
        </p>
      </div>
      <div className="predictions-track-strip-metrics">
        <div>
          <div className="text-accent font-mono text-lg">
            {formatPct(scorecard.aggregate.model.accuracy, 1)}
          </div>
          <div className="text-tertiary text-xs">holdout acc</div>
        </div>
        <div>
          <div className="font-mono text-lg">
            {formatPct(scorecard.aggregate.baseline.accuracy, 1)}
          </div>
          <div className="text-tertiary text-xs">baseline</div>
        </div>
        <div>
          <div className="font-mono text-lg">{scorecard.holdoutSeries}</div>
          <div className="text-tertiary text-xs">series</div>
        </div>
      </div>
    </section>
  )
}
