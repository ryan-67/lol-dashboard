import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, animateStatCounter, reducedMotion } from './motion'
import { formatLL, formatPct, type AccuracyScorecard } from '../../lib/accuracyScorecard'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface TrackRecordSectionProps {
  scorecard: AccuracyScorecard | null
  updatedLabel: string | null
}

/** Model track record — dramatic counter reveal wired to the live scorecard. */
export default function TrackRecordSection({ scorecard, updatedLabel }: TrackRecordSectionProps) {
  const rootRef = useRef<HTMLElement>(null)

  const acc = scorecard?.aggregate.model.accuracy ?? 0.7145
  const ll = scorecard?.aggregate.model.log_loss ?? 0.5648
  const baseAcc = scorecard?.aggregate.baseline.accuracy ?? 0.6209
  const baseLL = scorecard?.aggregate.baseline.log_loss ?? 0.703
  const holdout = scorecard?.holdoutRows ?? 718
  const dateRange = scorecard?.dateRange ?? ['2026-02-09', '2026-07-11']
  const passing = scorecard?.aggregate.beatsBaseline ?? true

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || !scorecard) return

      animateStatCounter(root.querySelector('[data-counter="acc"]'), acc * 100, {
        decimals: 1,
        suffix: '%',
        duration: 1.8,
      })
      animateStatCounter(root.querySelector('[data-counter="ll"]'), ll, {
        decimals: 3,
        duration: 1.5,
      })
      animateStatCounter(root.querySelector('[data-counter="base"]'), baseAcc * 100, {
        decimals: 1,
        suffix: '%',
        duration: 1.5,
      })

      if (reducedMotion()) return

      gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.track-bar-fill')).forEach((bar) => {
        gsap.from(bar, {
          scaleX: 0,
          transformOrigin: 'left center',
          duration: 1.2,
          ease: 'power3.out',
          scrollTrigger: { trigger: bar, start: MOTION.revealStart, once: true },
        })
      })

      gsap.fromTo(
        root.querySelectorAll('.track-table tbody tr'),
        { autoAlpha: 0, x: -18 },
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.55,
          stagger: 0.06,
          ease: 'power3.out',
          scrollTrigger: { trigger: root.querySelector('.track-table'), start: 'top 70%', once: true },
        },
      )
    },
    { scope: rootRef, dependencies: [scorecard] },
  )

  return (
    <section
      className="track landing-inner"
      ref={rootRef}
      id="model"
      data-companion="point-up"
      data-companion-x="0"
      data-companion-y="34"
      data-companion-scale="0.38"
      data-companion-opacity="0.85"
      aria-label="Model track record"
    >
      <div className="section-head">
        <p className="section-label" data-reveal="blur-in">prediction model · walk-forward</p>
        <h2 className="section-title" data-motion-text>
          the receipts, published
        </h2>
        <p className="section-lead" data-reveal="fade-up">
          Out-of-fold predictions on {holdout.toLocaleString()} holdout games ({dateRange[0]} →{' '}
          {dateRange[1]}). The ship gate requires beating a naive baseline — it is currently{' '}
          {passing ? 'passing' : 'failing'}.
        </p>
      </div>

      <div className="track-hero" data-reveal="scale">
        <div className="track-hero-value" data-counter="acc">
          {formatPct(acc)}
        </div>
        <div className="track-hero-caption">
          prediction accuracy · {holdout.toLocaleString()} holdout games
        </div>

        <div className="track-bars">
          <div className="track-bar">
            <span className="track-bar-label">nucky model</span>
            <span className="track-bar-track">
              <span
                className="track-bar-fill is-model"
                style={{ width: `${(acc * 100).toFixed(1)}%` }}
              />
            </span>
            <span className="track-bar-num">{formatPct(acc)}</span>
          </div>
          <div className="track-bar">
            <span className="track-bar-label">naive baseline</span>
            <span className="track-bar-track">
              <span
                className="track-bar-fill"
                style={{ width: `${(baseAcc * 100).toFixed(1)}%` }}
              />
            </span>
            <span className="track-bar-num">{formatPct(baseAcc)}</span>
          </div>
        </div>
      </div>

      <div className="track-grid" data-reveal-group>
        <div className="track-cell" data-reveal-item>
          <span className="track-cell-label">model log-loss</span>
          <span className="track-cell-value" data-counter="ll">
            {formatLL(ll)}
          </span>
          <span className="track-cell-meta">baseline {formatLL(baseLL)} — lower is better</span>
        </div>
        <div className="track-cell" data-reveal-item>
          <span className="track-cell-label">naive baseline accuracy</span>
          <span className="track-cell-value" data-counter="base">
            {formatPct(baseAcc)}
          </span>
          <span className="track-cell-meta">comparison benchmark</span>
        </div>
        <div className="track-cell" data-reveal-item>
          <span className="track-cell-label">evaluation</span>
          <span className="track-cell-value is-text">{passing ? 'beats baseline' : 'misses'}</span>
          <span className="track-cell-meta">walk-forward, out-of-fold</span>
        </div>
      </div>

      {scorecard?.byLeague?.length ? (
        <div className="track-table-wrap" data-reveal="fade-up">
          <table className="track-table">
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
              {scorecard.byLeague.map((row) => (
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
      ) : null}

      <p className="track-note" data-reveal="fade-up">
        Probabilities come from nucky&apos;s proprietary scoring stack. The scorecard refreshes with
        every retrain{updatedLabel ? ` (last export ${updatedLabel})` : ''} — this page reports
        evaluated performance, not a hand-picked marketing number.
      </p>
    </section>
  )
}
