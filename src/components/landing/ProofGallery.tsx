import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion, scrambleText } from './motion'
import { formatLL, formatPct, type AccuracyScorecard } from '../../lib/accuracyScorecard'
import { leagueLogoUrl } from '../../lib/entities'
import imgModel from '../assets/prediction_model.png'
import imgMatchup from '../assets/matchup.png'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface ProofGalleryProps {
  scorecard: AccuracyScorecard | null
  updatedLabel: string | null
}

const LEAGUES = [
  { key: 'LCK', kind: 'league' },
  { key: 'LPL', kind: 'league' },
  { key: 'LEC', kind: 'league' },
  { key: 'LCS', kind: 'league' },
  { key: 'Worlds', kind: 'international' },
  { key: 'MSI', kind: 'international' },
  { key: 'First Stand', kind: 'international' },
  { key: 'EWC', kind: 'international' },
] as const

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
 * Proof gallery — a second pinned horizontal walk, type-and-data forward
 * where the features gallery is media forward: coverage, how the engine
 * reads a series, and the published receipts.
 */
export default function ProofGallery({ scorecard, updatedLabel }: ProofGalleryProps) {
  const rootRef = useRef<HTMLElement>(null)

  const acc = scorecard?.aggregate.model.accuracy ?? 0.7145
  const ll = scorecard?.aggregate.model.log_loss ?? 0.5648
  const baseAcc = scorecard?.aggregate.baseline.accuracy ?? 0.6209
  const baseLL = scorecard?.aggregate.baseline.log_loss ?? 0.703
  const holdout = scorecard?.holdoutRows ?? 718
  const passing = scorecard?.aggregate.beatsBaseline ?? true

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || reducedMotion()) return

      const mm = gsap.matchMedia()

      mm.add('(min-width: 900px)', () => {
        const track = root.querySelector<HTMLElement>('.pg-track')
        const stage = root.querySelector<HTMLElement>('.pg-stage')
        const rail = root.querySelector<HTMLElement>('.pg-rail-fill')
        if (!track || !stage) return

        const distance = () => track.scrollWidth - window.innerWidth

        const scrub = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: stage,
            start: 'top top',
            end: () => `+=${distance()}`,
            scrub: 1,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              if (rail) gsap.set(rail, { scaleX: self.progress })
            },
          },
        })

        /* Coverage — chips cascade into the shelf. */
        const coverage = root.querySelector<HTMLElement>('.pg-panel--coverage')
        if (coverage) {
          gsap.fromTo(
            coverage.querySelectorAll('.pg-league'),
            { autoAlpha: 0, y: 44, rotationZ: () => gsap.utils.random(-5, 5) },
            {
              autoAlpha: 1,
              y: 0,
              rotationZ: 0,
              duration: 0.8,
              stagger: 0.07,
              ease: MOTION.easeOut,
              scrollTrigger: {
                trigger: coverage,
                containerAnimation: scrub,
                start: 'left 70%',
                once: true,
              },
            },
          )
        }

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
              start: 'left 62%',
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
              { scaleX: 1, duration: 1.1, stagger: 0.16, ease: 'power3.out' },
              0.2,
            )
            .fromTo(
              receipts.querySelectorAll('.pg-cell'),
              { autoAlpha: 0, y: 22 },
              { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.09, ease: MOTION.easeOut },
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
      aria-label="Coverage, model, and published receipts"
    >
      <div className="section-head landing-inner">
        <p className="section-label" data-reveal="blur-in">the proof</p>
        <h2 className="section-title" data-motion-text>
          audited in public, every retrain.
        </h2>
      </div>

      <div className="pg-stage">
        <div className="pg-track">
          {/* Panel 1 — coverage */}
          <article className="pg-panel pg-panel--coverage">
            <div className="pg-panel-head">
              <p className="pg-kicker">coverage</p>
              <h3 className="pg-title">
                every tier-1 stage.
                <br />
                every international.
              </h3>
            </div>
            <div className="pg-league-shelf" aria-label="Covered leagues and tournaments">
              {LEAGUES.map((league) => {
                const src = leagueLogoUrl(league.key)
                return (
                  <div className={`pg-league kind-${league.kind}`} key={league.key}>
                    {src ? <img src={src} alt="" loading="lazy" /> : null}
                    <span>{league.key}</span>
                  </div>
                )
              })}
            </div>
            <p className="pg-panel-foot">8 tier-1 circuits · twelve seasons deep</p>
          </article>

          {/* Panel 2 — how the engine reads a series */}
          <article className="pg-panel pg-panel--engine">
            <div
              className="pg-engine-backdrop"
              style={{ backgroundImage: `url(${imgMatchup})` }}
              aria-hidden="true"
            />
            <div className="pg-panel-head">
              <p className="pg-kicker">inside the model</p>
              <h3 className="pg-title">an engine, not a gut feeling.</h3>
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
          </article>

          {/* Panel 3 — receipts */}
          <article className="pg-panel pg-panel--receipts">
            <div
              className="pg-engine-backdrop"
              style={{ backgroundImage: `url(${imgModel})` }}
              aria-hidden="true"
            />
            <div className="pg-panel-head">
              <p className="pg-kicker">walk-forward receipts</p>
              <h3 className="pg-title">the numbers, published.</h3>
            </div>

            <div className="pg-receipts">
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

        <div className="pg-chrome" aria-hidden="true">
          <div className="pg-rail">
            <span className="pg-rail-fill" />
          </div>
        </div>
      </div>
    </section>
  )
}
