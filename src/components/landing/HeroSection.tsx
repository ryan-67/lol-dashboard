import { useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { initTypeCycle, MOTION, reducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface HeroSectionProps {
  introDone: boolean
  signedIn: boolean
  homePath: string
  onCreateAccount: () => void
}

const CYCLE_VERBS = ['understands', 'analyzes', 'predicts'] as const

/**
 * First viewport — one composition, brand first. The persistent glass N
 * scene (mounted at page level) carries the identity; this section owns the
 * typed promise line, one CTA group, and the scroll cue.
 */
export default function HeroSection({
  introDone,
  signedIn,
  homePath,
  onCreateAccount,
}: HeroSectionProps) {
  const rootRef = useRef<HTMLElement>(null)
  const verbRef = useRef<HTMLSpanElement>(null)
  const reduce = reducedMotion()

  /* Typed verb rotation — starts once the loader hands off. */
  useGSAP(
    () => {
      if (!introDone) return
      return initTypeCycle(verbRef.current, CYCLE_VERBS)
    },
    { scope: rootRef, dependencies: [introDone] },
  )

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return

      if (reduce) {
        gsap.set(root.querySelectorAll('.hero-stagger'), { autoAlpha: 1, y: 0 })
        return
      }

      /* DOM copy drifts up slightly faster than the scene for depth. */
      gsap.to(root.querySelector('.hero-copy'), {
        yPercent: -26,
        autoAlpha: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: 'bottom 55%',
          scrub: MOTION.scrub,
        },
      })
    },
    { scope: rootRef, dependencies: [reduce] },
  )

  /* Entrance choreography waits for the loader hand-off. */
  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || !introDone || reduce) return

      const tl = gsap.timeline({ defaults: { ease: MOTION.easeOut } })
      tl.fromTo(
        root.querySelectorAll('.hero-stagger'),
        { autoAlpha: 0, y: 26, filter: 'blur(7px)' },
        {
          autoAlpha: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.9,
          stagger: 0.11,
          clearProps: 'filter',
        },
        0.3,
      ).fromTo(
        root.querySelector('.hero-scroll-cue'),
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.7 },
        '-=0.3',
      )
    },
    { scope: rootRef, dependencies: [introDone, reduce] },
  )

  return (
    <section
      className="hero"
      ref={rootRef}
      data-accent-hue="195"
      aria-label="nucky — understand, analyze, and predict lolesports"
    >
      <h1 className="sr-only">nucky — understand, analyze, and predict lolesports</h1>

      <div className="hero-inner">
        <div className="hero-copy">
          <p className="hero-eyebrow hero-stagger" style={{ opacity: 0 }}>
            <span className="signal-dot" aria-hidden="true" />
            the lolesports signal
          </p>

          <p className="hero-promise hero-stagger" style={{ opacity: 0 }} aria-hidden="true">
            nucky{' '}
            <span className="hero-verb">
              <span ref={verbRef}>{reduce ? CYCLE_VERBS[0] : ''}</span>
              <span className="type-caret" />
            </span>{' '}
            tier-1 lolesports
          </p>
          <p className="sr-only">nucky understands, analyzes, and predicts tier-1 lolesports</p>

          <div className="hero-actions hero-stagger" style={{ opacity: 0 }}>
            {signedIn ? (
              <Link className="landing-btn landing-btn-primary" to={homePath} data-magnetic>
                <span className="btn-label">enter nucky</span>
                <span className="landing-btn-icon" aria-hidden="true">→</span>
              </Link>
            ) : (
              <button
                type="button"
                className="landing-btn landing-btn-primary"
                onClick={onCreateAccount}
                data-magnetic
              >
                <span className="btn-label">enter nucky</span>
                <span className="landing-btn-icon" aria-hidden="true">→</span>
              </button>
            )}
            <Link className="landing-btn landing-btn-ghost" to="/dashboard" data-magnetic>
              <span className="btn-label">browse free</span>
              <span className="landing-btn-icon" aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="hero-scroll-cue" style={{ opacity: 0 }} aria-hidden="true">
        <span className="hero-scroll-cue-line" />
        scroll
      </div>
    </section>
  )
}
