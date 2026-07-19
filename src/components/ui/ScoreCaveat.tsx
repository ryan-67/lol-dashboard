import { MODEL_VS_FILTER_SCORE_HINT } from '../../lib/metricHints'

interface ScoreCaveatProps {
  className?: string
  /** Shorter inline label before the info control. */
  label?: string
}

/**
 * Footnote + hover/focus disclosure for filter-scoped form vs model current power.
 */
export default function ScoreCaveat({
  className = '',
  label = 'about these scores',
}: ScoreCaveatProps) {
  return (
    <p className={`score-caveat ${className}`.trim()}>
      <span className="score-caveat-trigger" tabIndex={0}>
        <span className="score-caveat-label">{label}</span>
        <span className="score-caveat-mark" aria-hidden="true">
          ?
        </span>
        <span className="score-caveat-popup" role="tooltip">
          {MODEL_VS_FILTER_SCORE_HINT}
        </span>
      </span>
    </p>
  )
}
