import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import { scrollEntrance, scrollEntranceStagger } from '../../theme/animations'

const FEATURES = [
  {
    title: 'tier-1 dashboard',
    body: 'Overview hub, Players, Teams, Champions, Matchups, and Tournaments with league / year / split filters that apply everywhere. Identity pages for every major player, team, and champion.',
  },
  {
    title: 'proprietary rating stack',
    body: 'Series-grain region Elo, role-based player ratings, and an empirical champion matchup matrix. These are the live scoring inputs — not scraped leaderboard ranks.',
  },
  {
    title: 'nuckyAI analyst',
    body: 'Subscription chat that streams answers grounded in the same pro-play database, with structured prediction packets for series leans, draft context, and failure modes.',
  },
  {
    title: 'walk-forward scorecard',
    body: 'Public accuracy, log-loss, and league slices from out-of-fold evaluation. Ship gate requires beating a naive baseline before the model is treated as trustworthy.',
  },
  {
    title: 'market comparison, not market capture',
    body: 'GPR and Kalshi can appear as labeled comparisons. They carry 0% weight in nucky probabilities so the product never quietly becomes “whatever the market said.”',
  },
  {
    title: 'auto-refreshing data',
    body: 'OE ingest and the ML refresh path run on the same disciplined cadence as the live dashboard, so form and SOS signals track what you are actually watching this split.',
  },
]

export default function FeaturesPage() {
  const rootRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    scrollEntrance(rootRef.current?.querySelector('.landing-section-head') ?? null)
    scrollEntranceStagger(rootRef.current, '.landing-feature-row')
  }, { scope: rootRef })

  return (
    <div className="landing-doc" ref={rootRef}>
      <div className="landing-section-head">
        <p className="landing-section-label">features</p>
        <h1>everything on one analytics spine</h1>
        <p className="landing-section-lead">
          Dashboard surfaces and nuckyAI share the same data and model artifacts. That is the product
          thesis — not a pile of disconnected tabs.
        </p>
      </div>

      <div className="landing-feature-list">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="landing-feature-row">
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </article>
        ))}
      </div>

      <section className="landing-cta" style={{ marginTop: '3rem' }}>
        <div>
          <h2>ready to dig in?</h2>
          <p>Open the free dashboard, or check pricing for nuckyAI access.</p>
        </div>
        <div className="landing-cta-actions">
          <Link className="landing-btn landing-btn-primary" to="/dashboard">
            open dashboard
          </Link>
          <Link className="landing-btn landing-btn-ghost" to="/pricing">
            pricing
          </Link>
        </div>
      </section>
    </div>
  )
}
