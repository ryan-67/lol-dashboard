import { useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { reducedMotion } from './motion'

gsap.registerPlugin(useGSAP)

interface PreloaderProps {
  onComplete: () => void
}

const PROMISE_TEXT = 'understand, analyze, and predict lolesports'

/* The blocky N letterform — same proportions as the 3D hero geometry
 * (W 1.9 / H 2.5 / stem 0.52 / knee 0.98), scaled into a 380×500 box. */
const N_SCALE = 200
const N_W = 1.9 * N_SCALE
const N_H = 2.5 * N_SCALE
const N_T = 0.52 * N_SCALE
const N_K = 0.98 * N_SCALE

const N_PATH = [
  `M 0 ${N_H}`,
  `L 0 0`,
  `L ${N_T} 0`,
  `L ${N_W - N_T} ${N_H - N_K}`,
  `L ${N_W - N_T} 0`,
  `L ${N_W} 0`,
  `L ${N_W} ${N_H}`,
  `L ${N_W - N_T} ${N_H}`,
  `L ${N_T} ${N_K}`,
  `L ${N_T} ${N_H}`,
  'Z',
].join(' ')

/* Construction guides — horizontal/vertical hairlines through the letter's
 * structural coordinates, plus the two diagonal rails of the stroke. */
const GUIDE_X = [0, N_T, N_W - N_T, N_W]
const GUIDE_Y = [0, N_K, N_H - N_K, N_H]

/**
 * Blueprint loader (alche-style construction plate): guide lines extend
 * across the plate, the N letterform draws itself stroke-first, a dotted
 * compass circle rotates behind it, and the promise line types out beneath.
 * The drawn N then hands off into the 3D glass N as the plate dissolves.
 */
export default function Preloader({ onComplete }: PreloaderProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const typeRef = useRef<HTMLSpanElement>(null)
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

      const guides = root.querySelectorAll<SVGLineElement>('.preloader-guide')
      const letter = root.querySelector<SVGPathElement>('.preloader-letter')
      const circle = root.querySelector<SVGCircleElement>('.preloader-circle')
      const svg = root.querySelector('.preloader-blueprint')
      const typeEl = typeRef.current
      const plate = root.querySelector('.preloader-plate')

      /* Stroke-draw setup. A tiny dash overshoot plus clearing the pattern
       * once the tween lands guarantees the outline fully closes (measured
       * length can undershoot the rendered path with miter joins). */
      const letterLength = (letter?.getTotalLength() ?? 0) * 1.005
      if (letter) {
        letter.style.strokeDasharray = `${letterLength}`
        letter.style.strokeDashoffset = `${letterLength}`
      }
      guides.forEach((line) => {
        const len = Math.hypot(
          Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')),
          Number(line.getAttribute('y2')) - Number(line.getAttribute('y1')),
        )
        line.style.strokeDasharray = `${len}`
        line.style.strokeDashoffset = `${len}`
      })

      const tl = gsap.timeline({ onComplete: finish })

      /* 1 — construction guides sweep across the plate. */
      tl.to(guides, {
        strokeDashoffset: 0,
        duration: 0.9,
        stagger: 0.05,
        ease: 'power3.inOut',
      })

      /* Compass circle fades up and slowly turns throughout. */
      if (circle) {
        tl.fromTo(circle, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 0.35)
        gsap.to(circle, {
          rotation: 360,
          duration: 26,
          repeat: -1,
          ease: 'none',
          transformOrigin: 'center center',
          svgOrigin: `${N_W / 2} ${N_H / 2}`,
        })
      }

      /* 2 — the letterform draws itself, then the dash pattern clears so
       * the full outline is guaranteed regardless of length rounding. */
      if (letter) {
        tl.to(
          letter,
          {
            strokeDashoffset: 0,
            duration: 1.5,
            ease: 'power2.inOut',
            onComplete: () => {
              letter.style.strokeDasharray = 'none'
              letter.style.strokeDashoffset = '0'
            },
          },
          0.5,
        )
      }

      /* 3 — the promise types out under the mark. */
      const typing = { chars: 0 }
      tl.to(
        typing,
        {
          chars: PROMISE_TEXT.length,
          duration: PROMISE_TEXT.length * 0.028,
          ease: 'none',
          onUpdate: () => {
            if (typeEl) typeEl.textContent = PROMISE_TEXT.slice(0, Math.round(typing.chars))
          },
        },
        0.95,
      )

      /* 4 — hand-off: guides retreat, the N inflates toward the 3D mark's
       * scale and dissolves as the hero scene fades in underneath. The wait
       * anchors after the draw finishes so the outline always completes. */
      tl.to(guides, { autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, 2.15)
      tl.to(circle, { autoAlpha: 0, duration: 0.4 }, '<')
      tl.to(
        svg,
        { scale: 1.22, duration: 0.85, ease: 'power3.inOut', transformOrigin: 'center center' },
        '<',
      )
      tl.to(letter, { autoAlpha: 0, duration: 0.55, ease: 'power2.in' }, '<+0.3')
      tl.to(root.querySelector('.preloader-type'), { autoAlpha: 0, duration: 0.4 }, '<')
      tl.to(plate, { autoAlpha: 0, duration: 0.7, ease: 'power2.inOut' }, '<+0.15')

      /* Safety: never trap the page behind the loader. */
      const safety = window.setTimeout(finish, 5200)
      return () => window.clearTimeout(safety)
    },
    { scope: rootRef },
  )

  if (done) return null

  return (
    <div className="preloader" ref={rootRef} aria-hidden="true">
      <div className="preloader-plate">
        <svg
          className="preloader-blueprint"
          viewBox={`${-N_W * 1.6} ${-N_H * 0.5} ${N_W * 4.2} ${N_H * 2}`}
          fill="none"
          aria-hidden="true"
        >
          {/* Guides span the whole plate through the letter's coordinates. */}
          {GUIDE_X.map((x) => (
            <line
              key={`gx-${x}`}
              className="preloader-guide"
              x1={x}
              y1={-N_H * 0.5}
              x2={x}
              y2={N_H * 1.5}
            />
          ))}
          {GUIDE_Y.map((y) => (
            <line
              key={`gy-${y}`}
              className="preloader-guide"
              x1={-N_W * 1.6}
              y1={y}
              x2={N_W * 2.6}
              y2={y}
            />
          ))}
          {/* Diagonal construction rails along the stroke. */}
          <line
            className="preloader-guide"
            x1={N_T - N_W * 0.8}
            y1={N_K - N_K * 1.55}
            x2={N_W - N_T + N_W * 0.8}
            y2={N_H - N_K + N_K * 1.55}
          />
          <line
            className="preloader-guide"
            x1={0 - N_W * 0.8}
            y1={0 - N_K * 1.55}
            x2={N_W + N_W * 0.8}
            y2={N_H + N_K * 1.55}
          />

          {/* Dotted compass circle. */}
          <circle
            className="preloader-circle"
            cx={N_W / 2}
            cy={N_H / 2}
            r={N_H * 0.66}
            strokeDasharray="2 9"
          />

          {/* The letterform itself. */}
          <path className="preloader-letter" d={N_PATH} />
        </svg>

        <p className="preloader-type">
          <span ref={typeRef} />
          <span className="type-caret" />
        </p>
      </div>
    </div>
  )
}
