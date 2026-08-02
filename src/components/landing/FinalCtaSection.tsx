import { useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { initHyperText, reducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface FinalCtaSectionProps {
  signedIn: boolean
  homePath: string
  onCreateAccount: () => void
}

const FINALE_LINKS = [
  { to: '/dashboard', label: 'dashboard' },
  { to: '/#features', label: 'product' },
  { to: '/#model', label: 'model' },
  { to: '/#pricing', label: 'pricing' },
  { to: '/#faq', label: 'faq' },
  { to: '/contact', label: 'contact' },
]

const FINALE_LEGAL = [
  { to: '/private-policy', label: 'privacy' },
  { to: '/terms', label: 'terms' },
]

/**
 * Closing brand plane (alche end-frame language): scrolling to the bottom
 * wipes into a full plate that is just "nucky" at architectural scale, with
 * the site links and the two CTAs beneath it. The persistent glass N and
 * atmosphere glow faintly behind the wordmark.
 */
export default function FinalCtaSection({
  signedIn,
  homePath,
  onCreateAccount,
}: FinalCtaSectionProps) {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return

      const cleanupHyper = initHyperText(root)

      const wipe = root.querySelector<HTMLElement>('.finale-wipe')
      const mark = root.querySelector<HTMLElement>('.finale-mark')
      const rows = root.querySelectorAll<HTMLElement>('.finale-row')

      if (reducedMotion()) {
        gsap.set(wipe, { autoAlpha: 0 })
        gsap.set([mark, rows], { autoAlpha: 1 })
        return cleanupHyper
      }

      /* Page transition — the plate wipes up, then the wordmark inflates
       * from below the fold and the link rows settle in. */
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          start: 'top 82%',
          end: 'top 12%',
          scrub: 1,
        },
      })
      tl.fromTo(wipe, { yPercent: 0 }, { yPercent: -100, duration: 0.45, ease: 'power2.inOut' })
      tl.fromTo(
        mark,
        { yPercent: 34, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out' },
        0.18,
      )
      tl.fromTo(
        rows,
        { autoAlpha: 0, y: 30 },
        { autoAlpha: 1, y: 0, duration: 0.32, stagger: 0.08, ease: 'power3.out' },
        0.5,
      )

      /* Ambient — the wordmark breathes very slowly once revealed. */
      const breathe = gsap.to(mark, {
        scale: 1.015,
        duration: 5.5,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })

      return () => {
        cleanupHyper()
        breathe.kill()
      }
    },
    { scope: rootRef },
  )

  return (
    <section
      className="finale"
      ref={rootRef}
      id="get-started"
      data-accent-hue="195"
      aria-label="Get started with nucky"
    >
      <div className="finale-wipe" aria-hidden="true" />

      <div className="finale-plane">
        <div className="finale-mark">
          nucky<span className="finale-mark-dot">.</span>
        </div>

        <div className="finale-row finale-actions">
          <Link className="landing-btn landing-btn-primary landing-btn-lg" to="/dashboard" data-magnetic>
            <span className="btn-label">open the dashboard</span>
            <span className="landing-btn-icon" aria-hidden="true">→</span>
          </Link>
          {signedIn ? (
            <Link className="landing-btn landing-btn-ghost landing-btn-lg" to={homePath} data-magnetic>
              <span className="btn-label">open app</span>
              <span className="landing-btn-icon" aria-hidden="true">→</span>
            </Link>
          ) : (
            <button
              type="button"
              className="landing-btn landing-btn-ghost landing-btn-lg"
              onClick={onCreateAccount}
              data-magnetic
            >
              <span className="btn-label">create account</span>
              <span className="landing-btn-icon" aria-hidden="true">→</span>
            </button>
          )}
        </div>

        <div className="finale-row finale-links" aria-label="Site">
          {FINALE_LINKS.map((link) => (
            <Link key={link.label} to={link.to} className="finale-link" data-hyper>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="finale-row finale-meta">
          <span>© 2026 nucky · geonbu@nucky.gg</span>
          <span className="finale-meta-links">
            {FINALE_LEGAL.map((link) => (
              <Link key={link.label} to={link.to} className="finale-link" data-hyper>
                {link.label}
              </Link>
            ))}
          </span>
          <span className="finale-riot">
            not endorsed by Riot Games · League of Legends is a trademark of Riot Games, Inc.
          </span>
        </div>
      </div>
    </section>
  )
}
