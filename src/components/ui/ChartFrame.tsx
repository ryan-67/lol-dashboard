import { useRef, useState, type ReactNode } from 'react'
import { useGSAP } from '@gsap/react'
import { copyChartImageToClipboard } from '../../lib/chartShare'
import ClipboardToast from './ClipboardToast'
import { animateChartDraw, animateRadarDraw } from '../../theme/animations'

export type ChartFrameKind = 'series' | 'radar' | 'bars' | 'plain'

interface ChartFrameProps {
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  /** Mono readout chips on the trailing edge of the rail (n=, span, units). */
  meta?: ReactNode
  /** Interactive controls (toggles, legends) rendered under the rail. */
  controls?: ReactNode
  footer?: ReactNode
  /** Drives which draw-in the frame plays when it scrolls into view. */
  kind?: ChartFrameKind
  /** Re-run the draw when these change (filter/series swaps). */
  drawKey?: unknown
  /** Title/subtitle burned into the shared PNG. Defaults to the visible ones. */
  shareTitle?: string
  shareSubtitle?: string
  className?: string
  /** Suppress the copy-image control (composed frames, gated surfaces). */
  hideShare?: boolean
}

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

/**
 * Instrument chrome for every chart in the product.
 *
 * A hairline panel with fiducial corners, a measurement rail across the top
 * (title, subtitle, mono readouts), a tick ruler down the leading edge, and a
 * draw-in that fires once when the frame reaches the viewport. Replaces the
 * bare `ShareableChart` wrapper so charts read as instruments, not screenshots.
 */
export default function ChartFrame({
  children,
  title,
  subtitle,
  meta,
  controls,
  footer,
  kind = 'series',
  drawKey,
  shareTitle,
  shareSubtitle,
  className = '',
  hideShare = false,
}: ChartFrameProps) {
  const captureRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const [showToast, setShowToast] = useState(false)

  useGSAP(
    () => {
      if (kind === 'plain') return
      if (kind === 'radar') animateRadarDraw(plotRef.current)
      else animateChartDraw(plotRef.current)
    },
    { scope: plotRef, dependencies: [kind, drawKey] },
  )

  const handleShare = async () => {
    if (!captureRef.current) return
    try {
      await copyChartImageToClipboard(captureRef.current, {
        title: shareTitle ?? (typeof title === 'string' ? title : undefined),
        subtitle: shareSubtitle ?? (typeof subtitle === 'string' ? subtitle : undefined),
      })
      setShowToast(true)
      window.setTimeout(() => setShowToast(false), 900)
    } catch {
      // Clipboard denied or unsupported — fail silently
    }
  }

  return (
    <section className={`chart-frame chart-frame--${kind} ${className}`.trim()}>
      <span className="chart-frame-ruler" aria-hidden="true" />
      <div ref={captureRef} className="chart-frame-capture">
        {title || subtitle || meta ? (
          <header className="chart-frame-rail">
            <div className="chart-frame-heading">
              {title ? <h3 className="chart-frame-title">{title}</h3> : null}
              {subtitle ? <p className="chart-frame-subtitle">{subtitle}</p> : null}
            </div>
            {meta ? <div className="chart-frame-meta">{meta}</div> : null}
          </header>
        ) : null}

        {controls ? <div className="chart-frame-controls">{controls}</div> : null}

        <div ref={plotRef} className="chart-frame-plot">
          {children}
        </div>

        {footer ? <div className="chart-frame-footer">{footer}</div> : null}
      </div>

      {hideShare ? null : (
        <button
          type="button"
          className="chart-frame-share"
          onClick={() => void handleShare()}
          aria-label="Copy chart image"
          title="Copy chart image"
        >
          <ShareIcon />
        </button>
      )}
      <ClipboardToast visible={showToast} />
    </section>
  )
}

interface ChartReadoutProps {
  label: string
  value: ReactNode
  accent?: boolean
}

/** Mono chip for the chart rail — sample size, window, units. */
export function ChartReadout({ label, value, accent = false }: ChartReadoutProps) {
  return (
    <span className={`chart-readout${accent ? ' is-accent' : ''}`}>
      <i>{label}</i>
      <b>{value}</b>
    </span>
  )
}
