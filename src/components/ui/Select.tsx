import type { SelectHTMLAttributes } from 'react'

function ChevronDown() {
  return (
    <svg
      className="select-chevron"
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      aria-hidden="true"
    >
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
}

export default function Select({ label, id, className = '', ...props }: SelectProps) {
  const selectId = id ?? label.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className={`select-wrap ${className}`.trim()}>
      <label htmlFor={selectId} className="label-field sr-only">
        {label}
      </label>
      <select id={selectId} aria-label={label} {...props} />
      <ChevronDown />
    </div>
  )
}
