import { useEffect, useRef, useState } from 'react'
import { createCursorTrail } from '../../lib/cursorTrail'
import { ambientTrailSupported } from '../../lib/ambientTrail'

/**
 * Product register of the shared turquoise fluid trail.
 *
 * Same shader and same hand as the landing, slightly lower gain so it reads as
 * ambient rather than hero. It ducks out of the way whenever the pointer is
 * actually working — dragging a slider, brushing a chart, scrubbing a dense
 * table — and fades back in once the surface goes idle.
 */

const QUIET_SELECTOR = '[data-trail-quiet], .table-wrap, .recharts-wrapper, input[type="range"]'
const RESTORE_DELAY = 420

export default function AppCursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !ambientTrailSupported()) return
    return createCursorTrail(canvas, { gain: 0.86 }) ?? undefined
  }, [])

  useEffect(() => {
    if (!ambientTrailSupported()) return

    let restoreTimer = 0
    let dragging = false
    let overQuiet = false

    const apply = () => {
      window.clearTimeout(restoreTimer)
      if (dragging || overQuiet) {
        setMuted(true)
        return
      }
      restoreTimer = window.setTimeout(() => setMuted(false), RESTORE_DELAY)
    }

    const handleDown = () => {
      dragging = true
      apply()
    }
    const handleUp = () => {
      dragging = false
      apply()
    }
    const handleMove = (event: PointerEvent) => {
      const target = event.target
      const next = target instanceof Element ? Boolean(target.closest(QUIET_SELECTOR)) : false
      if (next === overQuiet) return
      overQuiet = next
      apply()
    }

    window.addEventListener('pointerdown', handleDown, { passive: true })
    window.addEventListener('pointerup', handleUp, { passive: true })
    window.addEventListener('pointercancel', handleUp, { passive: true })
    window.addEventListener('pointermove', handleMove, { passive: true })

    return () => {
      window.clearTimeout(restoreTimer)
      window.removeEventListener('pointerdown', handleDown)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
      window.removeEventListener('pointermove', handleMove)
    }
  }, [])

  if (typeof window !== 'undefined' && !ambientTrailSupported()) return null

  return (
    <canvas
      className={`app-cursor-trail${muted ? ' is-muted' : ''}`}
      ref={canvasRef}
      aria-hidden="true"
    />
  )
}
