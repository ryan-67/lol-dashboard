export type TeamPageTab = 'stats' | 'schedule' | 'gold'

const TABS: { id: TeamPageTab; label: string }[] = [
  { id: 'stats', label: 'Stats' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'gold', label: 'Gold Graph' },
]

interface TeamSubnavProps {
  active: TeamPageTab
  onChange: (tab: TeamPageTab) => void
}

export default function TeamSubnav({ active, onChange }: TeamSubnavProps) {
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
