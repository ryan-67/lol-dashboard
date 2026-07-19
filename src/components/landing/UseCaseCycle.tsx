import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'

gsap.registerPlugin(ScrambleTextPlugin)

const IDENTITIES = ['Faker', 'Chovy', 'T1', 'Caps', 'Azir', 'Gen.G', 'Knight', 'BLG'] as const

interface UseCaseCycleProps {
  onAsk?: () => void
  ctaLabel?: string
  ctaTo?: string
}

export default function UseCaseCycle({
  onAsk,
  ctaLabel = 'create account to ask',
  ctaTo,
}: UseCaseCycleProps) {
  const rootRef = useRef<HTMLElement>(null)
  const wordRef = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const word = wordRef.current
      if (!word) return

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) {
        word.textContent = IDENTITIES[0]
        return
      }

      let index = 0
      const cycle = () => {
        index = (index + 1) % IDENTITIES.length
        gsap.to(word, {
          duration: 0.85,
          scrambleText: {
            text: IDENTITIES[index],
            chars: 'lowerCase',
            speed: 0.55,
          },
          ease: 'none',
        })
      }

      word.textContent = IDENTITIES[0]
      const id = window.setInterval(cycle, 2400)
      return () => window.clearInterval(id)
    },
    { scope: rootRef },
  )

  return (
    <section className="landing-usecase-cycle" ref={rootRef} aria-label="Example prompts">
      <div className="landing-usecase-cycle-inner">
        <p className="landing-section-label">try asking</p>
        <p className="landing-usecase-prompt">
          <span className="landing-usecase-prefix">hey nucky analyze </span>
          <span className="landing-usecase-word" ref={wordRef}>
            {IDENTITIES[0]}
          </span>
        </p>
        <p className="landing-usecase-hint">
          Players, teams, champions — same evidence layer as the dashboard and the prediction model.
        </p>
        {ctaTo ? (
          <Link className="landing-btn landing-btn-primary" to={ctaTo}>
            {ctaLabel}
          </Link>
        ) : onAsk ? (
          <button type="button" className="landing-btn landing-btn-primary" onClick={onAsk}>
            {ctaLabel}
          </button>
        ) : null}
      </div>
    </section>
  )
}
