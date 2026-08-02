import { useEffect, useRef } from 'react'
import { reducedMotion } from './motion'

const GLYPHS = '01アイウエオカキクケコサシスセソタチツナニヌネノnucky<>/\\+=·'
const CELL = 34
const BASE_ALPHA = 0.045
const MOUSE_RADIUS = 260
const MUTATE_MS = 90

/**
 * Faint glitching glyph field (reactbits letter-glitch language, heavily
 * muted): a sparse mono character grid drifts through random mutations and
 * brightens slightly around the pointer. Fixed behind everything; skipped
 * entirely under reduced motion.
 */
export default function LetterGlitch() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion()) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cols = 0
    let rows = 0
    let cells: { char: string; alpha: number }[] = []
    const mouse = { x: -9999, y: -9999 }
    let raf = 0
    let lastMutate = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(window.innerWidth / CELL)
      rows = Math.ceil(window.innerHeight / CELL)
      cells = Array.from({ length: cols * rows }, () => ({
        char: GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!,
        /* Most cells stay dark — a sparse field, not a matrix wall. */
        alpha: Math.random() < 0.22 ? Math.random() : 0,
      }))
      ctx.font = '11px "Noto Sans Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
    }

    const draw = (now: number) => {
      /* Mutate a handful of cells at a gentle cadence. */
      if (now - lastMutate > MUTATE_MS) {
        lastMutate = now
        const mutations = Math.max(3, Math.floor(cells.length * 0.004))
        for (let m = 0; m < mutations; m++) {
          const i = Math.floor(Math.random() * cells.length)
          const cell = cells[i]!
          cell.char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!
          cell.alpha = Math.random() < 0.25 ? Math.random() : cell.alpha * 0.5
        }
      }

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cells[r * cols + c]!
          if (cell.alpha <= 0.02) continue
          const x = c * CELL + CELL / 2
          const y = r * CELL + CELL / 2
          const dist = Math.hypot(x - mouse.x, y - mouse.y)
          const boost = dist < MOUSE_RADIUS ? (1 - dist / MOUSE_RADIUS) * 2.4 : 0
          const alpha = Math.min(0.24, cell.alpha * BASE_ALPHA * (1 + boost * 3))
          ctx.fillStyle = `oklch(0.8 0.115 195 / ${alpha.toFixed(3)})`
          ctx.fillText(cell.char, x, y)
        }
      }
      raf = window.requestAnimationFrame(draw)
    }

    const handleMove = (event: PointerEvent) => {
      mouse.x = event.clientX
      mouse.y = event.clientY
    }
    const handleLeave = () => {
      mouse.x = -9999
      mouse.y = -9999
    }

    resize()
    raf = window.requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', handleMove, { passive: true })
    window.addEventListener('pointerleave', handleLeave)

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerleave', handleLeave)
    }
  }, [])

  return <canvas className="letter-glitch" ref={canvasRef} aria-hidden="true" />
}
