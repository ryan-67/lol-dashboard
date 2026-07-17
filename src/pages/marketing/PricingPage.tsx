import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import AuthModal from '../../components/AuthModal'
import { startStripeCheckout } from '../../lib/billing'
import { useAuth } from '../../context/AuthContext'
import { scrollEntrance, scrollEntranceStagger } from '../../theme/animations'

type AuthView = 'signin' | 'signup'

export default function PricingPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState<AuthView>('signup')
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  useGSAP(() => {
    scrollEntrance(rootRef.current?.querySelector('.landing-section-head') ?? null)
    scrollEntranceStagger(rootRef.current, '.landing-price-card')
  }, { scope: rootRef })

  const handleSubscribe = async () => {
    setCheckoutError(null)
    if (!user) {
      setAuthView('signup')
      setShowAuth(true)
      return
    }
    setCheckoutLoading(true)
    try {
      const url = await startStripeCheckout()
      window.location.assign(url)
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'checkout failed')
      setCheckoutLoading(false)
    }
  }

  return (
    <div className="landing-doc" ref={rootRef}>
      <div className="landing-section-head">
        <p className="landing-section-label">pricing</p>
        <h1>free analytics. paid analyst.</h1>
        <p className="landing-section-lead">
          The dashboard stays free to browse. nuckyAI is subscription-gated because LLM inference and
          tool calls have real cost — beta pricing is intentionally low while the product hardens.
        </p>
      </div>

      <div className="landing-pricing-grid">
        <article className="landing-price-card">
          <div className="landing-price-name">dashboard</div>
          <div className="landing-price-amount">
            $0 <span>/ forever</span>
          </div>
          <p className="landing-price-desc">
            Full tier-1 analytics: overview, players, teams, champions, matchups, tournaments, and
            entity pages.
          </p>
          <ul className="landing-price-list">
            <li>league / year / split filters</li>
            <li>radars, form charts, weekly recap</li>
            <li>auto-refreshing OE-backed data</li>
            <li>no account required to browse</li>
          </ul>
          <Link className="landing-btn landing-btn-ghost" to="/dashboard" style={{ marginTop: 'auto' }}>
            open dashboard
          </Link>
        </article>

        <article className="landing-price-card is-featured">
          <div className="landing-price-name">nuckyAI beta</div>
          <div className="landing-price-amount">
            $3.99 <span>/ month</span>
          </div>
          <p className="landing-price-desc">
            Chat with nucky for grounded analyses and structured series predictions. Full launch
            pricing is planned at $5/mo.
          </p>
          <ul className="landing-price-list">
            <li>tool-calling analyst on live OE data</li>
            <li>prediction packets with model drivers</li>
            <li>usage caps during active beta</li>
            <li>cancel anytime via Stripe portal</li>
          </ul>
          <button
            type="button"
            className="landing-btn landing-btn-primary"
            style={{ marginTop: 'auto' }}
            disabled={checkoutLoading}
            onClick={() => void handleSubscribe()}
          >
            {checkoutLoading ? 'redirecting…' : user ? 'subscribe' : 'create account to subscribe'}
          </button>
          {checkoutError ? (
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#c45c5c' }}>{checkoutError}</p>
          ) : null}
        </article>
      </div>

      <p className="landing-model-note" style={{ marginTop: '2rem' }}>
        Pricing covers inference and product development — not betting tips. nucky is an analytics
        product. You are responsible for how you use any lean or probability it surfaces.
      </p>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialView={authView} />
    </div>
  )
}
