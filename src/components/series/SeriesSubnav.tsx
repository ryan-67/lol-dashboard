export type SeriesPageTab = 'overview' | `game-${number}`

interface SeriesSubnavProps {
  gameCount: number
  active: SeriesPageTab
  onChange: (tab: SeriesPageTab) => void
}

export default function SeriesSubnav({ gameCount, active, onChange }: SeriesSubnavProps) {
  const tabs: { id: SeriesPageTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...Array.from({ length: gameCount }, (_, i) => ({
      id: `game-${i + 1}` as SeriesPageTab,
      label: `Game ${i + 1}`,
    })),
  ]

  return (
    <nav className="entity-subnav series-subnav" aria-label="Series sections">
      {tabs.map((tab) => (
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
