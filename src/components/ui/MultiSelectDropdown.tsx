import { useEffect, useId, useRef, useState } from 'react'

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      className={`select-chevron${open ? ' select-chevron-open' : ''}`}
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

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectDropdownProps {
  label: string
  displayValue: string
  options: MultiSelectOption[]
  selected: string[]
  onToggle: (value: string) => void
  minWidth?: number
  className?: string
  /** Virtual option that is active when all underlying values are selected (e.g. All Tier 1). */
  allValue?: string
  isAllSelected?: boolean
}

export default function MultiSelectDropdown({
  label,
  displayValue,
  options,
  selected,
  onToggle,
  minWidth = 140,
  className = '',
  allValue,
  isAllSelected = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div
      ref={rootRef}
      className={`select-wrap multi-select-wrap ${className}`.trim()}
      style={{ minWidth }}
    >
      <button
        type="button"
        className="multi-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="multi-select-value">{displayValue}</span>
      </button>
      <ChevronDown open={open} />
      {open ? (
        <ul id={listId} className="multi-select-menu" role="listbox" aria-label={label}>
          {options.map((opt) => {
            const active =
              allValue && opt.value === allValue && isAllSelected
                ? true
                : selected.includes(opt.value)
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`multi-select-option${active ? ' multi-select-option-active' : ''}`}
                  onClick={() => onToggle(opt.value)}
                >
                  <span className="multi-select-check" aria-hidden="true">
                    {active ? '✓' : ''}
                  </span>
                  <span>{opt.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
