import { useMemo, useState } from 'react'
import type { Player } from '../../hooks/useDashboardData'
import { resolveDefaultPlayerKey, playerKey } from '../../lib/playerAnalytics'

interface PlayerDropdownProps {
  players: Player[]
  selectedKeys: string[]
  favoritePlayerName?: string | null
  favoriteTeamName?: string | null
  onChange: (keys: string[]) => void
}

export default function PlayerDropdown({
  players,
  selectedKeys,
  favoritePlayerName,
  favoriteTeamName,
  onChange,
}: PlayerDropdownProps) {
  const [open, setOpen] = useState(false)

  const options = useMemo(
    () =>
      [...players]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({
          key: playerKey(p),
          label: `${p.name} (${p.team})`,
        })),
    [players],
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
      ? 'Select players'
      : selectedKeys.length === 1
        ? options.find((o) => o.key === selectedKeys[0])?.label ?? '1 player'
        : `${selectedKeys.length} players selected`

  return (
    <div className="player-dropdown">
      <span className="label-field">Compare players</span>
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
              onClick={() => {
                const defaultKey = resolveDefaultPlayerKey(players, favoritePlayerName, favoriteTeamName)
                onChange(defaultKey ? [defaultKey] : [])
              }}
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
