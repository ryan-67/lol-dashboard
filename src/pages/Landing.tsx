import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import AuthModal from '../components/AuthModal'
import {
  fetchAccuracyScorecard,
  formatLL,
  formatPct,
  type AccuracyScorecard,
} from '../lib/accuracyScorecard'
import { animateCounter, scrollEntrance, scrollEntranceStagger } from '../theme/animations'
import { useAuth } from '../context/AuthContext'

gsap.registerPlugin(ScrollTrigger)

type AuthView = 'signin' | 'signup'

export default function Landing() {
  const { user } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  const [scorecard, setScorecard] = useState<AccuracyScorecard | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState<AuthView>('signin')

  useEffect(() => {
    let alive = true
    void fetchAccuracyScorecard().then((data) => {
      if (alive) setScorecard(data)
    })
    return () => {
      alive = false
    }
  }, [])

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      scrollEntrance(root.querySelector('.landing-hero-copy'))
      if (!reduce) {
        scrollEntrance(root.querySelector('.landing-hero-badge'))
      }

      root.querySelectorAll<HTMLElement>('.landing-section').forEach((section) => {
        scrollEntrance(section.querySelector('.landing-section-head'))
        scrollEntranceStagger(section, '.landing-reveal')
      })

      if (!reduce && scorecard) {
        const accEl = root.querySelector<HTMLElement>('[data-counter="accuracy"]')
        const llEl = root.querySelector<HTMLElement>('[data-counter="logloss"]')
        const baseEl = root.querySelector<HTMLElement>('[data-counter="baseline"]')
        if (accEl) {
          animateCounter(accEl, scorecard.aggregate.model.accuracy * 100, {
            duration: 1.4,
            decimals: 1,
            suffix: '%',
          })
        }
        if (llEl) {
          animateCounter(llEl, scorecard.aggregate.model.log_loss, {
            duration: 1.4,
            decimals: 3,
          })
        }
        if (baseEl) {
          animateCounter(baseEl, scorecard.aggregate.baseline.accuracy * 100, {
            duration: 1.4,
            decimals: 1,
            suffix: '%',
          })
        }
      }
    },
    { scope: rootRef, dependencies: [scorecard] },
  )

  const openAuth = (view: AuthView) => {
    setAuthView(view)
    setShowAuth(true)
  }

  const acc = scorecard?.aggregate.model.accuracy ?? 0.7145
  const ll = scorecard?.aggregate.model.log_loss ?? 0.5648
  const baseAcc = scorecard?.aggregate.baseline.accuracy ?? 0.6209
  const holdout = scorecard?.holdoutRows ?? 718
  const dateRange = scorecard?.dateRange ?? ['2026-02-09', '2026-07-11']

  return (
    <div className="landing-page" ref={rootRef}>
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">tier-1 LoL esports · nucky.gg</p>
          <h1 className="landing-hero-title">
            ratings, trends, and <em>predictions</em> grounded in match data.
          </h1>
          <p className="landing-hero-sub">
            nucky ingests pro series, rates players and teams with proprietary signals, and explains
            matchups with an AI analyst that stays on the numbers.
          </p>
          <div className="landing-hero-actions">
            {user ? (
              <Link className="landing-btn landing-btn-primary" to="/dashboard">
                open dashboard
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
            <Link className="landing-btn landing-btn-ghost" to="/features">
              see features
            </Link>
          </div>
        </div>

        <aside className="landing-hero-badge" aria-label="Model accuracy">
          <div className="landing-hero-badge-label">walk-forward acc</div>
          <div className="landing-hero-badge-value">{formatPct(acc)}</div>
          <div className="landing-hero-badge-meta">vs {formatPct(baseAcc)} baseline</div>
        </aside>
      </section>

      <section className="landing-section" id="what">
        <div className="landing-section-head">
          <p className="landing-section-label">what nucky is</p>
          <h2 className="landing-section-title">an analytics spine with a real model behind it</h2>
          <p className="landing-section-lead">
            Not a chatbot bolted onto box scores. A dashboard and AI surface that share the same
            proprietary ratings, champion matchups, and walk-forward prediction stack.
          </p>
        </div>
        <div className="landing-steps">
          <article className="landing-step landing-reveal">
            <div className="landing-step-num">01</div>
            <div>
              <h3>ingest</h3>
              <p>
                New tier-1 games land from Oracle&apos;s Elixir and related sources. Series, drafts,
                patches, and form signals refresh on a disciplined pipeline — not a frozen scrape.
              </p>
            </div>
          </article>
          <article className="landing-step landing-reveal">
            <div className="landing-step-num">02</div>
            <div>
              <h3>rate</h3>
              <p>
                Region Elo, role-based player power, and empirical champion matchups become the scoring
                inputs. Live GPR and Kalshi odds stay comparison-only — never blended into the model
                probability.
              </p>
            </div>
          </article>
          <article className="landing-step landing-reveal">
            <div className="landing-step-num">03</div>
            <div>
              <h3>explain &amp; predict</h3>
              <p>
                nuckyAI reads structured prediction packets and dashboard stats so analyses cite real
                numbers. Predictions come with drivers, confidence, and a public walk-forward
                scorecard.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-section" id="difference">
        <div className="landing-section-head">
          <p className="landing-section-label">why not another stat site</p>
          <h2 className="landing-section-title">raw tables are not the product</h2>
          <p className="landing-section-lead">
            Classic LoL esports sites mirror OE box scores. nucky builds interpretive layers on top —
            so you can ask better questions before the draft locks.
          </p>
        </div>
        <div className="landing-compare">
          <div className="landing-compare-col landing-reveal">
            <h3>typical raw-stat sites</h3>
            <ul>
              <li>sortable tables of KDA, DPM, GD@15</li>
              <li>manual digging across players / teams / patches</li>
              <li>no proprietary strength of schedule or role ratings</li>
              <li>no audited prediction track record</li>
              <li>generic AI (if any) guesses from training memory</li>
            </ul>
          </div>
          <div className="landing-compare-col is-nucky landing-reveal">
            <h3>nucky</h3>
            <ul>
              <li>dashboard + entity pages with radar, form, and meta context</li>
              <li>ask-nucky analyst grounded in the same database</li>
              <li>home-grown Elo, player ratings, champ matchup matrix</li>
              <li>walk-forward accuracy scorecard you can inspect</li>
              <li>prediction packets: numbers first, prose second</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section" id="use">
        <div className="landing-section-head">
          <p className="landing-section-label">how to use it</p>
          <h2 className="landing-section-title">built for pre-series decisions</h2>
          <p className="landing-section-lead">
            Three common paths. More surfaces (split chat + dashboard, prediction tab) land as the
            product IA expands.
          </p>
        </div>
        <div className="landing-usecases">
          <article className="landing-usecase landing-reveal">
            <div className="landing-usecase-kicker">use case 01</div>
            <h3>pre-series lookup</h3>
            <p>
              Open a team or matchup page, scan form and lane profiles, then ask nucky what actually
              drives the edge before you lock a lean.
            </p>
          </article>
          <article className="landing-usecase landing-reveal">
            <div className="landing-usecase-kicker">use case 02</div>
            <h3>player &amp; meta tracking</h3>
            <p>
              Filter by league and split, watch rising champions and role standouts, and keep an eye
              on patch-sensitive shifts without spreadsheet archaeology.
            </p>
          </article>
          <article className="landing-usecase landing-reveal">
            <div className="landing-usecase-kicker">use case 03</div>
            <h3>ask the model</h3>
            <p>
              Chat with nuckyAI for structured analyses and series leans backed by the proprietary
              stack — with usage gated while the beta stays honest about cost.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-section" id="model">
        <div className="landing-section-head">
          <p className="landing-section-label">the model</p>
          <h2 className="landing-section-title">walk-forward track record</h2>
          <p className="landing-section-lead">
            Out-of-fold series predictions on {holdout.toLocaleString()} holdout games ({dateRange[0]}{' '}
            → {dateRange[1]}). Ship gate: beat a naive baseline on log-loss. Currently{' '}
            {scorecard?.aggregate.beatsBaseline ? 'passing' : 'failing'}.
          </p>
        </div>

        <div className="landing-score-grid">
          <div className="landing-score-card landing-reveal">
            <div className="landing-score-card-label">model accuracy</div>
            <div className="landing-score-card-value is-accent" data-counter="accuracy">
              {formatPct(acc)}
            </div>
            <div className="landing-score-card-meta">walk-forward OOF</div>
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
            <div className="landing-score-card-label">naive baseline acc</div>
            <div className="landing-score-card-value" data-counter="baseline">
              {formatPct(baseAcc)}
            </div>
            <div className="landing-score-card-meta">coin-flip / favorite prior</div>
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
          GPR Spearman and live Kalshi markets are offline comparison benchmarks only — 0% weight in
          live scoring. Kalshi closing-line value is blocked until a historical archive exists. Full
          write-up lives in the accuracy scorecard docs shipped with each retrain.
        </p>
      </section>

      <section className="landing-cta">
        <div>
          <h2>start with the free dashboard</h2>
          <p>
            Browse tier-1 analytics anytime. Create an account when you want nuckyAI and saved
            preferences.
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
            <Link className="landing-btn landing-btn-ghost" to="/pricing">
              view pricing
            </Link>
          )}
        </div>
      </section>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialView={authView} />
    </div>
  )
}
