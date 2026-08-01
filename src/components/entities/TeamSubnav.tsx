import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export type TeamPageTab = 'stats' | 'schedule' | 'gold'

const TABS: { id: TeamPageTab; label: string }[] = [
  { id: 'stats', label: 'Now' },
  { id: 'schedule', label: 'Next' },
  { id: 'gold', label: 'Gold' },
]

interface TeamSubnavProps {
  active: TeamPageTab
  onChange: (tab: TeamPageTab) => void
}

function TeamSubnavBar({ active, onChange }: TeamSubnavProps) {
  return (
    <nav className="entity-subnav" aria-label="Team page sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`entity-subnav-tab${active === tab.id ? ' entity-subnav-tab-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

export default function TeamSubnav({ active, onChange }: TeamSubnavProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setSlot(document.getElementById('entity-tab-slot'))
  }, [])

  const bar = <TeamSubnavBar active={active} onChange={onChange} />
  if (slot) return createPortal(bar, slot)
  return bar
}
