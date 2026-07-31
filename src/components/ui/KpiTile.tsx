import { useMemo, useRef, type ReactNode } from 'react'
import { useGSAP } from '@gsap/react'
import AnimatedCounter from './AnimatedCounter'
import { animateMeterFill, animateStrokeDraw } from '../../theme/animations'

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
  /**
   * 0–1 fill for the baseline meter under the readout. Omit to hide the meter.
   * Use for values that have a natural ceiling (rates, shares, scores /100).
   */
  gauge?: number
  /** Sparkline series — drawn as a hairline trace behind the readout. */
  spark?: number[]
  className?: string
}

const SPARK_W = 96
const SPARK_H = 26

function sparkPath(values: number[]): string | null {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * SPARK_W
      const y = SPARK_H - ((v - min) / span) * SPARK_H
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/**
 * Instrument readout tile.
 *
 * Tick ruler above the label, mono value with a one-shot count-up, an optional
 * baseline meter that grows on reveal, and an optional hairline sparkline
 * sitting behind the number as context rather than decoration.
 */
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
  gauge,
  spark,
  className = '',
}: KpiTileProps) {
  const tileRef = useRef<HTMLDivElement>(null)
  const valueClass = `dash-kpi-value${accent ? ' dash-kpi-value--accent' : ''}`
  const path = useMemo(() => (spark ? sparkPath(spark) : null), [spark])
  const clampedGauge = gauge === undefined ? undefined : Math.max(0, Math.min(1, gauge))

  useGSAP(
    () => {
      animateMeterFill(tileRef.current, '.dash-kpi-gauge i')
      animateStrokeDraw(tileRef.current, '.dash-kpi-spark path', 0.9)
    },
    { scope: tileRef, dependencies: [clampedGauge, path] },
  )

  return (
    <div ref={tileRef} className={`dash-kpi ${className}`.trim()} data-reveal>
      <span className="dash-kpi-ticks" aria-hidden="true" />

      {path ? (
        <svg
          className="dash-kpi-spark"
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={path} />
        </svg>
      ) : null}

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

      {clampedGauge !== undefined ? (
        <span className="dash-kpi-gauge" aria-hidden="true">
          <i style={{ ['--fill' as string]: clampedGauge }} />
        </span>
      ) : null}

      {meta ? (
        <span className={`dash-kpi-meta${trend ? (trend === 'up' ? ' is-up' : ' is-down') : ''}`}>
          {trend ? <span className="dash-kpi-trend" aria-hidden="true" /> : null}
          {meta}
        </span>
      ) : null}
    </div>
  )
}
