import { useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion } from './motion'

gsap.registerPlugin(useGSAP)

interface HeroSectionProps {
  introDone: boolean
  signedIn: boolean
  homePath: string
  accuracyLabel: string | null
  onCreateAccount: () => void
}

const HERO_LINES = ['the', 'lolesports', 'signal.']

/** Hero — brand headline left, the wireframe companion dominates the right. */
export default function HeroSection({
  introDone,
  signedIn,
  homePath,
  accuracyLabel,
  onCreateAccount,
}: HeroSectionProps) {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || !introDone) return

      if (reducedMotion()) {
        gsap.set(root.querySelectorAll('.hero-stagger, .hero-line-inner'), {
          autoAlpha: 1,
          yPercent: 0,
          y: 0,
        })
        return
      }

      const tl = gsap.timeline({ defaults: { ease: MOTION.easeOut } })

      tl.fromTo(
        root.querySelector('.hero-eyebrow'),
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.7 },
      )
        .fromTo(
          root.querySelectorAll('.hero-line-inner'),
          { yPercent: 118, filter: 'blur(7px)' },
          {
            yPercent: 0,
            filter: 'blur(0px)',
            duration: 1.05,
            stagger: MOTION.lineStagger,
            ease: MOTION.easeExpo,
          },
          '-=0.35',
        )
        .fromTo(
          root.querySelectorAll('.hero-stagger'),
          { autoAlpha: 0, y: 22, filter: 'blur(6px)' },
          {
            autoAlpha: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.8,
            stagger: 0.09,
            clearProps: 'filter',
          },
          '-=0.55',
        )
        .fromTo(
          root.querySelector('.hero-scroll-cue'),
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.7 },
          '-=0.2',
        )
    },
    { scope: rootRef, dependencies: [introDone] },
  )

  return (
    <section
      className="hero"
      ref={rootRef}
      data-companion="front"
      data-companion-scale="1"
      aria-label="nucky — the lolesports signal"
    >
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="hero-eyebrow" style={{ opacity: 0 }}>
            <span className="signal-dot" aria-hidden="true" />
            lol esports analytics · prediction model · ai analyst
          </p>

          <h1 className="hero-title" aria-label="nucky. the lolesports signal.">
            <span className="hero-line" aria-hidden="true">
              <span className="hero-line-inner hero-brand">
                nucky<span className="hero-brand-dot">.</span>
              </span>
            </span>
            {HERO_LINES.map((line) => (
              <span className="hero-line" key={line} aria-hidden="true">
                <span className="hero-line-inner">{line}</span>
              </span>
            ))}
          </h1>

          <p className="hero-sub hero-stagger" style={{ opacity: 0 }}>
            Twelve years of pro-play memory, proprietary ratings, and auditable
            predictions — read by an analyst that answers with the evidence.
          </p>

          <div className="hero-actions hero-stagger" style={{ opacity: 0 }}>
            {signedIn ? (
              <Link className="landing-btn landing-btn-primary" to={homePath} data-magnetic>
                open app
                <span className="landing-btn-icon" aria-hidden="true">→</span>
              </Link>
            ) : (
              <button
                type="button"
                className="landing-btn landing-btn-primary"
                onClick={onCreateAccount}
                data-magnetic
              >
                create account
                <span className="landing-btn-icon" aria-hidden="true">→</span>
              </button>
            )}
            <Link className="landing-btn landing-btn-ghost" to="/dashboard" data-magnetic>
              browse the free dashboard
            </Link>
          </div>

          {accuracyLabel ? (
            <p className="hero-readout hero-stagger" style={{ opacity: 0 }}>
              <span className="hero-readout-value">{accuracyLabel}</span>
              walk-forward prediction accuracy
            </p>
          ) : null}

          <div className="hero-leagues hero-stagger" style={{ opacity: 0 }} aria-label="League coverage">
            {['LCK', 'LPL', 'LEC', 'LCS', 'MSI', 'Worlds', 'First Stand', 'EWC'].map((league) => (
              <span key={league}>{league}</span>
            ))}
          </div>
        </div>

        {/* The wireframe companion (fixed overlay) occupies this half. */}
        <div className="hero-visual-space" aria-hidden="true" />
      </div>

      <div className="hero-scroll-cue" style={{ opacity: 0 }} aria-hidden="true">
        <span className="hero-scroll-cue-line" />
        scroll
      </div>
    </section>
  )
}
