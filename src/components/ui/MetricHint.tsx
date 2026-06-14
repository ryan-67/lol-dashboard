interface MetricHintProps {
  label: string
  hint: string
  className?: string
}

/** Instant CSS hover/focus tooltip for metric labels — no native title delay. */
export default function MetricHint({ label, hint, className }: MetricHintProps) {
  return (
    <span className={`metric-hint${className ? ` ${className}` : ''}`} tabIndex={0}>
      <span className="metric-hint-label">{label}</span>
      <span className="metric-hint-popup" role="tooltip">
        {hint}
      </span>
    </span>
  )
}

interface MetricScoreRowProps {
  label: string
  hint: string
  value: string
}

export function MetricScoreRow({ label, hint, value }: MetricScoreRowProps) {
  return (
    <div className="overview-metric-row">
      <MetricHint label={label} hint={hint} />
      <span className="overview-metric-value">{value}</span>
    </div>
  )
}
