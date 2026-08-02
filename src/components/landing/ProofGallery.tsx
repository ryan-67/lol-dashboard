import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion, scrambleText } from './motion'
import { formatLL, formatPct, type AccuracyScorecard } from '../../lib/accuracyScorecard'
import ModelTrainingLoop from './ModelTrainingLoop'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface ProofGalleryProps {
  scorecard: AccuracyScorecard | null
  updatedLabel: string | null
}

const FACTORS = [
  {
    index: '01',
    keyword: 'gradient-boosted training',
    body: 'Retrained after every match day. Scored only on series it has never seen.',
  },
  {
    index: '02',
    keyword: 'champion matchup evidence',
    body: 'Same-role records, counter-picks, and comp archetypes from twelve years of drafts.',
  },
  {
    index: '03',
    keyword: 'strength of opponents',
    body: 'Series-grain Elo weights every result by who it came against.',
  },
  {
    index: '04',
    keyword: 'stats that matter, per role',
    body: 'Role-weighted form curves instead of one flat KDA average.',
  },
] as const

/**
 * Model gallery — a pinned horizontal walk through the engine: a live
 * gradient-boosted training vignette with the four factor reads, then the
 * published walk-forward receipts broken out per tier-1 league. Panels
 * angle in 3D as they traverse the stage (alche works-gallery language).
 */
