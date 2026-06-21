import { useMemo, useState } from 'react'
import type { Team } from '../../hooks/useDashboardData'
import { teamKey } from '../../lib/teamAnalytics'

interface TeamDropdownProps {
  teams: Team[]
  selectedKeys: string[]
  onChange: (keys: string[]) => void
}

export default function TeamDropdown({ teams, selectedKeys, onChange }: TeamDropdownProps) {
  const [open, setOpen] = useState(false)

  const options = useMemo(
    () =>
      [...teams]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({
          key: teamKey(t),
          label: `${t.name} (${t.league})`,
        })),
    [teams],
  )

  const toggle = (key: string) => {
    if (selectedKeys.includes(key)) {
      onChange(selectedKeys.filter((k) => k !== key))
    } else {
      onChange([...selectedKeys, key])
    }
  }

  const label =
    selectedKeys.length === 0
      ? 'Select teams'
      : selectedKeys.length === 1
        ? options.find((o) => o.key === selectedKeys[0])?.label ?? '1 team'
        : `${selectedKeys.length} teams selected`

  return (
    <div className="player-dropdown">
      <span className="label-field">Team comparison</span>
      <button
        type="button"
        className="player-dropdown-trigger btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className="player-dropdown-panel card">
          <div className="player-dropdown-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onChange(options.map((o) => o.key))}
            >
              Select all
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onChange([])}>
              Clear
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onChange([])}
            >
              Reset
            </button>
          </div>
          <div className="player-dropdown-scroll" data-lenis-prevent>
            <ul className="player-dropdown-list">
              {options.map((option) => (
                <li key={option.key}>
                  <label className="player-dropdown-option">
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(option.key)}
                      onChange={() => toggle(option.key)}
                    />
                    <span>{option.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
