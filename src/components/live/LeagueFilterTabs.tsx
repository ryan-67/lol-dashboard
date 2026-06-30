import { LEAGUE_FILTERS } from '../../lib/live/leagues'
import type { LeagueFilter } from '../../lib/live/types'

interface LeagueFilterTabsProps {
  active: LeagueFilter
  counts?: Partial<Record<LeagueFilter, number>>
  onChange: (filter: LeagueFilter) => void
}

export default function LeagueFilterTabs({ active, counts, onChange }: LeagueFilterTabsProps) {
  return (
    <div className="role-filter-bar live-league-tabs" role="tablist" aria-label="League filter">
      {LEAGUE_FILTERS.map((filter) => {
        const count = counts?.[filter]
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={active === filter}
            className={`role-filter-btn${active === filter ? ' active' : ''}`}
            onClick={() => onChange(filter)}
          >
            {filter}
            {typeof count === 'number' && count > 0 ? (
              <span className="live-league-count">{count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
