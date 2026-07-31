import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { getAppScrollScroller, reducedMotion } from '../../theme/animations'

/**
 * Instrument backdrop for entity heroes: a blueprint field that drifts on scroll
 * plus a slow turquoise sweep. Purely decorative.
 */
export default function EntityHeroField() {
  const ref = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el || reducedMotion()) return

      const trigger = ScrollTrigger.create({
        trigger: el.parentElement ?? el,
        scroller: getAppScrollScroller(),
        start: 'top top',
        end: 'bottom top',
        scrub: 0.6,
        animation: gsap.fromTo(el, { yPercent: -6 }, { yPercent: 10, ease: 'none' }),
      })

      return () => trigger.kill()
    },
    { scope: ref },
  )

  return (
    <>
      <span ref={ref} className="entity-hero-field" aria-hidden="true" />
      <span className="entity-hero-sweep" aria-hidden="true" />
    </>
  )
}
