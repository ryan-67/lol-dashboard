import type { CurrentFormWindow } from '../../lib/currentForm'

interface FormBadgesProps {
  form: CurrentFormWindow
  className?: string
}

/** Idle / thin-sample badges for v3 current-form surfaces. */
export default function FormBadges({ form, className = '' }: FormBadgesProps) {
  const bits = [form.label, form.thinLabel, form.idleLabel].filter(Boolean)
  if (!bits.length) return null
  return (
    <p className={`text-secondary text-sm ${className}`.trim()} aria-label="Form window">
      {bits.join(' · ')}
    </p>
  )
}
