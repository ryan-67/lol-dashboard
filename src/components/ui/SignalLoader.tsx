interface SignalLoaderProps {
  label?: string
  compact?: boolean
  className?: string
}

/**
 * Branded orbit/dots loader for cold dashboard loads (10–15s).
 * Respects prefers-reduced-motion via CSS.
 */
export default function SignalLoader({
  label = 'loading signal…',
  compact = false,
  className = '',
}: SignalLoaderProps) {
  return (
    <div
      className={`signal-loader${compact ? ' signal-loader--compact' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="signal-loader-orbit" aria-hidden="true">
        <span className="signal-loader-core" />
        <span className="signal-loader-dot" style={{ ['--i' as string]: 0 }} />
        <span className="signal-loader-dot" style={{ ['--i' as string]: 1 }} />
        <span className="signal-loader-dot" style={{ ['--i' as string]: 2 }} />
        <span className="signal-loader-dot" style={{ ['--i' as string]: 3 }} />
        <span className="signal-loader-dot" style={{ ['--i' as string]: 4 }} />
        <span className="signal-loader-dot" style={{ ['--i' as string]: 5 }} />
      </div>
      {label ? <p className="signal-loader-label">{label}</p> : null}
    </div>
  )
}
