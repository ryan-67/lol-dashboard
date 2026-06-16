import { forwardRef, useRef, useState, type ReactNode } from 'react'
import { copyChartImageToClipboard } from '../../lib/chartShare'
import ClipboardToast from './ClipboardToast'

interface ShareableChartProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

const ShareableChart = forwardRef<HTMLDivElement, ShareableChartProps>(function ShareableChart(
  { children, className = '', title, subtitle },
  ref,
) {
  const captureRef = useRef<HTMLDivElement>(null)
  const [showToast, setShowToast] = useState(false)

  async function handleShare() {
    if (!captureRef.current) return
    try {
      await copyChartImageToClipboard(captureRef.current, { title, subtitle })
      setShowToast(true)
      window.setTimeout(() => setShowToast(false), 500)
    } catch {
      // Clipboard denied or unsupported — fail silently
    }
  }

  return (
    <div ref={ref} className={`shareable-chart ${className}`.trim()}>
      <div ref={captureRef} className="shareable-chart-capture">
        {(title || subtitle) && (
          <div className="shareable-chart-export-header" aria-hidden="true">
            {title ? <div className="shareable-chart-export-title">{title}</div> : null}
            {subtitle ? <div className="shareable-chart-export-subtitle">{subtitle}</div> : null}
          </div>
        )}
        {children}
      </div>
      <button
        type="button"
        className="chart-share-btn"
        onClick={() => void handleShare()}
        aria-label="Share chart"
        title="Share chart"
      >
        <ShareIcon />
        <span className="chart-share-btn-label">share</span>
      </button>
      <ClipboardToast visible={showToast} />
    </div>
  )
})

export default ShareableChart
