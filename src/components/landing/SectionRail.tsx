import { useEffect, useRef, useState } from 'react'
import { getLandingLenis, reducedMotion } from './motion'

interface RailSection {
  id: string
  label: string
  selector: string
}

/* Order mirrors the page narrative. Selectors resolve the live section
 * elements (the hero has no id — it is addressed by class). */
const SECTIONS: RailSection[] = [
  { id: 'top', label: 'nucky', selector: '.hero' },
  { id: 'features', label: 'product', selector: '#features' },
  { id: 'knows', label: 'knows', selector: '#knows' },
  { id: 'coverage', label: 'coverage', selector: '#coverage' },
  { id: 'model', label: 'model', selector: '#model' },
  { id: 'pricing', label: 'pricing', selector: '#pricing' },
  { id: 'faq', label: 'faq', selector: '#faq' },
  { id: 'get-started', label: 'enter', selector: '#get-started' },
]

/**
 * Alche-style left rail: a fixed column of ticks, one per section, with the
 * active section's label sitting beside its tick. Active detection reads
 * live bounding rects each scroll frame (pin spacers move sections around,
 * so rects — not cached positions — are the source of truth). Clicking a
 * tick rides Lenis to the section.
 */
export default function SectionRail() {
  const rootRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState('top')

  useEffect(() => {
    const els = SECTIONS.map((section) => ({
      id: section.id,
      el: document.querySelector<HTMLElement>(section.selector),
    })).filter((entry): entry is { id: string; el: HTMLElement } => Boolean(entry.el))
    if (!els.length) return

    let frame = 0
    let current = ''
    const update = () => {
      frame = 0
      const mid = window.innerHeight / 2
      /* The active section is the last one whose top has crossed the
       * viewport center — pinned sections stay active for their whole run. */
      let next = els[0]!.id
      for (const entry of els) {
        if (entry.el.getBoundingClientRect().top <= mid) next = entry.id
      }
      if (next !== current) {
        current = next
        setActive(next)
      }
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  const handleJump = (section: RailSection) => {
    const el = document.querySelector<HTMLElement>(section.selector)
    if (!el) return
    const lenis = getLandingLenis()
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.2 })
    else el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav className="section-rail" ref={rootRef} aria-label="Page sections">
      <span className="section-rail-line" aria-hidden="true" />
      <ul>
        {SECTIONS.map((section) => (
          <li key={section.id} className={active === section.id ? 'is-active' : undefined}>
            <button
              type="button"
              onClick={() => handleJump(section)}
              aria-label={`Go to ${section.label}`}
              aria-current={active === section.id ? 'true' : undefined}
            >
              <span className="section-rail-tick" aria-hidden="true" />
              <span className="section-rail-label">{section.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