export default function ProofGallery({ scorecard, updatedLabel }: ProofGalleryProps) {
  const rootRef = useRef<HTMLElement>(null)

  const acc = scorecard?.aggregate.model.accuracy ?? 0.7145
  const ll = scorecard?.aggregate.model.log_loss ?? 0.5648
  const baseAcc = scorecard?.aggregate.baseline.accuracy ?? 0.6209
  const baseLL = scorecard?.aggregate.baseline.log_loss ?? 0.703
  const holdout = scorecard?.holdoutRows ?? 718
  const passing = scorecard?.aggregate.beatsBaseline ?? true
  const leagues = scorecard?.byLeague ?? []

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || reducedMotion()) return

      const mm = gsap.matchMedia()

      mm.add('(min-width: 900px)', () => {
        const track = root.querySelector<HTMLElement>('.pg-track')
        const stage = root.querySelector<HTMLElement>('.pg-stage')
        if (!track || !stage) return

        const panels = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.pg-panel'))
        /* Full-exit distance — every panel scrolls fully past (alche
         * behavior) so the unpin happens on an empty stage. */
        const distance = () => track.scrollWidth

        gsap.set(track, { transformPerspective: 1400 })

        const scrub = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: stage,
            start: 'top top',
            end: () => `+=${distance()}`,
            scrub: MOTION.scrub,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: () => {
              /* Panels angle toward the center of the stage — planes in a
               * gallery, not flat cards. */
              const mid = window.innerWidth / 2
              panels.forEach((panel) => {
                const rect = panel.getBoundingClientRect()
                const off = (rect.left + rect.width / 2 - mid) / mid
                gsap.set(panel, { rotationY: gsap.utils.clamp(-9, 9, off * 9) })
              })
            },
          },
        })

        /* Factors — hairlines draw, keywords scramble in. */
        root.querySelectorAll<HTMLElement>('.pg-factor').forEach((row, i) => {
          const keyword = row.querySelector<HTMLElement>('.pg-factor-keyword')
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: row.closest('.pg-panel') ?? row,
              containerAnimation: scrub,
              start: 'left 65%',
              once: true,
            },
          })
          tl.fromTo(
            row.querySelector('.pg-factor-line'),
            { scaleX: 0, transformOrigin: 'left center' },
            { scaleX: 1, duration: 0.8, ease: 'power3.inOut' },
            i * 0.14,
          )
            .fromTo(
              row.querySelectorAll('.pg-factor-index, .pg-factor-body'),
              { autoAlpha: 0, y: 16 },
              { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08, ease: MOTION.easeOut },
              i * 0.14 + 0.1,
            )
            .add(() => {
              if (keyword) {
                gsap.set(keyword, { autoAlpha: 1 })
                scrambleText(keyword, keyword.dataset.text || '', 0.9)
              }
            }, i * 0.14 + 0.12)
          if (keyword) gsap.set(keyword, { autoAlpha: 0 })
        })

        /* Receipts — the headline number counts up, bars fill. */
        const receipts = root.querySelector<HTMLElement>('.pg-panel--receipts')
        if (receipts) {
          const counter = receipts.querySelector<HTMLElement>('.pg-acc-value')
          const state = { val: 0 }
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: receipts,
              containerAnimation: scrub,
              start: 'left 70%',
              once: true,
            },
          })
          tl.to(state, {
            val: acc * 100,
            duration: 1.6,
            ease: 'power2.out',
            onUpdate: () => {
              if (counter) counter.textContent = `${state.val.toFixed(1)}%`
            },
          })
            .fromTo(
              receipts.querySelectorAll('.pg-bar-fill'),
              { scaleX: 0, transformOrigin: 'left center' },
              { scaleX: 1, duration: 1.1, stagger: 0.1, ease: 'power3.out' },
              0.2,
            )
            .fromTo(
              receipts.querySelectorAll('.pg-cell, .pg-league-row'),
              { autoAlpha: 0, y: 22 },
              { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.07, ease: MOTION.easeOut },
              0.4,
            )
        }
      })

      return () => mm.revert()
    },
    /* revertOnUpdate — the scorecard fetch re-runs this effect; without a
     * revert the old pin survives and the stage gets double-pinned. */
    { scope: rootRef, dependencies: [scorecard], revertOnUpdate: true },
  )

  return (
    <section
      className="proof-gallery"
      ref={rootRef}
      id="model"
      data-accent-hue="210"
      aria-label="Inside the model and its published receipts"
    >
      <div className="pg-stage">
        <div className="pg-track">
          {/* Panel 1 — inside the model */}
          <article className="pg-panel pg-panel--engine">
            <div className="pg-panel-head">
              <p className="pg-kicker">inside the model</p>
              <h3 className="pg-title">an engine, not a gut feeling.</h3>
            </div>

            <div className="pg-engine-body">
              <div className="pg-loop-frame" data-tilt="2.6">
                <ModelTrainingLoop />
                <span className="pg-loop-caption">
                  walk-forward retrain · live render, not a mockup
                </span>
              </div>

              <div className="pg-factors">
                {FACTORS.map((factor) => (
                  <div className="pg-factor" key={factor.index}>
                    <span className="pg-factor-line" aria-hidden="true" />
                    <span className="pg-factor-index">{factor.index}</span>
                    <h4 className="pg-factor-keyword" data-text={factor.keyword}>
                      {factor.keyword}
                    </h4>
                    <p className="pg-factor-body">{factor.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {/* Panel 2 — receipts, broken out per league */}
          <article className="pg-panel pg-panel--receipts">
            <div className="pg-panel-head">
              <p className="pg-kicker">walk-forward receipts</p>
              <h3 className="pg-title">the numbers, published.</h3>
            </div>

            <div className="pg-receipts">
              <div className="pg-receipts-lead">
                <div className="pg-acc">
                  <span className="pg-acc-value">{formatPct(acc)}</span>
                  <span className="pg-acc-caption">
                    prediction accuracy · {holdout.toLocaleString()} holdout games
                  </span>
                </div>

                <div className="pg-bars">
                  <div className="pg-bar">
                    <span className="pg-bar-label">nucky model</span>
                    <span className="pg-bar-track">
                      <span
                        className="pg-bar-fill is-model"
                        style={{ width: `${(acc * 100).toFixed(1)}%` }}
                      />
                    </span>
                    <span className="pg-bar-num">{formatPct(acc)}</span>
                  </div>
                  <div className="pg-bar">
                    <span className="pg-bar-label">naive baseline</span>
                    <span className="pg-bar-track">
                      <span
                        className="pg-bar-fill"
                        style={{ width: `${(baseAcc * 100).toFixed(1)}%` }}
                      />
                    </span>
                    <span className="pg-bar-num">{formatPct(baseAcc)}</span>
                  </div>
                </div>
              </div>

              {/* Per-league breakout — every tier-1 slice in the holdout. */}
              <div className="pg-league-table" aria-label="Accuracy by league">
                <div className="pg-league-row is-head" aria-hidden="true">
                  <span>league</span>
                  <span>accuracy</span>
                  <span>vs baseline</span>
                  <span>games</span>
                </div>
                {leagues.map((slice) => (
                  <div className="pg-league-row" key={slice.key}>
                    <span className="pg-league-key">{slice.key.toLowerCase()}</span>
                    <span className="pg-league-acc">
                      <span className="pg-league-bar">
                        <span
                          className="pg-bar-fill is-model"
                          style={{ width: `${(slice.model.accuracy * 100).toFixed(1)}%` }}
                        />
                      </span>
                      {formatPct(slice.model.accuracy)}
                    </span>
                    <span
                      className={`pg-league-delta${slice.beatsBaseline ? ' is-up' : ''}`}
                    >
                      {slice.beatsBaseline ? '+' : ''}
                      {((slice.model.accuracy - slice.baseline.accuracy) * 100).toFixed(1)}pt
                    </span>
                    <span className="pg-league-n">{slice.n}</span>
                  </div>
                ))}
                <div className="pg-league-row is-foot" aria-hidden="true">
                  <span className="pg-league-key">internationals</span>
                  <span className="pg-league-note" style={{ gridColumn: '2 / -1' }}>
                    worlds · msi · first stand · ewc — counted in the aggregate scorecard above
                  </span>
                </div>
              </div>

              <div className="pg-cells">
                <div className="pg-cell">
                  <span className="pg-cell-label">model log-loss</span>
                  <span className="pg-cell-value">{formatLL(ll)}</span>
                  <span className="pg-cell-meta">baseline {formatLL(baseLL)} — lower is better</span>
                </div>
                <div className="pg-cell">
                  <span className="pg-cell-label">ship gate</span>
                  <span className="pg-cell-value is-text">
                    {passing ? 'beats baseline' : 'misses'}
                  </span>
                  <span className="pg-cell-meta">walk-forward, out-of-fold</span>
                </div>
              </div>

              <p className="pg-note">
                The scorecard refreshes with every retrain
                {updatedLabel ? ` (last export ${updatedLabel})` : ''} — evaluated performance,
                not a hand-picked marketing number.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
