import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import AuthModal from '../components/AuthModal'
import AmbientBackground from '../components/landing/AmbientBackground'
import EntityFlipShowcase from '../components/landing/EntityFlipShowcase'
import NuckyKnowsTrail from '../components/landing/NuckyKnowsTrail'
import RankTicker from '../components/landing/RankTicker'
import StoryScroll from '../components/landing/StoryScroll'
import UseCaseCycle from '../components/landing/UseCaseCycle'
import { useViewPreference } from '../context/ViewPreferenceContext'
import {
  fetchAccuracyScorecard,
  formatLL,
  formatPct,
  formatScorecardUpdated,
  type AccuracyScorecard,
} from '../lib/accuracyScorecard'
import { startStripeCheckout } from '../lib/billing'
import { animateCounter, scrollEntrance, scrollEntranceStagger } from '../theme/animations'
import { useAuth } from '../context/AuthContext'

gsap.registerPlugin(ScrollTrigger)

type AuthView = 'signin' | 'signup'

const FEATURES = [
  {
    title: 'statistics-backed dashboard',
    body: 'Explore teams, players, champions, tournaments, and head-to-head matchups through radars, form charts, role comparisons, and patch-aware trends.',
  },
  {
    title: 'thousands of matches, scored',
    body: 'Historical match records train proprietary rating systems that score and rank teams and players while accounting for role, opposition, form, and strength of schedule.',
  },
  {
    title: 'patterns beyond the box score',
    body: 'nucky recognizes player, team, and champion trends, then maps recurring styles such as tempo, scaling, objective control, champion comfort, and lane pressure.',
  },
  {
    title: '12-year LoL esports knowledge base',
    body: 'A retrieval-augmented knowledge layer spans twelve years of historical match data and indexed esports context, giving nucky a domain memory normal chatbots do not have.',
  },
  {
    title: 'grounded analysis and predictions',
    body: 'The conversational analyst combines retrieved evidence with structured model packets, so answers can explain the statistics and drivers behind a matchup instead of improvising a confident guess.',
  },
  {
    title: 'auditable model performance',
    body: 'Walk-forward accuracy, log-loss, calibration, and league slices are published from out-of-fold evaluation. The model must beat a naive baseline before it passes its ship gate.',
  },
]

const FAQ_ITEMS = [
  {
    question: 'what is nucky?',
    answer:
      'nucky is a statistics-backed LoL esports analytics product: a free dashboard, proprietary rating and prediction systems, and an optional conversational analyst grounded in the same data.',
  },
  {
    question: 'what data does nucky know?',
    answer:
      'The analytics pipeline ingests tier-1 professional match data, while the retrieval-augmented knowledge base reaches across twelve years of historical match records and indexed esports context. Current dashboard coverage focuses on LCK, LPL, LEC, LCS, MSI, Worlds, and First Stand.',
  },
  {
    question: 'how is nucky different from a normal AI chatbot?',
    answer:
      'General chatbots primarily answer from broad training memory. nucky retrieves LoL esports-specific evidence, queries structured match statistics, and receives model-generated rating and prediction packets. It can ground an answer in the relevant numbers and say when the evidence is not there.',
  },
  {
    question: 'how is nucky different from a raw stat site?',
    answer:
      'Raw-stat sites are useful sources of box scores. nucky adds interpretation: team and player ratings, form, strength of schedule, champion matchup evidence, style profiles, trend detection, and a conversational layer that can connect those signals.',
  },
  {
    question: 'does nucky watch every series live?',
    answer:
      'No. nucky ingests match data and indexed context, then builds ratings, trends, analyses, and predictions from those artifacts. It does not claim to watch broadcasts or consume every live frame.',
  },
  {
    question: 'why is the conversational analyst subscription gated?',
    answer:
      'The beta is $3.99 per month because retrieval, model inference, and tool calls have real operating costs. The statistics dashboard remains free to browse, and full launch pricing is planned at $5 per month.',
  },
]

