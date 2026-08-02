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

const MARK = 'nucky'

/**
 * Closing brand plane (alche end-frame language): the persistent glass N
 * brightens + spins (driven from Landing via finaleRef), then this plate
 * reveals "nucky" letter-by-letter with a scramble settle, followed by the
 * CTAs and site links. No separate footer bar — meta lives here.
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
      const letters = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.finale-letter'))
      const rows = root.querySelectorAll<HTMLElement>('.finale-row')

      if (reducedMotion()) {
        gsap.set(wipe, { autoAlpha: 0 })
        gsap.set([mark, rows], { autoAlpha: 1 })
        gsap.set(letters, { autoAlpha: 1, y: 0 })
        return cleanupHyper
      }

      gsap.set(letters, { autoAlpha: 0, y: 80, rotateX: -55 })
      gsap.set(rows, { autoAlpha: 0, y: 30 })
      gsap.set(mark, { autoAlpha: 1 })

      /* Scrubbed handoff: wipe clears as the N finishes its spin, then
       * letters cascade in. A one-shot scramble settles each glyph. */
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          start: 'top 78%',
          end: 'top 8%',
          scrub: 1.05,
        },
      })

      tl.fromTo(wipe, { yPercent: 0 }, { yPercent: -100, duration: 0.4, ease: 'power2.inOut' })

      tl.to(
        letters,
        {
          autoAlpha: 1,
          y: 0,
          rotateX: 0,
          duration: 0.55,
          stagger: 0.07,
          ease: 'power3.out',
        },
        0.22,
      )

      tl.fromTo(
        rows,
        { autoAlpha: 0, y: 30 },
        { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.08, ease: 'power3.out' },
        0.55,
      )

      /* One-shot letter scramble when the plate crosses mid-viewport —
       * text-type / hyper-text kin for the architectural wordmark. */
      const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      const settleScramble = () => {
        letters.forEach((el, i) => {
          if (el.dataset.settled === '1') return
          const finalChar = el.dataset.char ?? ''
          if (finalChar === '.') {
            el.dataset.settled = '1'
            return
          }
          const steps = 8 + i * 2
          let step = 0
          const tick = window.setInterval(() => {
            step += 1
            if (step >= steps) {
              el.textContent = finalChar
              el.dataset.settled = '1'
              window.clearInterval(tick)
              return
            }
            el.textContent = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)] ?? finalChar
          }, 28)
        })
      }

      ScrollTrigger.create({
        trigger: root,
        start: 'top 45%',
        once: true,
        onEnter: settleScramble,
      })

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
        {/* The wordmark owns the plate — alche end-frame scale. */}
        <div className="finale-center">
          <h2 className="finale-mark" aria-label="nucky">
            {MARK.split('').map((char, i) => (
              <span
                key={`${char}-${i}`}
                className="finale-letter"
                data-char={char}
                aria-hidden="true"
              >
                {char}
              </span>
            ))}
            <span className="finale-letter finale-mark-dot" data-char="." aria-hidden="true">
              .
            </span>
          </h2>
        </div>

        {/* Everything else lives at the bottom of the plate. */}
        <div className="finale-bottom">
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
              <Link to="/contact" className="finale-link" data-hyper>
                contact
              </Link>
            </span>
            <span className="finale-riot">
              not endorsed by Riot Games · League of Legends is a trademark of Riot Games, Inc.
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
