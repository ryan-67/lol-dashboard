import { lazy, Suspense, useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { coarsePointer, MOTION, reducedMotion } from './motion'

const HeroN = lazy(() => import('./HeroN'))

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface HeroSectionProps {
  introDone: boolean
  signedIn: boolean
  homePath: string
  onCreateAccount: () => void
}

/**
 * First viewport — one composition, brand first. The glass N and in-scene
 * nucky wordmark carry the identity; DOM contributes a single promise line,
 * one CTA group, and a scroll cue. No stat strips.
 */
export default function HeroSection({
  introDone,
  signedIn,
  homePath,
  onCreateAccount,
}: HeroSectionProps) {
  const rootRef = useRef<HTMLElement>(null)
  const scrollRef = useRef(0)
  const reduce = reducedMotion()
  const compact = coarsePointer()

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return

      if (reduce) {
        gsap.set(root.querySelectorAll('.hero-stagger'), { autoAlpha: 1, y: 0 })
        return
      }

      /* Feed hero scroll progress to the 3D scene (N recedes / wordmark lifts). */
      const feed = ScrollTrigger.create({
        trigger: root,
        start: 'top top',
        end: 'bottom 35%',
        scrub: true,
        onUpdate: (self) => {
          scrollRef.current = self.progress
        },
      })

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

      return () => feed.kill()
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
        root.querySelector('.hero-scene'),
        { autoAlpha: 0, scale: 1.035 },
        { autoAlpha: 1, scale: 1, duration: 1.3, ease: 'power2.out' },
      )
        .fromTo(
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
          '-=0.75',
        )
        .fromTo(
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

      <div className="hero-scene" aria-hidden="true">
        {!reduce ? (
          <Suspense fallback={null}>
            <HeroN scrollRef={scrollRef} compact={compact} />
          </Suspense>
        ) : (
          <div className="hero-static">
            <span className="hero-static-mark">
              nucky<span className="hero-static-dot">.</span>
            </span>
          </div>
        )}
      </div>

      <div className="hero-inner">
        <div className="hero-copy">
          <p className="hero-eyebrow hero-stagger" style={{ opacity: 0 }}>
            <span className="signal-dot" aria-hidden="true" />
            the lolesports signal
          </p>

          <p className="hero-promise hero-stagger" style={{ opacity: 0 }}>
            understand, analyze, and predict tier-1 League of Legends esports —
            twelve years of pro-play memory read by an analyst that answers with evidence.
          </p>

          <div className="hero-actions hero-stagger" style={{ opacity: 0 }}>
            {signedIn ? (
              <Link className="landing-btn landing-btn-primary" to={homePath} data-magnetic>
                enter nucky
                <span className="landing-btn-icon" aria-hidden="true">→</span>
              </Link>
            ) : (
              <button
                type="button"
                className="landing-btn landing-btn-primary"
                onClick={onCreateAccount}
                data-magnetic
              >
                enter nucky
                <span className="landing-btn-icon" aria-hidden="true">→</span>
              </button>
            )}
            <Link className="landing-btn landing-btn-ghost" to="/dashboard" data-magnetic>
              browse free
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
