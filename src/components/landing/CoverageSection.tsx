import { useMemo, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion } from './motion'
import { leagueLogoUrl } from '../../lib/entities'

gsap.registerPlugin(ScrollTrigger, useGSAP)

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

/**
 * All eight crests are light-on-dark (DarkBG / FullonDark / color-on-black
 * / alpha). plateToAlpha punches near-white ink — which IS the logo — so
 * every crest is served raw. EWC is a black SVG; invert it to white.
 */
const INVERT_LOGO = new Set<string>(['EWC'])

interface CoverageItem {
  key: string
  kind: 'league' | 'international'
  url: string
  invert: boolean
}

/**
 * Coverage — its own full plate now. A page-wipe hands off from the knows
 * field, then the league crests ride in from below (animmaster_hero_11
 * language: rise, gather, fan out into an orbit ring) and keep orbiting the
 * headline with occasional card flips.
 */
export default function CoverageSection() {
  const rootRef = useRef<HTMLElement>(null)

  const items = useMemo<CoverageItem[]>(
    () =>
      LEAGUES.map((league) => ({
        key: league.key,
        kind: league.kind,
        url: leagueLogoUrl(league.key) ?? '',
        invert: INVERT_LOGO.has(league.key),
      })).filter((item) => Boolean(item.url)),
    [],
  )

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      const stage = root.querySelector<HTMLElement>('.cov-stage')
      const wipe = root.querySelector<HTMLElement>('.cov-wipe')
      const cards = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.cov-card'))
      const heading = root.querySelectorAll('.cov-heading > *')
      if (!stage || !cards.length) return

      if (reducedMotion()) {
        gsap.set(wipe, { autoAlpha: 0 })
        gsap.set([cards, heading], { autoAlpha: 1 })
        return
      }

      const mm = gsap.matchMedia()

      mm.add('(min-width: 900px)', () => {
        const count = cards.length
        const slice = (2 * Math.PI) / count
        /* Ring geometry recomputes on refresh so resizes stay honest. */
        let radiusX = 0
        let radiusY = 0
        const measure = () => {
          radiusX = Math.min(stage.clientWidth * 0.33, 560)
          radiusY = Math.min(stage.clientHeight * 0.33, 330)
        }
        measure()

        /* One shared state: `deploy` scrubs the fan-out, `spin` free-runs
         * the ambient orbit. Cards stay upright the whole way. */
        const state = { deploy: 0, spin: 0 }
        const angleOf = (i: number) => slice * i - Math.PI / 2 + state.spin
        const apply = () => {
          for (let i = 0; i < count; i++) {
            const a = angleOf(i)
            gsap.set(cards[i]!, {
              x: Math.cos(a) * radiusX * state.deploy,
              y: Math.sin(a) * radiusY * state.deploy,
            })
          }
        }

        gsap.set(cards, { xPercent: -50, yPercent: -50, autoAlpha: 0 })
        gsap.set(heading, { autoAlpha: 0, y: 26 })

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: '+=190%',
            scrub: MOTION.scrub,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onRefresh: () => {
              measure()
              apply()
            },
          },
        })

        /* Phase 1 — page wipe: the plate slides up and reveals the section. */
        tl.to(wipe, { yPercent: -100, duration: 0.16, ease: 'power2.inOut' })

        /* Phase 2 — crests ride up from below the fold (hero_11 rise). */
        tl.fromTo(
          cards,
          { y: () => stage.clientHeight * 0.75, rotationX: -120, scale: 2.2, autoAlpha: 0 },
          {
            y: 0,
            rotationX: 0,
            scale: 1,
            autoAlpha: 1,
            duration: 0.22,
            stagger: 0.018,
            ease: 'power2.out',
          },
          0.1,
        )

        /* Headline locks in at the ring's center. */
        tl.to(heading, { autoAlpha: 1, y: 0, duration: 0.12, stagger: 0.03, ease: 'power2.out' }, 0.26)

        /* Phase 3 — fan out into the orbit ring. */
        tl.to(
          state,
          { deploy: 1, duration: 0.3, ease: 'power2.inOut', onUpdate: apply },
          0.36,
        )

        /* Ambient — the ring orbits forever; a random crest flips over
         * every few seconds (hero_11's onRepeat trick). */
        const orbit = gsap.to(state, {
          spin: Math.PI * 2,
          duration: 64,
          repeat: -1,
          ease: 'none',
          onUpdate: apply,
        })
        const flipper = window.setInterval(() => {
          if (state.deploy < 0.9) return
          const card = cards[Math.floor(Math.random() * count)]!
          gsap.to(card.querySelector('.cov-card-inner'), {
            rotationY: '+=360',
            duration: 1.3,
            ease: 'power2.inOut',
          })
        }, 2600)

        return () => {
          orbit.kill()
          window.clearInterval(flipper)
        }
      })

      mm.add('(max-width: 899px)', () => {
        /* Mobile: static grid with a simple stagger reveal. */
        gsap.set(wipe, { autoAlpha: 0 })
        gsap.set(cards, { clearProps: 'all' })
        gsap.fromTo(
          cards,
          { autoAlpha: 0, y: 30 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.06,
            ease: MOTION.easeOut,
            scrollTrigger: { trigger: stage, start: 'top 70%', once: true },
          },
        )
        gsap.fromTo(
          heading,
          { autoAlpha: 0, y: 20 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.08,
            ease: MOTION.easeOut,
            scrollTrigger: { trigger: stage, start: 'top 75%', once: true },
          },
        )
      })

      return () => mm.revert()
    },
    { scope: rootRef },
  )

  return (
    <section
      className="coverage"
      ref={rootRef}
      id="coverage"
      data-accent-hue="205"
      aria-label="Every tier-1 league and international tournament"
    >
      <div className="cov-stage">
        <div className="cov-wipe" aria-hidden="true" />

        {items.map((item) => (
          <div className={`cov-card kind-${item.kind}`} key={item.key} aria-hidden="true">
            <div className="cov-card-inner">
              <img
                src={item.url}
                alt=""
                loading="lazy"
                decoding="async"
                className={item.invert ? 'cov-logo-invert' : undefined}
              />
              <span>{item.key}</span>
            </div>
          </div>
        ))}

        <div className="cov-heading">
          <p className="cov-kicker">coverage</p>
          <h2 className="cov-title">
            every tier-1 stage.
            <br />
            every international.
          </h2>
          <p className="cov-foot">8 tier-1 circuits · twelve seasons deep</p>
        </div>
      </div>
    </section>
  )
}
