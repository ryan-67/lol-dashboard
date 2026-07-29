import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion } from './motion'
import { leagueLogoUrl } from '../../lib/entities'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const LEAGUES = [
  { key: 'LCK', label: 'LCK', kind: 'league' },
  { key: 'Worlds', label: 'Worlds', kind: 'international' },
  { key: 'LPL', label: 'LPL', kind: 'league' },
  { key: 'MSI', label: 'MSI', kind: 'international' },
  { key: 'LEC', label: 'LEC', kind: 'league' },
  { key: 'First Stand', label: 'First Stand', kind: 'international' },
  { key: 'LCS', label: 'LCS', kind: 'league' },
  { key: 'EWC', label: 'EWC', kind: 'international' },
] as const

/**
 * League & tournament coverage — circular stack entrance.
 * Cards fly in, stack at center, then fan out into a ring.
 * Adapted from the animmaster hero_11 reference.
 */
export default function LeaguesSection() {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      const stage = root.querySelector<HTMLElement>('.leagues-stage')
      if (!stage) return

      const cards = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.leagues-card'))
      const core = root.querySelector('.leagues-core')
      const count = cards.length
      const sliceAngle = (2 * Math.PI) / count

      const ringOffset = (index: number, radius: number) => ({
        x: Math.round(radius * Math.cos(sliceAngle * index - Math.PI / 2)),
        y: Math.round(radius * Math.sin(sliceAngle * index - Math.PI / 2)),
      })

      const radiusFor = () => {
        const size = Math.min(stage.clientWidth, stage.clientHeight)
        return Math.max(size / 2 - 70, 120)
      }

      if (reducedMotion()) {
        const radius = radiusFor()
        cards.forEach((card, i) => {
          const { x, y } = ringOffset(i, radius)
          gsap.set(card, { x, y, autoAlpha: 1 })
        })
        gsap.set(core, { autoAlpha: 1 })
        return
      }

      const mm = gsap.matchMedia()

      mm.add('(min-width: 769px)', () => {
        gsap.set(cards, { x: 0, y: 0, autoAlpha: 0 })
        gsap.set(core, { autoAlpha: 0 })

        const floats: gsap.core.Tween[] = []

        const tl = gsap.timeline({
          defaults: { ease: 'power3.out' },
          scrollTrigger: {
            trigger: stage,
            start: 'top 55%',
            once: true,
          },
          onComplete: () => {
            /* Settled ring breathes — each card floats independently. */
            cards.forEach((card) => {
              floats.push(
                gsap.to(card, {
                  y: `+=${gsap.utils.random(-9, 9)}`,
                  x: `+=${gsap.utils.random(-6, 6)}`,
                  duration: gsap.utils.random(2.6, 3.8),
                  ease: 'sine.inOut',
                  yoyo: true,
                  repeat: -1,
                }),
              )
            })
          },
        })

        /* Fly in from below as an oversized stack, settling at the center. */
        tl.fromTo(
          cards,
          {
            y: () => window.innerHeight * 0.6,
            scale: 2.2,
            rotation: () => gsap.utils.random(-14, 14),
            autoAlpha: 0,
          },
          {
            y: 0,
            scale: 1,
            rotation: 0,
            autoAlpha: 1,
            duration: 0.75,
            stagger: 0.07,
            ease: 'power2.out',
          },
        )
          /* Fan out into the ring. */
          .to(
            cards,
            {
              x: (i) => ringOffset(i, radiusFor()).x,
              y: (i) => ringOffset(i, radiusFor()).y,
              duration: 1.05,
              stagger: 0.045,
              ease: 'power3.inOut',
            },
            '+=0.1',
          )
          .fromTo(
            core,
            { autoAlpha: 0, filter: 'blur(26px)', scale: 0.92 },
            { autoAlpha: 1, filter: 'blur(0px)', scale: 1, duration: 0.9, clearProps: 'filter' },
            '<+0.45',
          )

        return () => {
          floats.forEach((tween) => tween.kill())
        }
      })

      mm.add('(max-width: 768px)', () => {
        /* Mobile: simple staggered reveal of the fallback grid. */
        gsap.set(cards, { clearProps: 'all' })
        gsap.set(core, { autoAlpha: 1 })
        gsap.fromTo(
          cards,
          { autoAlpha: 0, y: 24, scale: 0.94 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.7,
            stagger: 0.06,
            ease: MOTION.easeOut,
            scrollTrigger: { trigger: stage, start: 'top 65%', once: true },
          },
        )
      })

      return () => mm.revert()
    },
    { scope: rootRef },
  )

  return (
    <section
      className="leagues"
      ref={rootRef}
      id="coverage"
      data-companion="point-up"
      data-companion-x="0"
      data-companion-y="34"
      data-companion-scale="0.38"
      data-companion-opacity="0.85"
      aria-label="League and tournament coverage"
    >
      <div className="section-head landing-inner">
        <p className="section-label" data-reveal="blur-in">coverage</p>
        <h2 className="section-title" data-motion-text>
          every tier-1 stage. every international.
        </h2>
      </div>

      <div className="leagues-stage" aria-label="Covered leagues and tournaments">
        <div className="leagues-core" aria-hidden="true">
          <span className="leagues-core-value">8</span>
          <span className="leagues-core-label">tier-1 circuits</span>
        </div>
        {LEAGUES.map((league) => {
          const src = leagueLogoUrl(league.key)
          return (
            <div className={`leagues-card kind-${league.kind}`} key={league.key}>
              {src ? <img src={src} alt="" loading="lazy" /> : null}
              <span className="leagues-card-name">{league.label}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
