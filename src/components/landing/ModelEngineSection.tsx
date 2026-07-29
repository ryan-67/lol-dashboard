import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion, scrambleText, splitWords } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const FACTORS = [
  {
    index: '01',
    keyword: 'gradient-boosted training',
    body: 'A walk-forward XGBoost engine, retrained after every completed match day. It is only ever scored on series it has never seen — the published accuracy is out-of-fold, not curve-fit to history.',
  },
  {
    index: '02',
    keyword: 'champion matchup evidence',
    body: 'Same-role matchup records, draft counter-pick context, and comp archetypes — dive into disengage, poke when ahead, scaling when behind — read from twelve years of professional drafts.',
  },
  {
    index: '03',
    keyword: 'strength of opponents',
    body: 'Series-grain Elo and region strength weight every result by who it came against. A 2–0 over a title contender moves a rating; farming a relegation side barely does.',
  },
  {
    index: '04',
    keyword: 'stats that matter, per role',
    body: 'Lane diffs for tops, damage and gold share for carries, vision and kill participation for supports — role-weighted form curves instead of one flat KDA average.',
  },
] as const

const OUTPUTS = [
  'win probability',
  'confidence band',
  'draft edges',
  'player power',
  'win conditions',
] as const

/**
 * "inside the model" — the prediction engine explained.
 * A deliberately visual-free beat: the drama comes from text choreography —
 * a scroll-scrubbed manifesto brighten, hairline draws, scramble keywords,
 * and blur-reveal bodies.
 */
export default function ModelEngineSection() {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || reducedMotion()) return

      /* Manifesto — words brighten one by one as the line scrubs through
       * the middle of the viewport. */
      const manifesto = root.querySelector<HTMLElement>('.model-manifesto')
      if (manifesto) {
        splitWords(manifesto)
        gsap.fromTo(
          manifesto.querySelectorAll('.lw-word'),
          { autoAlpha: 0.13 },
          {
            autoAlpha: 1,
            stagger: 0.06,
            ease: 'none',
            scrollTrigger: {
              trigger: manifesto,
              start: 'top 76%',
              end: 'center 40%',
              scrub: true,
            },
          },
        )
      }

      /* Factor rows — hairline draws across, index rises, keyword scrambles
       * into place, body blurs in. One gesture per row at viewport center. */
      gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.model-factor')).forEach((row) => {
        const keyword = row.querySelector<HTMLElement>('.model-factor-keyword')
        const tl = gsap.timeline({
          scrollTrigger: { trigger: row, start: MOTION.revealStart, once: true },
        })
        tl.fromTo(
          row.querySelector('.model-factor-line'),
          { scaleX: 0, transformOrigin: 'left center' },
          { scaleX: 1, duration: 0.9, ease: 'power3.inOut' },
          0,
        )
          .fromTo(
            row.querySelector('.model-factor-index'),
            { autoAlpha: 0, y: 16 },
            { autoAlpha: 1, y: 0, duration: 0.6, ease: MOTION.easeOut },
            0.12,
          )
          .fromTo(
            keyword,
            { autoAlpha: 0 },
            { autoAlpha: 1, duration: 0.2, ease: 'none' },
            0.18,
          )
          .add(() => {
            if (keyword) scrambleText(keyword, keyword.dataset.text || '', 1.05)
          }, 0.18)
          .fromTo(
            row.querySelector('.model-factor-body'),
            { autoAlpha: 0, y: 24, filter: 'blur(9px)' },
            { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.95, ease: MOTION.easeOut, clearProps: 'filter' },
            0.4,
          )
      })

      /* Outputs — chips cascade in, each scrambling to its label. */
      const outputs = root.querySelector<HTMLElement>('.model-outputs')
      if (outputs) {
        const chips = gsap.utils.toArray<HTMLElement>(outputs.querySelectorAll('.model-output'))
        const tl = gsap.timeline({
          scrollTrigger: { trigger: outputs, start: MOTION.revealStart, once: true },
        })
        tl.fromTo(
          outputs.querySelector('.model-outputs-label'),
          { autoAlpha: 0, x: -18 },
          { autoAlpha: 1, x: 0, duration: 0.6, ease: MOTION.easeOut },
          0,
        )
        chips.forEach((chip, i) => {
          const at = 0.15 + i * 0.14
          tl.fromTo(
            chip,
            { autoAlpha: 0, y: 14 },
            { autoAlpha: 1, y: 0, duration: 0.5, ease: MOTION.easeOut },
            at,
          ).add(() => {
            scrambleText(chip.querySelector('span'), chip.dataset.text || '', 0.85)
          }, at)
        })
      }
    },
    { scope: rootRef },
  )

  return (
    <section
      className="model-engine landing-inner"
      ref={rootRef}
      id="engine"
      data-companion="point-up"
      data-companion-x="0"
      data-companion-y="34"
      data-companion-scale="0.38"
      data-companion-opacity="0.85"
      aria-label="Inside the prediction model"
    >
      <div className="section-head">
        <p className="section-label" data-reveal="blur-in">inside the model</p>
        <h2 className="section-title" data-motion-text>
          an engine, not a gut feeling.
        </h2>
      </div>

      <p className="model-manifesto">
        Every completed series retrains a gradient-boosted engine that reads a matchup the way an
        analyst does — who you beat, what you drafted, and how each role actually performed.
      </p>

      <div className="model-factors">
        {FACTORS.map((factor) => (
          <article className="model-factor" key={factor.index}>
            <span className="model-factor-line" aria-hidden="true" />
            <span className="model-factor-index">{factor.index}</span>
            <h3 className="model-factor-keyword" data-text={factor.keyword}>
              {factor.keyword}
            </h3>
            <p className="model-factor-body">{factor.body}</p>
          </article>
        ))}
      </div>

      <div className="model-outputs">
        <span className="model-outputs-label">every series, the model publishes →</span>
        <ul>
          {OUTPUTS.map((output) => (
            <li className="model-output" key={output} data-text={output}>
              <span>{output}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
