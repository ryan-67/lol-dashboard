interface FutureOddsGateProps {
  onSubscribe: () => void
  actionLabel: string
  actionDisabled?: boolean
  compact?: boolean
}

/** Inline upsell for future win% / packets (V3-3) — schedule stays visible. */
export default function FutureOddsGate({
  onSubscribe,
  actionLabel,
  actionDisabled = false,
  compact = false,
}: FutureOddsGateProps) {
  if (compact) {
    return (
      <button
        type="button"
        className="btn btn-secondary predictions-preview-btn"
        disabled={actionDisabled}
        onClick={onSubscribe}
        aria-label={actionLabel}
      >
        unlock odds
      </button>
    )
  }

  return (
    <div className="predictions-future-gate card" role="region" aria-label="Future odds subscription">
      <p className="page-header-eyebrow">future · paid</p>
      <h3 className="card-title">Model forecasts</h3>
      <p className="card-subtitle">
        Schedule and track record stay free. Win probabilities, Kalshi comparison, and full
        prematch / post-draft packets unlock with a subscription.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={actionDisabled}
        onClick={onSubscribe}
      >
        {actionLabel}
      </button>
      <p className="text-tertiary text-sm" style={{ marginTop: '0.75rem' }}>
        Predictions are analytics, not betting advice.
      </p>
    </div>
  )
}
