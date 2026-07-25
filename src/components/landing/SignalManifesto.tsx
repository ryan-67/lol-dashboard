import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const LINES = [
  'twelve years of match memory.',
  'thousands of tier-1 games, scored.',
  'ratings that know role, form, and opposition.',
  'predictions you can audit — not vibes.',
]

/**
 * Pinned scroll chapter: words scrub from dim → full as you move through the beat.
 * Scroll-world craft adapted to GSAP (no video pipeline).
 */
export default function SignalManifesto() {
  const sectionRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const section = sectionRef.current
      if (!section) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const words = section.querySelectorAll<HTMLElement>('.landing-manifesto-word')
      const mm = gsap.matchMedia()

      if (reduce) {
        gsap.set(words, { opacity: 1 })
        return
      }

      mm.add('(min-width: 768px)', () => {
        gsap.set(words, { opacity: 0.12 })

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: '+=220%',
            pin: true,
            scrub: 0.65,
            anticipatePin: 1,
          },
        })

        words.forEach((word, i) => {
          tl.to(
            word,
            {
              opacity: 1,
              duration: 0.35,
              ease: 'none',
            },
            i * 0.22,
          )
        })

        tl.to(
          section.querySelector('.landing-manifesto-mark'),
          { opacity: 1, scale: 1, duration: 0.4, ease: 'none' },
          '-=0.2',
        )

        return () => {
          tl.scrollTrigger?.kill()
          tl.kill()
        }
      })

      mm.add('(max-width: 767px)', () => {
        gsap.fromTo(
          words,
          { opacity: 0.2, y: 12 },
          {
            opacity: 1,
            y: 0,
            stagger: 0.06,
            duration: 0.45,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: section,
              start: 'top 75%',
              once: true,
            },
          },
        )
      })
    },
    { scope: sectionRef },
  )

  return (
    <section className="landing-manifesto" ref={sectionRef} aria-label="What nucky reads">
      <div className="landing-manifesto-inner">
        <p className="landing-manifesto-kicker">
          <span className="landing-manifesto-mark" aria-hidden="true" />
          the instrument
        </p>
        <div className="landing-manifesto-lines">
          {LINES.map((line) => (
            <p key={line} className="landing-manifesto-line">
              {line.split(' ').map((word, i) => (
                <span key={`${line}-${i}`} className="landing-manifesto-word">
                  {word}
                  {i < line.split(' ').length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}
