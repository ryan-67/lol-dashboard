import { useEffect, useMemo, useRef, useState } from 'react'
import type { Team } from '../../hooks/useDashboardData'
import { teamKey } from '../../lib/teamAnalytics'

interface TeamComparePickerProps {
  teams: Team[]
  selectedKeys: string[]
  onChange: (keys: string[]) => void
}

export default function TeamComparePicker({ teams, selectedKeys, onChange }: TeamComparePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const options = useMemo(
    () =>
      [...teams]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({
          key: teamKey(t),
          label: `${t.name} (${t.league}) — ${t.winrate.toFixed(1)}% WR`,
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
      ? 'Select teams to compare'
      : selectedKeys.length === 1
        ? options.find((o) => o.key === selectedKeys[0])?.label ?? '1 team'
        : `${selectedKeys.length} teams selected`

  return (
    <div className="team-compare-picker" ref={containerRef}>
      <label className="label-field">Compare Teams</label>
      <button
        type="button"
        className="team-compare-picker-trigger btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className="team-compare-picker-panel card">
          <div className="team-compare-picker-actions">
            <button type="button" className="btn btn-ghost" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
          <div className="team-compare-picker-scroll" data-lenis-prevent>
            <ul className="team-compare-picker-list">
              {options.map((option) => {
                const selected = selectedKeys.includes(option.key)
                return (
                  <li key={option.key}>
                    <button
                      type="button"
                      className={`team-compare-picker-option${selected ? ' is-selected' : ''}`}
                      onClick={() => toggle(option.key)}
                      aria-pressed={selected}
                    >
                      {option.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
