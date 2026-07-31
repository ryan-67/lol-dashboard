import type { ReactNode } from 'react'
import AnimatedCounter from './AnimatedCounter'

interface KpiTileProps {
  label: string
  /** Numeric value — rendered through AnimatedCounter (counts up once on scroll). */
  value?: number
  decimals?: number
  suffix?: string
  prefix?: string
  /** Non-numeric readout (e.g. "12-4"); rendered as-is instead of a counter. */
  display?: ReactNode
  meta?: ReactNode
  /** Colors the meta line green/red for deltas. */
  trend?: 'up' | 'down'
  /** Turquoise value — reserve for model output / signal readouts. */
  accent?: boolean
  className?: string
}

/** Instrument KPI tile — fiducial corner brackets, mono readout, one-shot counter. */
export default function KpiTile({
  label,
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  display,
  meta,
  trend,
  accent = false,
  className = '',
}: KpiTileProps) {
  const valueClass = `dash-kpi-value${accent ? ' dash-kpi-value--accent' : ''}`
  return (
    <div className={`dash-kpi ${className}`.trim()}>
      <span className="dash-kpi-label">{label}</span>
      {display !== undefined ? (
        <span className={valueClass}>{display}</span>
      ) : (
        <AnimatedCounter
          className={valueClass}
          value={value ?? 0}
          decimals={decimals}
          suffix={suffix}
          prefix={prefix}
        />
      )}
      {meta ? (
        <span className={`dash-kpi-meta${trend ? (trend === 'up' ? ' is-up' : ' is-down') : ''}`}>
          {meta}
        </span>
      ) : null}
    </div>
  )
}
