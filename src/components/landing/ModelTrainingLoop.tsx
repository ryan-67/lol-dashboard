import { useEffect, useRef } from 'react'
import { reducedMotion } from './motion'

const ROUNDS = 14
const ROUND_MS = 620
const HOLD_MS = 1800
const ACCENT = '#57c4cf'
const INK = 'rgba(243, 240, 231, 0.75)'
const FAINT = 'rgba(87, 196, 207, 0.16)'

/* Deterministic pseudo-noise so every loop replays identically. */
const noise = (i: number) => Math.sin(i * 12.9898) * 0.5

/* Walk-forward loss trajectory: exponential decay toward the published
 * holdout log-loss, with per-round jitter. */
const lossAt = (round: number) =>
  0.693 - (0.693 - 0.5648) * (1 - Math.exp(-round * 0.32)) + noise(round) * 0.012

/**
 * Loopable "gradient-boosted training" vignette rendered live on canvas —
 * boosting rounds stack small correction trees along the base while the
 * walk-forward log-loss traces down toward the published number. True to
 * the product: axes, mono readouts, turquoise signal on matte black.
 */
export default function ModelTrainingLoop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const staticRender = reducedMotion()
    let raf = 0
    let running = false
    let started = performance.now()

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      return { w: rect.width, h: rect.height }
    }

    /* One abstract correction tree: a 3-level binary fan of nodes. */
    const drawTree = (x: number, baseY: number, scale: number, alpha: number, seed: number) => {
      ctx.strokeStyle = `rgba(87, 196, 207, ${0.5 * alpha})`
      ctx.fillStyle = `rgba(143, 231, 238, ${0.85 * alpha})`
      ctx.lineWidth = 1

      const levels = [
        [{ dx: 0, dy: -30 }],
        [
          { dx: -11, dy: -17 },
          { dx: 11, dy: -17 },
        ],
        [
          { dx: -17, dy: -4 },
          { dx: -6, dy: -4 },
          { dx: 6, dy: -4 },
          { dx: 17, dy: -4 },
        ],
      ]
      const jitter = (v: number, i: number) => v + noise(seed * 7 + i) * 4

      const pts = levels.map((level, li) =>
        level.map((p, pi) => ({
          x: x + jitter(p.dx, li * 5 + pi) * scale,
          y: baseY + p.dy * scale,
        })),
      )

      ctx.beginPath()
      pts[1]!.forEach((child, ci) => {
        ctx.moveTo(pts[0]![0]!.x, pts[0]![0]!.y)
        ctx.lineTo(child.x, child.y)
        const kids = pts[2]!.slice(ci * 2, ci * 2 + 2)
        kids.forEach((kid) => {
          ctx.moveTo(child.x, child.y)
          ctx.lineTo(kid.x, kid.y)
        })
      })
      ctx.stroke()

      pts.flat().forEach((p) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.7 * scale, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    const draw = () => {
      const { w, h } = size()
      const cycle = ROUNDS * ROUND_MS + HOLD_MS
      const elapsed = staticRender ? cycle - HOLD_MS - 1 : (performance.now() - started) % cycle
      const liveRounds = Math.min(ROUNDS, elapsed / ROUND_MS)

      ctx.clearRect(0, 0, w, h)

      const padX = 34
      const padTop = 30
      const chartBottom = h - 76
      const chartW = w - padX * 2
      const chartH = chartBottom - padTop

      /* Dot grid. */
      ctx.fillStyle = FAINT
      for (let gx = 0; gx <= 8; gx++) {
        for (let gy = 0; gy <= 4; gy++) {
          ctx.beginPath()
          ctx.arc(padX + (chartW * gx) / 8, padTop + (chartH * gy) / 4, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      /* Axes. */
      ctx.strokeStyle = 'rgba(243, 240, 231, 0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padX, padTop)
      ctx.lineTo(padX, chartBottom)
      ctx.lineTo(padX + chartW, chartBottom)
      ctx.stroke()

      /* High loss at the top, converged loss toward the base — the curve
       * visibly descends as rounds accumulate. */
      const lossToY = (loss: number) => padTop + ((0.72 - loss) / (0.72 - 0.54)) * chartH
      const roundToX = (r: number) => padX + (chartW * r) / ROUNDS

      /* Baseline reference. */
      const baseY = lossToY(0.703)
      ctx.strokeStyle = 'rgba(243, 240, 231, 0.22)'
      ctx.setLineDash([3, 6])
      ctx.beginPath()
      ctx.moveTo(padX, baseY)
      ctx.lineTo(padX + chartW, baseY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(243, 240, 231, 0.4)'
      ctx.font = '9px "Noto Sans Mono", monospace'
      ctx.textAlign = 'right'
      ctx.fillText('naive baseline 0.703', padX + chartW, baseY - 6)

      /* Loss curve up to the live round. */
      ctx.strokeStyle = ACCENT
      ctx.lineWidth = 1.6
      ctx.shadowColor = 'rgba(87, 196, 207, 0.55)'
      ctx.shadowBlur = 8
      ctx.beginPath()
      for (let r = 0; r <= liveRounds; r += 0.25) {
        const x = roundToX(r)
        const y = lossToY(lossAt(r))
        if (r === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      /* Live point + halo. */
      const px = roundToX(liveRounds)
      const py = lossToY(lossAt(liveRounds))
      ctx.fillStyle = '#8fe7ee'
      ctx.beginPath()
      ctx.arc(px, py, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(143, 231, 238, 0.35)'
      ctx.beginPath()
      ctx.arc(px, py, 7 + Math.sin(elapsed / 260) * 2, 0, Math.PI * 2)
      ctx.stroke()

      /* Boosting rounds — correction trees stack along the base. */
      const treeGap = chartW / ROUNDS
      for (let t = 0; t < Math.floor(liveRounds); t++) {
        const age = Math.min(1, (elapsed - t * ROUND_MS) / 400)
        drawTree(padX + treeGap * (t + 0.5), h - 14, 0.9, age * 0.9, t)
      }

      /* Readouts. */
      ctx.fillStyle = INK
      ctx.font = '10px "Noto Sans Mono", monospace'
      ctx.textAlign = 'left'
      const round = String(Math.floor(liveRounds)).padStart(2, '0')
      ctx.fillText(`boosting round ${round} / ${ROUNDS}`, padX, 16)
      ctx.textAlign = 'right'
      ctx.fillStyle = ACCENT
      ctx.fillText(`walk-forward log-loss ${lossAt(liveRounds).toFixed(4)}`, padX + chartW, 16)

      if (!staticRender && running) raf = window.requestAnimationFrame(draw)
    }

    /* Only burn frames while on stage. */
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !running) {
            running = true
            started = performance.now()
            raf = window.requestAnimationFrame(draw)
          } else if (!entry.isIntersecting) {
            running = false
            window.cancelAnimationFrame(raf)
          }
        })
      },
      { threshold: 0.2 },
    )
    observer.observe(canvas)
    if (staticRender) draw()

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(raf)
    }
  }, [])

  return <canvas className="pg-training-loop" ref={canvasRef} aria-hidden="true" />
}
