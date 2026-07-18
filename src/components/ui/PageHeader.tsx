import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
}

/** Shared analytics page header — cream hierarchy, sparse accent. */
export default function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="page-header dash-reveal">
      <div className="page-header-copy">
        {eyebrow ? <p className="page-header-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-header-title">{title}</h1>
        {subtitle ? <p className="page-header-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  )
}
