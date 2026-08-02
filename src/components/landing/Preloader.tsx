import { useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { reducedMotion, scrambleText } from './motion'

gsap.registerPlugin(useGSAP)

interface PreloaderProps {
  onComplete: () => void
}

const VERBS = ['understand', 'analyze', 'predict'] as const

/**
 * Signal-lock loader. Three verbs cycle through a masked line while a mono
 * readout acquires the feed, then the full promise locks and the plate
 * splits open into the hero. ≤2.8s, never traps the page.
 */
export default function Preloader({ onComplete }: PreloaderProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
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

      const verbs = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.preloader-verb'))
      const subject = root.querySelector('.preloader-subject')
      const bar = root.querySelector('.preloader-bar-fill')
      const brand = root.querySelector('.preloader-brand')
      const panels = root.querySelectorAll('.preloader-panel')
      const frame = root.querySelector('.preloader-frame')
      const readout = readoutRef.current

      const progress = { pct: 0 }
      const labels = ['acquiring feed', 'indexing seasons', 'rating rosters', 'signal locked']

      const tl = gsap.timeline({
        defaults: { ease: 'power4.out' },
        onComplete: finish,
      })

      /* Frame + brand establish. */
      tl.fromTo(frame, { autoAlpha: 0, scale: 0.965 }, { autoAlpha: 1, scale: 1, duration: 0.4 })
      tl.fromTo(
        brand,
        { autoAlpha: 0, y: 12, filter: 'blur(6px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.45 },
        0.05,
      )

      /* Readout counts up alongside the verb cycle. */
      tl.to(
        progress,
        {
          pct: 100,
          duration: 1.75,
          ease: 'power2.inOut',
          onUpdate: () => {
            if (!readout) return
            const pct = Math.round(progress.pct)
            const label = labels[Math.min(labels.length - 1, Math.floor((pct / 101) * labels.length))]
            readout.textContent = `${label} · ${String(pct).padStart(3, '0')}%`
          },
        },
        0.2,
      )
      tl.fromTo(
        bar,
        { scaleX: 0, transformOrigin: 'left center' },
        { scaleX: 1, duration: 1.75, ease: 'power2.inOut' },
        0.2,
      )

      /* Verb cycle — each rises through the mask and hands off. */
      verbs.forEach((verb, i) => {
        const at = 0.28 + i * 0.42
        tl.fromTo(
          verb,
          { yPercent: 112 },
          { yPercent: 0, duration: 0.4, ease: 'power4.out' },
          at,
        )
        if (i < verbs.length - 1) {
          tl.to(verb, { yPercent: -112, duration: 0.34, ease: 'power3.in' }, at + 0.42)
        }
      })

      /* Subject locks in beside the final verb. */
      tl.fromTo(
        subject,
        { autoAlpha: 0, x: 14, filter: 'blur(8px)' },
        { autoAlpha: 1, x: 0, filter: 'blur(0px)', duration: 0.5 },
        0.28 + (VERBS.length - 1) * 0.42 + 0.1,
      )
      tl.add(() => {
        scrambleText(root.querySelector('.preloader-subject-inner'), 'lolesports', 0.55)
      }, '<')

      /* Plate splits — twin panels wipe vertically, frame dissolves. */
      tl.to(frame, { autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, '+=0.32')
      tl.to(
        panels,
        {
          yPercent: -100,
          duration: 0.75,
          ease: 'power4.inOut',
          stagger: 0.09,
        },
        '<+0.05',
      )

      /* Safety: never trap the page behind the loader. */
      const safety = window.setTimeout(finish, 4200)
      return () => window.clearTimeout(safety)
    },
    { scope: rootRef },
  )

  if (done) return null

  return (
    <div className="preloader" ref={rootRef} aria-hidden="true">
      <div className="preloader-panel preloader-panel--a" />
      <div className="preloader-panel preloader-panel--b" />

      <div className="preloader-frame">
        <span className="preloader-corner preloader-corner--tl" />
        <span className="preloader-corner preloader-corner--tr" />
        <span className="preloader-corner preloader-corner--bl" />
        <span className="preloader-corner preloader-corner--br" />

        <div className="preloader-brand">
          nucky<span className="preloader-dot">.</span>
        </div>

        <div className="preloader-line">
          <span className="preloader-verb-mask">
            {VERBS.map((verb) => (
              <span className="preloader-verb" key={verb}>
                {verb}
              </span>
            ))}
          </span>
          <span className="preloader-subject">
            <span className="preloader-subject-inner">lolesports</span>
          </span>
        </div>

        <div className="preloader-meta">
          <span className="preloader-readout" ref={readoutRef}>
            acquiring feed · 000%
          </span>
          <span className="preloader-bar">
            <span className="preloader-bar-fill" />
          </span>
        </div>
      </div>
    </div>
  )
}
