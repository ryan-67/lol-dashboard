import { Link } from 'react-router-dom'

interface PricingSectionProps {
  signedIn: boolean
  checkoutLoading: boolean
  checkoutError: string | null
  onSubscribe: () => void
}

/** Pricing — free dashboard vs nucky beta. Checkout flow stays intact. */
export default function PricingSection({
  signedIn,
  checkoutLoading,
  checkoutError,
  onSubscribe,
}: PricingSectionProps) {
  return (
    <section
      className="pricing landing-inner"
      id="pricing"
      data-companion="point-up"
      data-companion-x="0"
      data-companion-y="30"
      data-companion-scale="0.4"
      data-companion-opacity="0.8"
      aria-label="Pricing"
    >
      <div className="section-head">
        <p className="section-label" data-reveal="blur-in">pricing</p>
        <h2 className="section-title" data-motion-text>
          free analytics. paid analyst.
        </h2>
        <p className="section-lead" data-reveal="fade-up">
          Browse the statistics dashboard without an account. Subscribe when you want retrieval,
          model explanations, and conversational analysis.
        </p>
      </div>

      <div className="pricing-grid" data-reveal-group>
        <article className="price-card" data-reveal-item>
          <div className="price-name">dashboard</div>
          <div className="price-amount">
            $0 <span>/ forever</span>
          </div>
          <p className="price-desc">
            Tier-1 analytics across players, teams, champions, matchups, and tournaments.
          </p>
          <ul className="price-list">
            <li>league, year, and split filters</li>
            <li>radars, form charts, rankings, and trends</li>
            <li>auto-refreshing professional match data</li>
            <li>no account required to browse</li>
          </ul>
          <Link className="landing-btn landing-btn-ghost" to="/dashboard" data-magnetic>
            open dashboard
          </Link>
        </article>

        <article className="price-card is-featured" data-reveal-item>
          <div className="price-flag">beta</div>
          <div className="price-name">nucky beta</div>
          <div className="price-amount">
            $3.99 <span>/ month</span>
          </div>
          <p className="price-desc">
            Retrieval-augmented conversation, grounded analyses, and structured series predictions.
            Full launch pricing is planned at $5 per month.
          </p>
          <ul className="price-list">
            <li>LoL esports-specific retrieval and tools</li>
            <li>prediction packets with model drivers</li>
            <li>usage caps during active beta</li>
            <li>cancel anytime through Stripe</li>
          </ul>
          <button
            type="button"
            className="landing-btn landing-btn-primary"
            disabled={checkoutLoading}
            onClick={onSubscribe}
            data-magnetic
          >
            {checkoutLoading ? 'redirecting…' : signedIn ? 'subscribe' : 'create account to subscribe'}
          </button>
          {checkoutError ? <p className="price-error">{checkoutError}</p> : null}
        </article>
      </div>
    </section>
  )
}
