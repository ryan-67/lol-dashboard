import { useEffect, useRef } from 'react'

/**
 * Persistent AI/stats ambient layer with cursor-reactive grid/hex cells
 * (React Bits Dot Grid + hexagon bg ideas, brand-adapted, no Club plugins).
 */
export default function AmbientBackground() {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1
    const pointer = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4, px: 0, py: 0 }
    const nodes: { x: number; y: number; r: number; phase: number; speed: number }[] = []
    const sparks: { x: number; y: number; pts: number[]; phase: number }[] = []
    type Cell = { x: number; y: number; hex: boolean; boost: number }
    let cells: Cell[] = []

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = Math.max(window.innerHeight, root.offsetHeight || window.innerHeight)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      nodes.length = 0
      const count = Math.min(36, Math.floor((w * h) / 42000))
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random(),
          y: Math.random(),
          r: 1 + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2,
          speed: 0.15 + Math.random() * 0.35,
        })
      }

      sparks.length = 0
      const sparkCount = Math.min(7, Math.floor(w / 240))
      for (let i = 0; i < sparkCount; i++) {
        const pts: number[] = []
        let v = 0.4 + Math.random() * 0.3
        for (let j = 0; j < 14; j++) {
          v += (Math.random() - 0.5) * 0.22
          v = Math.max(0.12, Math.min(0.88, v))
          pts.push(v)
        }
        sparks.push({
          x: 0.08 + Math.random() * 0.84,
          y: 0.12 + Math.random() * 0.7,
          pts,
          phase: Math.random() * Math.PI * 2,
        })
      }

      cells = []
      const gap = 42
      const cols = Math.ceil(w / gap) + 1
      const rows = Math.ceil(h / gap) + 1
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const offset = row % 2 === 0 ? 0 : gap * 0.5
          cells.push({
            x: col * gap + offset,
            y: row * gap,
            hex: (col + row) % 3 === 0,
            boost: 0,
          })
        }
      }
    }

    const onMove = (e: PointerEvent) => {
      pointer.tx = e.clientX / Math.max(w, 1)
      pointer.ty = e.clientY / Math.max(h, 1)
      pointer.px = e.clientX
      pointer.py = e.clientY
    }

    const drawHex = (cx: number, cy: number, r: number) => {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }

    const draw = (t: number) => {
      pointer.x += (pointer.tx - pointer.x) * 0.05
      pointer.y += (pointer.ty - pointer.y) * 0.05

      const px = (pointer.x - 0.5) * 18
      const py = (pointer.y - 0.5) * 12
      const curX = pointer.px || pointer.x * w
      const curY = pointer.py || pointer.y * h

      ctx.clearRect(0, 0, w, h)

      const wash = ctx.createRadialGradient(
        w * (0.55 + pointer.x * 0.08),
        h * (0.25 + pointer.y * 0.05),
        40,
        w * 0.5,
        h * 0.4,
        Math.max(w, h) * 0.75,
      )
      wash.addColorStop(0, 'rgba(87, 196, 207, 0.055)')
      wash.addColorStop(0.45, 'rgba(87, 196, 207, 0.02)')
      wash.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = wash
      ctx.fillRect(0, 0, w, h)

      // Base grid
      const grid = 56
      const ox = px * 0.35
      const oy = py * 0.35
      ctx.strokeStyle = 'rgba(216, 212, 200, 0.04)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = ((ox % grid) + grid) % grid; x < w; x += grid) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let y = ((oy % grid) + grid) % grid; y < h; y += grid) {
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.stroke()

      // Cursor-reactive dots / hexes
      const prox = 140
      for (const cell of cells) {
        const dx = cell.x + px * 0.2 - curX
        const dy = cell.y + py * 0.2 - curY
        const d = Math.hypot(dx, dy)
        const target = d < prox ? 1 - d / prox : 0
        cell.boost += (target - cell.boost) * (reduce ? 1 : 0.12)
        if (cell.boost < 0.02) continue

        const a = 0.08 + cell.boost * 0.55
        if (cell.hex) {
          ctx.strokeStyle = `rgba(87, 196, 207, ${a * 0.85})`
          ctx.lineWidth = 1
          drawHex(cell.x + px * 0.2, cell.y + py * 0.2, 7 + cell.boost * 3)
          ctx.stroke()
        } else {
          ctx.fillStyle = `rgba(87, 196, 207, ${a})`
          ctx.beginPath()
          ctx.arc(cell.x + px * 0.2, cell.y + py * 0.2, 1.2 + cell.boost * 2.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      for (const s of sparks) {
        const sx = s.x * w + px * 0.6
        const sy = s.y * h + py * 0.5
        const sw = 72
        const sh = 22
        const pulse = reduce ? 0 : Math.sin(t * 0.0012 + s.phase) * 0.08
        ctx.strokeStyle = `rgba(87, 196, 207, ${0.12 + pulse})`
        ctx.lineWidth = 1.25
        ctx.beginPath()
        s.pts.forEach((v, i) => {
          const x = sx + (i / (s.pts.length - 1)) * sw
          const y = sy + (1 - v) * sh
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.stroke()
      }

      const pts = nodes.map((n) => {
        const drift = reduce ? 0 : Math.sin(t * 0.0004 * n.speed + n.phase) * 0.012
        return {
          x: n.x * w + px * (0.4 + n.r * 0.1) + drift * w,
          y: n.y * h + py * (0.35 + n.r * 0.08),
          r: n.r,
          a: reduce ? 0.3 : 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.001 * n.speed + n.phase)),
        }
      })

      ctx.lineWidth = 1
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]
          const b = pts[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist < 130) {
            ctx.strokeStyle = `rgba(87, 196, 207, ${0.045 * (1 - dist / 130)})`
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const p of pts) {
        ctx.fillStyle = `rgba(87, 196, 207, ${p.a})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = 'rgba(216, 212, 200, 0.035)'
      ctx.font = '11px "Noto Sans Mono", monospace'
      ;['Σ', 'μ', 'P(w)', 'Δelo', 'z', 'σ'].forEach((g, i) => {
        const gx = ((i * 0.17 + 0.1) % 1) * w + px * 0.2
        const gy = ((i * 0.23 + 0.2) % 1) * h + py * 0.15
        ctx.fillText(g, gx, gy)
      })

      if (!reduce) raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    if (!reduce) {
      window.addEventListener('pointermove', onMove, { passive: true })
      raf = requestAnimationFrame(draw)
    } else {
      draw(0)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div className="landing-ambient" ref={rootRef} aria-hidden="true">
      <canvas ref={canvasRef} className="landing-ambient-canvas" />
      <div className="landing-ambient-wash" />
    </div>
  )
}
