import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { scrollEntrance, scrollEntranceStagger } from '../../theme/animations'

gsap.registerPlugin(ScrollTrigger)

const PILLARS = [
  {
    id: 'dashboard',
    label: 'dashboard',
    title: 'see the series before it starts',
    body: 'Radars, form, role power, and tournament context on one spine — LCK through Worlds, without the spreadsheet grind.',
  },
  {
    id: 'model',
    label: 'prediction model',
    title: 'probabilities with a paper trail',
    body: 'Walk-forward ratings and series odds trained on thousands of tier-1 games. Ship gate: beat a naive baseline, or it does not ship.',
  },
  {
    id: 'agent',
    label: 'nucky',
    title: 'ask the analyst that shares the data',
    body: 'Retrieval over twelve years of LoL esports context plus structured model packets — explanations grounded in the same evidence as the charts.',
  },
] as const

/** Stacked product story: pin left label while right chapters scrub up. */
export default function ProductPillars() {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const mm = gsap.matchMedia()

      scrollEntrance(root.querySelector('.landing-pillars-head'))
      scrollEntranceStagger(root, '.landing-pillar')

      mm.add('(min-width: 900px)', () => {
        if (reduce) return

        gsap.utils.toArray<HTMLElement>('.landing-pillar').forEach((card) => {
          gsap.fromTo(
            card,
            { opacity: 0.4, y: 36 },
            {
              opacity: 1,
              y: 0,
              ease: 'none',
              scrollTrigger: {
                trigger: card,
                start: 'top 85%',
                end: 'top 45%',
                scrub: true,
              },
            },
          )
        })
      })
    },
    { scope: rootRef },
  )

  return (
    <section className="landing-pillars landing-section" id="what" ref={rootRef}>
      <div className="landing-pillars-layout">
        <div className="landing-pillars-pin">
          <div className="landing-pillars-head">
            <p className="landing-section-label">product</p>
            <h2 className="landing-section-title">three surfaces. one evidence layer.</h2>
          </div>
        </div>
        <div className="landing-pillars-chapters">
          {PILLARS.map((p) => (
            <article key={p.id} className="landing-pillar landing-reveal" data-pillar={p.id}>
              <span className="landing-pillar-label">{p.label}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
