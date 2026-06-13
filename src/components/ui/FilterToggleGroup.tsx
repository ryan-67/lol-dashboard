interface FilterToggleOption {
  value: string
  label: string
}

interface FilterToggleGroupProps {
  label: string
  options: FilterToggleOption[]
  selected: string[]
  onToggle: (value: string) => void
  /** When all of these values are selected, highlight this option too (e.g. All Tier 1). */
  allValue?: string
  isAllSelected?: boolean
}

export default function FilterToggleGroup({
  label,
  options,
  selected,
  onToggle,
  allValue,
  isAllSelected,
}: FilterToggleGroupProps) {
  return (
    <div className="filter-toggle-group">
      <span className="label-field">{label}</span>
      <div className="filter-toggle-row" role="group" aria-label={label}>
        {options.map((opt) => {
          const active =
            opt.value === allValue && isAllSelected
              ? true
              : selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              className={`filter-toggle${active ? ' filter-toggle-active' : ''}`}
              aria-pressed={active}
              onClick={() => onToggle(opt.value)}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
