import type { ReactNode } from 'react'

interface EmptyStateProps {
  children: ReactNode
  /** Optional quiet hint under the main line. */
  hint?: string
  className?: string
}

/** Hatch-textured empty state with fiducial corner brackets. */
export default function EmptyState({ children, hint, className = '' }: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`.trim()} role="status">
      <p className="empty-state-line">{children}</p>
      {hint ? <p className="empty-state-hint">{hint}</p> : null}
    </div>
  )
}
