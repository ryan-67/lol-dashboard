import { useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface FinalCtaSectionProps {
  signedIn: boolean
  homePath: string
  onCreateAccount: () => void
}

/**
 * Closing brand plane — the wordmark returns at architectural scale and
 * fills with signal as it scrubs through, then hands off into the product.
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

      const fill = root.querySelector<HTMLElement>('.finale-mark-fill')

      if (reducedMotion()) {
        gsap.set(fill, { clipPath: 'inset(0% 0% 0% 0%)' })
        return
      }

      /* The outline wordmark floods with light as it crosses the viewport. */
      gsap.fromTo(
        fill,
        { clipPath: 'inset(0% 100% 0% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          ease: 'none',
          scrollTrigger: {
            trigger: root.querySelector('.finale-mark'),
            start: 'top 80%',
            end: 'center 42%',
            scrub: MOTION.scrub,
          },
        },
      )

      /* Slow spatial drift on the mark for ambient life. */
      gsap.to(root.querySelector('.finale-mark'), {
        yPercent: -8,
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.2,
        },
      })
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
      <div className="finale-mark" aria-hidden="true">
        <span className="finale-mark-outline">nucky</span>
        <span className="finale-mark-fill">nucky</span>
      </div>

      <div className="finale-inner landing-inner">
        <p className="finale-label" data-reveal="blur-in">the signal is live</p>
        <h2 className="finale-title" data-motion-text>
          stop guessing. start reading the signal.
        </h2>
        <p className="finale-sub" data-reveal="fade-up">
          Browse the free dashboard today. Bring the analyst in when you want the evidence explained.
        </p>
        <div className="finale-actions" data-reveal="fade-up">
          <Link className="landing-btn landing-btn-primary landing-btn-lg" to="/dashboard" data-magnetic>
            open the dashboard
            <span className="landing-btn-icon" aria-hidden="true">→</span>
          </Link>
          {signedIn ? (
            <Link className="landing-btn landing-btn-ghost landing-btn-lg" to={homePath} data-magnetic>
              open app
            </Link>
          ) : (
            <button
              type="button"
              className="landing-btn landing-btn-ghost landing-btn-lg"
              onClick={onCreateAccount}
              data-magnetic
            >
              create account
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
