export type TournamentPageTab = 'overview' | 'players' | 'teams' | 'champions'

const TABS: { id: TournamentPageTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'players', label: 'Players' },
  { id: 'teams', label: 'Teams' },
  { id: 'champions', label: 'Champions' },
]

interface TournamentSubnavProps {
  active: TournamentPageTab
  onChange: (tab: TournamentPageTab) => void
}

export default function TournamentSubnav({ active, onChange }: TournamentSubnavProps) {
  return (
    <nav className="entity-subnav tournament-subnav" aria-label="Tournament sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`entity-subnav-tab${active === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
