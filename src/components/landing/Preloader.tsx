import { useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { reducedMotion } from './motion'

gsap.registerPlugin(useGSAP)

interface PreloaderProps {
  onComplete: () => void
}

/** Brief brand-establishing preloader (≤1.2s) that hands off into the hero. */
export default function Preloader({ onComplete }: PreloaderProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)
  const completedRef = useRef(false)

  const finish = () => {
    if (completedRef.current) return
    completedRef.current = true
    setDone(true)
    onComplete()
  }

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return

      if (reducedMotion()) {
        finish()
        return
      }

      const bar = root.querySelector('.preloader-bar-fill')
      const brand = root.querySelector('.preloader-brand')

      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: finish,
      })

      tl.fromTo(brand, { autoAlpha: 0, y: 14, filter: 'blur(6px)' }, {
        autoAlpha: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.4,
      })
        .fromTo(
          bar,
          { scaleX: 0, transformOrigin: 'left center' },
          { scaleX: 1, duration: 0.55, ease: 'power2.inOut' },
          0.05,
        )
        .to(root, { yPercent: -100, duration: 0.55, ease: 'power4.inOut' }, '+=0.08')

      /* Safety: never trap the page behind the loader. */
      const safety = window.setTimeout(finish, 2200)
      return () => window.clearTimeout(safety)
    },
    { scope: rootRef },
  )

  if (done) return null

  return (
    <div className="preloader" ref={rootRef} aria-hidden="true">
      <div className="preloader-inner">
        <div className="preloader-brand">
          nucky<span className="preloader-dot">.</span>
        </div>
        <div className="preloader-bar">
          <div className="preloader-bar-fill" />
        </div>
      </div>
    </div>
  )
}
