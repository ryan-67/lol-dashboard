import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
  /** Mono readout chips on the trailing edge (sample size, filter echo, sync). */
  meta?: ReactNode
}

/** Shared analytics page header — cream hierarchy, sparse accent, mono readouts. */
export default function PageHeader({ eyebrow, title, subtitle, actions, meta }: PageHeaderProps) {
  return (
    <header className="page-header dash-reveal">
      <div className="page-header-copy">
        {eyebrow ? <p className="page-header-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-header-title">{title}</h1>
        {subtitle ? <p className="page-header-sub">{subtitle}</p> : null}
      </div>
      {meta || actions ? (
        <div className="page-header-actions">
          {meta ? <div className="page-header-meta">{meta}</div> : null}
          {actions}
        </div>
      ) : null}
    </header>
  )
}

interface PageHeaderReadoutProps {
  label: string
  value: ReactNode
}

/** Mono chip readout for the page header meta slot. */
export function PageHeaderReadout({ label, value }: PageHeaderReadoutProps) {
  return (
    <span className="page-header-readout">
      {label} <b>{value}</b>
    </span>
  )
}
