import { forwardRef, useRef, useState, type ReactNode } from 'react'
import { copyChartImageToClipboard } from '../../lib/chartShare'
import ClipboardToast from './ClipboardToast'

interface ShareableChartProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
  /** When true, skip instrument chrome (chat embeds that bring their own border). */
  bare?: boolean
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
 * Backward-compatible chart wrapper — now carries ChartFrame instrument chrome
 * (fiducials, tick ruler, share control) so every existing call site upgrades
 * without a 30-file migration.
 */
const ShareableChart = forwardRef<HTMLDivElement, ShareableChartProps>(function ShareableChart(
  { children, className = '', title, subtitle, bare = false },
  ref,
) {
  const captureRef = useRef<HTMLDivElement>(null)
  const [showToast, setShowToast] = useState(false)

  const handleShare = async () => {
    if (!captureRef.current) return
    try {
      await copyChartImageToClipboard(captureRef.current, { title, subtitle })
      setShowToast(true)
      window.setTimeout(() => setShowToast(false), 900)
    } catch {
      // Clipboard denied or unsupported — fail silently
    }
  }

  const classes = bare
    ? `shareable-chart shareable-chart--bare ${className}`.trim()
    : `chart-frame shareable-chart ${className}`.trim()

  return (
    <section ref={ref} className={classes}>
      {bare ? null : <span className="chart-frame-ruler" aria-hidden="true" />}
      <div ref={captureRef} className="chart-frame-capture shareable-chart-capture">
        {(title || subtitle) && (
          <header className="chart-frame-rail shareable-chart-export-header" aria-hidden={title || subtitle ? undefined : true}>
            <div className="chart-frame-heading">
              {title ? <h3 className="chart-frame-title shareable-chart-export-title">{title}</h3> : null}
              {subtitle ? (
                <p className="chart-frame-subtitle shareable-chart-export-subtitle">{subtitle}</p>
              ) : null}
            </div>
          </header>
        )}
        <div className="chart-frame-plot">{children}</div>
      </div>
      {bare ? null : (
        <button
          type="button"
          className="chart-frame-share chart-share-btn"
          onClick={() => void handleShare()}
          aria-label="Copy chart image"
          title="Copy chart image"
        >
          <ShareIcon />
          <span className="chart-share-btn-label sr-only">share</span>
        </button>
      )}
      <ClipboardToast visible={showToast} />
    </section>
  )
})

export default ShareableChart
