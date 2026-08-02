import { useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

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
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || reducedMotion()) return

      /* Plates rise with a slight clip wipe; amounts count up. */
      gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.price-card')).forEach((card, i) => {
        const amount = card.querySelector<HTMLElement>('.price-amount-value')
        const target = Number(amount?.dataset.amount || 0)
        const tl = gsap.timeline({
          scrollTrigger: { trigger: card, start: MOTION.revealStart, once: true },
        })
        tl.fromTo(
          card,
          { autoAlpha: 0, y: 46, clipPath: 'inset(4% 3% 10% 3% round 16px)' },
          {
            autoAlpha: 1,
            y: 0,
            clipPath: 'inset(0% 0% 0% 0% round 16px)',
            duration: 1,
            delay: i * 0.12,
            ease: MOTION.easeOut,
          },
        ).fromTo(
          card.querySelectorAll('.price-list li'),
          { autoAlpha: 0, x: -14 },
          { autoAlpha: 1, x: 0, duration: 0.5, stagger: 0.06, ease: MOTION.easeOut },
          0.35,
        )
        if (amount && target > 0) {
          const state = { val: 0 }
          tl.to(
            state,
            {
              val: target,
              duration: 1.1,
              ease: 'power2.out',
              onUpdate: () => {
                amount.textContent = `$${state.val.toFixed(2)}`
              },
              onComplete: () => {
                amount.textContent = `$${target.toFixed(2)}`
              },
            },
            0.25,
          )
        }
      })
    },
    { scope: rootRef },
  )

  return (
    <section
      className="pricing landing-inner"
      ref={rootRef}
      id="pricing"
      data-accent-hue="195"
      aria-label="Pricing"
    >
      <div className="section-head">
        <p className="section-label" data-reveal="blur-in">pricing</p>
        <h2 className="section-title" data-motion-text>
          the current is free. the future is paid.
        </h2>
        <p className="section-lead" data-reveal="fade-up">
          Current-form analysis — the model&rsquo;s scores, rankings, and trends — is free to
          browse, no account required. Predictions of what happens next are part of the paid plan.
        </p>
      </div>

      <div className="pricing-grid">
        <article className="price-card" data-tilt="2.6" style={{ opacity: 0 }}>
          <div className="price-name">dashboard</div>
          <div className="price-amount">
            <span className="price-amount-value">$0</span>
            <span className="price-amount-per">/ forever</span>
          </div>
          <p className="price-desc">
            Current-form analytics across players, teams, champions, matchups, and tournaments —
            the model&rsquo;s scores, visualized.
          </p>
          <ul className="price-list">
            <li>current form + trends — no future predictions</li>
            <li>radars, form charts, rankings, and trends</li>
            <li>league, year, and split filters</li>
            <li>no account required to browse</li>
          </ul>
          <Link className="landing-btn landing-btn-ghost" to="/dashboard" data-magnetic>
            <span className="btn-label">open dashboard</span>
            <span className="landing-btn-icon" aria-hidden="true">→</span>
          </Link>
        </article>

        <article className="price-card is-featured" data-tilt="2.6" style={{ opacity: 0 }}>
          <span className="price-sheen" aria-hidden="true" />
          <div className="price-flag">beta</div>
          <div className="price-name">nucky beta</div>
          <div className="price-amount">
            <span className="price-amount-value" data-amount="3.99">
              $3.99
            </span>
            <span className="price-amount-per">/ month</span>
          </div>
          <p className="price-desc">
            The future, unlocked — structured series predictions, win probabilities, and
            retrieval-augmented conversation. Full launch pricing is planned at $5 per month.
          </p>
          <ul className="price-list">
            <li>series predictions with model drivers</li>
            <li>win probability + confidence, per series</li>
            <li>LoL esports-specific retrieval and tools</li>
            <li>cancel anytime through Stripe · beta usage caps</li>
          </ul>
          <button
            type="button"
            className="landing-btn landing-btn-primary"
            disabled={checkoutLoading}
            onClick={onSubscribe}
            data-magnetic
          >
            <span className="btn-label">
              {checkoutLoading ? 'redirecting…' : signedIn ? 'subscribe' : 'create account to subscribe'}
            </span>
            <span className="landing-btn-icon" aria-hidden="true">→</span>
          </button>
          {checkoutError ? <p className="price-error">{checkoutError}</p> : null}
        </article>
      </div>
    </section>
  )
}