export default function Landing() {
  const { user } = useAuth()
  const { homePath } = useViewPreference()
  const location = useLocation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [scorecard, setScorecard] = useState<AccuracyScorecard | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState<AuthView>('signin')
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  useEffect(() => {
    let alive = true
    const load = (force = false) => {
      void fetchAccuracyScorecard({ force }).then((data) => {
        if (alive) setScorecard(data)
      })
    }
    load()
    const onVis = () => {
      if (document.visibilityState === 'visible') load(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash])

  // Hero choreography + section reveals — runs exactly once on mount
  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (!reduce) {
        // Masked line reveal, then supporting copy + model readout
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        tl.from(root.querySelectorAll('.landing-hero-line-inner'), {
          yPercent: 110,
          duration: 0.85,
          stagger: 0.09,
        })
          .from(
            root.querySelectorAll('.landing-brand-signal, .landing-hero-sub, .landing-hero-actions, .landing-hero-leagues'),
            { opacity: 0, y: 14, duration: 0.6, stagger: 0.07 },
            '-=0.5',
          )
          .from(
            root.querySelector('.landing-hero-readout'),
            { opacity: 0, y: 18, duration: 0.65 },
            '-=0.45',
          )
        root.querySelectorAll<HTMLElement>('.landing-readout-bar-fill').forEach((bar) => {
          gsap.from(bar, { scaleX: 0, transformOrigin: 'left center', duration: 1.1, ease: 'power2.out', delay: 0.7 })
        })
      }

      root.querySelectorAll<HTMLElement>('.landing-section').forEach((section) => {
        scrollEntrance(section.querySelector('.landing-section-head'))
        scrollEntranceStagger(section, '.landing-reveal')
      })
    },
    { scope: rootRef },
  )

  // Counters — re-run when scorecard data arrives
  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || !scorecard) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      animateCounter(root.querySelector('[data-counter="hero-acc"]'), scorecard.aggregate.model.accuracy * 100, {
        duration: 1.6,
        decimals: 1,
        suffix: '%',
      })
      animateCounter(root.querySelector('[data-counter="accuracy"]'), scorecard.aggregate.model.accuracy * 100, {
        duration: 1.4,
        decimals: 1,
        suffix: '%',
      })
      animateCounter(root.querySelector('[data-counter="logloss"]'), scorecard.aggregate.model.log_loss, {
        duration: 1.4,
        decimals: 3,
      })
      animateCounter(root.querySelector('[data-counter="baseline"]'), scorecard.aggregate.baseline.accuracy * 100, {
        duration: 1.4,
        decimals: 1,
        suffix: '%',
      })
    },
    { scope: rootRef, dependencies: [scorecard] },
  )

  const openAuth = (view: AuthView) => {
    setAuthView(view)
    setShowAuth(true)
  }

  const handleSubscribe = async () => {
    setCheckoutError(null)
    if (!user) {
      openAuth('signup')
      return
    }
    setCheckoutLoading(true)
    try {
      const url = await startStripeCheckout()
      window.location.assign(url)
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'checkout failed')
      setCheckoutLoading(false)
    }
  }

  const acc = scorecard?.aggregate.model.accuracy ?? 0.7145
  const ll = scorecard?.aggregate.model.log_loss ?? 0.5648
  const baseAcc = scorecard?.aggregate.baseline.accuracy ?? 0.6209
  const holdout = scorecard?.holdoutRows ?? 718
  const dateRange = scorecard?.dateRange ?? ['2026-02-09', '2026-07-11']
  const scorecardUpdated = formatScorecardUpdated(scorecard?.generatedAt)

  return (
    <div className="landing-page" ref={rootRef}>
      <AmbientBackground />

      <div className="landing-inner">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="landing-brand-signal" aria-hidden="true">
              <span className="landing-brand-signal-name">nucky</span>
              <span className="landing-brand-signal-mark" />
            </div>
            <h1 className="landing-hero-title">
              <span className="landing-hero-line">
                <span className="landing-hero-line-inner">ratings, trends,</span>
              </span>
              <span className="landing-hero-line">
                <span className="landing-hero-line-inner">
                  and <em>predictions</em>
                </span>
              </span>
              <span className="landing-hero-line">
                <span className="landing-hero-line-inner">grounded in</span>
              </span>
              <span className="landing-hero-line">
                <span className="landing-hero-line-inner">match data.</span>
              </span>
            </h1>
            <p className="landing-hero-sub">
              Proprietary model scores over thousands of tier-1 games — then a dashboard and analyst
              that speak the same evidence.
            </p>
            <div className="landing-hero-actions">
              {user ? (
                <Link className="landing-btn landing-btn-primary" to={homePath}>
                  open app
                </Link>
              ) : (
                <button
                  type="button"
                  className="landing-btn landing-btn-primary"
                  onClick={() => openAuth('signup')}
                >
                  create account
                </button>
              )}
              <a className="landing-btn landing-btn-ghost" href="#features">
                see features
              </a>
            </div>
            <div className="landing-hero-leagues" aria-label="League coverage">
              {['LCK', 'LPL', 'LEC', 'LCS', 'MSI', 'Worlds', 'First Stand', 'EWC'].map((league) => (
                <span key={league}>{league}</span>
              ))}
            </div>
          </div>

          <aside className="landing-hero-readout" aria-label="Model scorecard">
            <div className="landing-readout-head">
              <span className="signal-dot" aria-hidden="true" />
              <span>model scorecard</span>
              <span className="landing-readout-tag">walk-forward</span>
            </div>
            <div className="landing-readout-value" data-counter="hero-acc">
              {formatPct(acc)}
            </div>
            <div className="landing-readout-caption">
              prediction accuracy · {holdout.toLocaleString()} holdout games
            </div>
            <div className="landing-readout-bars">
              <div className="landing-readout-bar">
                <span className="landing-readout-bar-label">nucky model</span>
                <span className="landing-readout-bar-track">
                  <span
                    className="landing-readout-bar-fill is-model"
                    style={{ width: `${(acc * 100).toFixed(1)}%` }}
                  />
                </span>
                <span className="landing-readout-bar-num">{formatPct(acc)}</span>
              </div>
              <div className="landing-readout-bar">
                <span className="landing-readout-bar-label">naive baseline</span>
                <span className="landing-readout-bar-track">
                  <span
                    className="landing-readout-bar-fill"
                    style={{ width: `${(baseAcc * 100).toFixed(1)}%` }}
                  />
                </span>
                <span className="landing-readout-bar-num">{formatPct(baseAcc)}</span>
              </div>
            </div>
            <div className="landing-readout-foot">
              <span>log-loss {formatLL(ll)}</span>
              <span>
                holdout {dateRange[0]} → {dateRange[1]}
              </span>
            </div>
            {scorecardUpdated ? (
              <div className="landing-readout-updated">model updated {scorecardUpdated} UTC</div>
            ) : null}
          </aside>
        </section>
      </div>

      <StoryScroll />
      <RankTicker />
      <UseCaseCycle
        ctaLabel={user ? 'open chat' : 'create account to ask'}
        onAsk={user ? undefined : () => openAuth('signup')}
        ctaTo={user ? homePath : undefined}
      />

      <div className="landing-inner">
        <EntityFlipShowcase />
      </div>

      <NuckyKnowsTrail />

      <div className="landing-inner">
      <section className="landing-section" id="what">
        <div className="landing-section-head">
          <p className="landing-section-label">what nucky is</p>
          <h2 className="landing-section-title">a statistics product with an analyst built in</h2>
          <p className="landing-section-lead">
            The dashboard, knowledge base, ratings, and conversational experience all share the same
            LoL esports-specific data foundation.
          </p>
        </div>
        <div className="landing-steps">
          <article className="landing-step landing-reveal">
            <div className="landing-step-num">01</div>
            <div>
              <h3>ingest twelve years of context</h3>
              <p>
                Historical match records and indexed esports sources form a retrieval-augmented
                knowledge base. New tier-1 results, drafts, patches, and form signals keep the active
                analytics layer current.
              </p>
            </div>
          </article>
          <article className="landing-step landing-reveal">
            <div className="landing-step-num">02</div>
            <div>
              <h3>score players, teams, and champions</h3>
              <p>
                Proprietary team strength, role-based player power, and champion matchup systems learn
                from thousands of historical match records to rank performance in context.
              </p>
            </div>
          </article>
          <article className="landing-step landing-reveal">
            <div className="landing-step-num">03</div>
            <div>
              <h3>recognize patterns and styles</h3>
              <p>
                nucky surfaces player form, champion comfort, team tempo, scaling, objective control,
                lane pressure, and matchup-specific tendencies that raw totals can hide.
              </p>
            </div>
          </article>
          <article className="landing-step landing-reveal">
            <div className="landing-step-num">04</div>
            <div>
              <h3>explain and predict</h3>
              <p>
                Structured model packets give the conversational analyst probabilities, drivers,
                trends, and uncertainty. The prose explains the evidence; it does not invent the score.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-section" id="difference">
        <div className="landing-section-head">
          <h2 className="landing-section-title">not a raw table. not a general chatbot.</h2>
          <p className="landing-section-lead">
            nucky connects structured statistics, proprietary models, and domain retrieval so every
            surface can answer the same question with the same evidence.
          </p>
        </div>
        <div className="landing-compare">
          <div className="landing-compare-col landing-reveal">
            <h3>raw stat sites / general AI</h3>
            <ul>
              <li>box scores without interpretation</li>
              <li>manual digging across players, teams, and patches</li>
              <li>broad training memory with limited current LoL esports context</li>
              <li>confident prose without a transparent prediction system</li>
              <li>no shared analytics layer between dashboard and chat</li>
            </ul>
          </div>
          <div className="landing-compare-col is-nucky landing-reveal">
            <h3>nucky</h3>
            <ul>
              <li>statistics-backed dashboard with form, radar, and matchup context</li>
              <li>twelve-year historical knowledge base with retrieval</li>
              <li>team, player, and champion ratings trained on thousands of matches</li>
              <li>style and trend recognition across roles, patches, and opponents</li>
              <li>auditable predictions with a published walk-forward scorecard</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section" id="features">
        <div className="landing-section-head">
          <h2 className="landing-section-title">one analytics spine, six ways in</h2>
          <p className="landing-section-lead">
            Explore the evidence visually, ask for an explanation, or inspect how the model performed.
          </p>
        </div>
        <div className="landing-feature-list">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="landing-feature-row landing-reveal">
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="use">
        <div className="landing-section-head">
          <h2 className="landing-section-title">move from stat to context</h2>
          <p className="landing-section-lead">
            Start with the free dashboard, follow a player or team signal, then ask nucky to connect
            the matchup evidence.
          </p>
        </div>
        <div className="landing-usecases">
          <article className="landing-usecase landing-reveal">
            <div className="landing-usecase-kicker">use case 01</div>
            <h3>pre-series research</h3>
            <p>
              Compare team form, lane profiles, opponent quality, and style clashes before deciding
              what should matter in the series.
            </p>
          </article>
          <article className="landing-usecase landing-reveal">
            <div className="landing-usecase-kicker">use case 02</div>
            <h3>player and meta tracking</h3>
            <p>
              Follow role-adjusted player form, champion comfort, rising picks, patch shifts, and
              opponent-specific matchup patterns.
            </p>
          </article>
          <article className="landing-usecase landing-reveal">
            <div className="landing-usecase-kicker">use case 03</div>
            <h3>grounded questions</h3>
            <p>
              Ask nucky for a comparison or series lean. Retrieval supplies LoL esports context while
              structured tools supply the current statistics.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-section" id="model">
        <div className="landing-section-head">
          <p className="landing-section-label">the prediction model</p>
          <h2 className="landing-section-title">walk-forward track record</h2>
          <p className="landing-section-lead">
            Out-of-fold predictions on {holdout.toLocaleString()} holdout games ({dateRange[0]} to{' '}
            {dateRange[1]}). The ship gate requires lower log-loss than a naive baseline. It is
            currently {(scorecard?.aggregate.beatsBaseline ?? true) ? ' passing' : ' failing'}.
          </p>
        </div>

        <div className="landing-score-grid">
          <div className="landing-score-card landing-reveal">
            <div className="landing-score-card-label">model accuracy</div>
            <div className="landing-score-card-value is-accent" data-counter="accuracy">
              {formatPct(acc)}
            </div>
            <div className="landing-score-card-meta">walk-forward out-of-fold</div>
          </div>
          <div className="landing-score-card landing-reveal">
            <div className="landing-score-card-label">model log-loss</div>
            <div className="landing-score-card-value" data-counter="logloss">
              {formatLL(ll)}
            </div>
            <div className="landing-score-card-meta">
              baseline {formatLL(scorecard?.aggregate.baseline.log_loss ?? 0.703)}
            </div>
          </div>
          <div className="landing-score-card landing-reveal">
            <div className="landing-score-card-label">naive baseline accuracy</div>
            <div className="landing-score-card-value" data-counter="baseline">
              {formatPct(baseAcc)}
            </div>
            <div className="landing-score-card-meta">comparison benchmark</div>
          </div>
        </div>

        <div className="landing-reveal" style={{ overflowX: 'auto' }}>
          <table className="landing-league-table">
            <thead>
              <tr>
                <th>league</th>
                <th>n</th>
                <th>model acc</th>
                <th>model ll</th>
                <th>vs baseline</th>
              </tr>
            </thead>
            <tbody>
              {(scorecard?.byLeague ?? []).map((row) => (
                <tr key={row.key}>
                  <td>{row.key}</td>
                  <td>{row.n}</td>
                  <td>{formatPct(row.model.accuracy)}</td>
                  <td>{formatLL(row.model.log_loss)}</td>
                  <td className={row.beatsBaseline ? 'is-good' : ''}>
                    {row.beatsBaseline ? 'beats' : 'miss'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="landing-model-note">
          Probabilities come from nucky&apos;s proprietary scoring stack. The scorecard refreshes with
          every model retrain
          {scorecardUpdated ? ` (last export ${scorecardUpdated})` : ''} so this page reports
          evaluated performance, not a hand-picked marketing number.
        </p>
      </section>

      <section className="landing-section" id="pricing">
        <div className="landing-section-head">
          <h2 className="landing-section-title">free analytics. paid analyst.</h2>
          <p className="landing-section-lead">
            Browse the statistics dashboard without an account. Subscribe when you want retrieval,
            model explanations, and conversational analysis.
          </p>
        </div>
        <div className="landing-pricing-grid">
          <article className="landing-price-card landing-reveal">
            <div className="landing-price-name">dashboard</div>
            <div className="landing-price-amount">
              $0 <span>/ forever</span>
            </div>
            <p className="landing-price-desc">
              Tier-1 analytics across players, teams, champions, matchups, and tournaments.
            </p>
            <ul className="landing-price-list">
              <li>league, year, and split filters</li>
              <li>radars, form charts, rankings, and trends</li>
              <li>auto-refreshing professional match data</li>
              <li>no account required to browse</li>
            </ul>
            <Link className="landing-btn landing-btn-ghost" to="/dashboard">
              open dashboard
            </Link>
          </article>

          <article className="landing-price-card is-featured landing-reveal">
            <div className="landing-price-name">nucky beta</div>
            <div className="landing-price-amount">
              $3.99 <span>/ month</span>
            </div>
            <p className="landing-price-desc">
              Retrieval-augmented conversation, grounded analyses, and structured series predictions.
              Full launch pricing is planned at $5 per month.
            </p>
            <ul className="landing-price-list">
              <li>LoL esports-specific retrieval and tools</li>
              <li>prediction packets with model drivers</li>
              <li>usage caps during active beta</li>
              <li>cancel anytime through Stripe</li>
            </ul>
            <button
              type="button"
              className="landing-btn landing-btn-primary"
              disabled={checkoutLoading}
              onClick={() => void handleSubscribe()}
            >
              {checkoutLoading ? 'redirecting…' : user ? 'subscribe' : 'create account to subscribe'}
            </button>
            {checkoutError ? <p className="landing-checkout-error">{checkoutError}</p> : null}
          </article>
        </div>
      </section>

      <section className="landing-section" id="faq">
        <div className="landing-section-head">
          <h2 className="landing-section-title">questions, answered</h2>
        </div>
        <div className="landing-faq-list">
          {FAQ_ITEMS.map((item) => (
            <article key={item.question} className="landing-faq-item landing-reveal">
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="about">
        <div className="landing-section-head">
          <h2 className="landing-section-title">built for better LoL esports questions</h2>
          <p className="landing-section-lead">
            Hi, I&apos;m geonbu, a LoL esports fan and solo developer. I built nucky because I wanted
            cleaner, more visual access to statistics that matter in professional play, plus an
            analyst with enough real context to surface useful insights, analyses, and predictions.
          </p>
          <p className="landing-section-lead">
            Contact: <a href="mailto:geonbu@nucky.gg">geonbu@nucky.gg</a>
          </p>
        </div>
      </section>

      <section className="landing-cta">
        <div>
          <h2>start with the statistics</h2>
          <p>
            Browse the free dashboard. Create an account when you want nucky to retrieve, connect, and
            explain the evidence.
          </p>
        </div>
        <div className="landing-cta-actions">
          <Link className="landing-btn landing-btn-primary" to="/dashboard">
            open dashboard
          </Link>
          {!user ? (
            <button
              type="button"
              className="landing-btn landing-btn-ghost"
              onClick={() => openAuth('signup')}
            >
              create account
            </button>
          ) : (
            <a className="landing-btn landing-btn-ghost" href="#pricing">
              view pricing
            </a>
          )}
        </div>
      </section>

      </div>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialView={authView} />
    </div>
  )
}
