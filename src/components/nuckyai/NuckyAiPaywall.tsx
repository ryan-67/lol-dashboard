import {
  formatNuckyAiBetaPrice,
  NUCKYAI_BETA_FEATURES,
  nuckyAiBetaUsageLabel,
} from '../../lib/nuckyAiBilling'

interface NuckyAiPaywallProps {
  onAction: () => void
  actionLabel: string
  actionDisabled?: boolean
  footnote?: string
}

export default function NuckyAiPaywall({
  onAction,
  actionLabel,
  actionDisabled = false,
  footnote,
}: NuckyAiPaywallProps) {
  return (
    <div className="nuckyai-paywall">
      <div className="nuckyai-paywall-card">
        <p className="nuckyai-paywall-eyebrow">unlock nucky</p>
        <div className="nuckyai-paywall-price-row">
          <span className="nuckyai-paywall-price">{formatNuckyAiBetaPrice()}</span>
          <span className="nuckyai-paywall-period">/mo</span>
        </div>
        <p className="nuckyai-paywall-tagline">
          Your pro League analyst — grounded in nucky.gg stats, not generic LLM guesses.
        </p>
        <p className="nuckyai-paywall-includes">Includes:</p>
        <ul className="nuckyai-paywall-features">
          {NUCKYAI_BETA_FEATURES.map((feature) => (
            <li key={feature}>
              <span className="nuckyai-paywall-check" aria-hidden="true">
                ✓
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <p className="nuckyai-paywall-usage">{nuckyAiBetaUsageLabel()} during beta</p>
        <button type="button" className="btn btn-primary nuckyai-paywall-cta" disabled={actionDisabled} onClick={onAction}>
          {actionLabel}
        </button>
        <p className="nuckyai-paywall-beta-note">
          nucky is under active development. Beta access helps us improve response quality, tool coverage,
          and accuracy — try it out and send feedback to{' '}
          <a href="mailto:geonbu@nucky.gg">geonbu@nucky.gg</a>.
        </p>
        {footnote ? <p className="nuckyai-paywall-footnote">{footnote}</p> : null}
      </div>
    </div>
  )
}
