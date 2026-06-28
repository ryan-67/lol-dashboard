export interface SegmentOption<T extends string> {
  value: T
  label: string
}

interface SegmentFilterBarProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  ariaLabel?: string
}

export default function SegmentFilterBar<T extends string>({
  value,
  onChange,
  options,
  ariaLabel = 'Filter options',
}: SegmentFilterBarProps<T>) {
  return (
    <div className="role-filter-bar" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          className={`role-filter-btn${value === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
