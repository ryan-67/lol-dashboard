import { useEffect, useRef } from 'react'
import { createCursorTrail } from '../../lib/cursorTrail'
import { coarsePointer, reducedMotion } from './motion'

/** Landing register of the shared turquoise fluid trail — full gain. */
export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion() || coarsePointer()) return
    return createCursorTrail(canvas, { gain: 1 }) ?? undefined
  }, [])

  if (typeof window !== 'undefined' && (reducedMotion() || coarsePointer())) return null

  return <canvas className="cursor-trail" ref={canvasRef} aria-hidden="true" />
}
