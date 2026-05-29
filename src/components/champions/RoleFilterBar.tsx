import { ROLE_FILTER_OPTIONS, type RoleFilter } from '../../lib/championAnalytics'

interface RoleFilterBarProps {
  value: RoleFilter
  onChange: (role: RoleFilter) => void
}

export default function RoleFilterBar({ value, onChange }: RoleFilterBarProps) {
  return (
    <div className="role-filter-bar">
      {ROLE_FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`role-filter-btn${value === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
