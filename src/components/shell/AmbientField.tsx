import { useEffect, useRef } from 'react'

/**
 * Carrier layer — the shell's "powered on" hum.
 *
 * A slow-drifting turquoise measurement grid with a scan band travelling down
 * it and occasional signal blips firing on the intersections. Sits behind every
 * surface at very low alpha: you should never catch yourself watching it, but
 * a still screenshot and a live screen should not look like the same thing.
 *
 * Throttled to ~30fps, pauses when the tab is hidden, absent under
 * prefers-reduced-motion.
 */

const CELL = 46
const FRAME_MS = 1000 / 30
const BLIP_LIFETIME = 2600
const MAX_BLIPS = 5

interface Blip {
  x: number
  y: number
  born: number
}

export default function AmbientField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(canvas)
    window.addEventListener('resize', resize)

    const blips: Blip[] = []
    let raf = 0
    let last = 0
    let nextBlip = 900

    const spawnBlip = (now: number) => {
      if (blips.length >= MAX_BLIPS || !width || !height) return
      blips.push({
        x: Math.round((Math.random() * width) / CELL) * CELL,
        y: Math.round((Math.random() * height) / CELL) * CELL,
        born: now,
      })
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < FRAME_MS) return
      last = now

      if (document.hidden || !width || !height) return

      ctx.clearRect(0, 0, width, height)

      const t = now / 1000
      // Grid drifts diagonally, one cell every ~24s — slow enough to feel like drift.
      const offsetX = (t * 1.9) % CELL
      const offsetY = (t * 1.1) % CELL

      ctx.lineWidth = 1
      // Felt, not invisible — carrier layer must read in a 10s glance.
      ctx.strokeStyle = 'rgba(87, 196, 207, 0.11)'
      ctx.beginPath()
      for (let x = -CELL + offsetX; x < width + CELL; x += CELL) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, height)
      }
      for (let y = -CELL + offsetY; y < height + CELL; y += CELL) {
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(width, Math.round(y) + 0.5)
      }
      ctx.stroke()

      // Scan band: a soft horizontal wash sweeping top to bottom every 14s.
      const bandY = ((t % 14) / 14) * (height + 320) - 160
      const band = ctx.createLinearGradient(0, bandY - 160, 0, bandY + 160)
      band.addColorStop(0, 'rgba(87, 196, 207, 0)')
      band.addColorStop(0.5, 'rgba(87, 196, 207, 0.09)')
      band.addColorStop(1, 'rgba(87, 196, 207, 0)')
      ctx.fillStyle = band
      ctx.fillRect(0, bandY - 160, width, 320)

      if (now > nextBlip) {
        spawnBlip(now)
        nextBlip = now + 1400 + Math.random() * 2600
      }

      for (let i = blips.length - 1; i >= 0; i -= 1) {
        const blip = blips[i]
        const age = (now - blip.born) / BLIP_LIFETIME
        if (age >= 1) {
          blips.splice(i, 1)
          continue
        }
        // Rise, hold, fall — reads as a reading being taken, not a twinkle.
        const life = Math.sin(age * Math.PI)
        const radius = 2 + life * 16
        const glow = ctx.createRadialGradient(blip.x, blip.y, 0, blip.x, blip.y, radius)
        glow.addColorStop(0, `rgba(120, 224, 232, ${0.28 * life})`)
        glow.addColorStop(1, 'rgba(120, 224, 232, 0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(blip.x, blip.y, radius, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `rgba(160, 236, 242, ${0.62 * life})`
        ctx.fillRect(blip.x - 1.5, blip.y - 1.5, 3, 3)
      }
    }

    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="ambient-field" aria-hidden="true" />
}
