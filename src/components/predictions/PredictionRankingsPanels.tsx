import { useMemo, useState } from 'react'
import { useDashboard } from '../../context/DashboardContext'
import PowerRankingsPanel from '../rankings/PowerRankingsPanel'
import TeamPowerBoard from '../rankings/TeamPowerBoard'
import ChampionPowerTable from '../rankings/ChampionPowerTable'
import ScoreCaveat from '../ui/ScoreCaveat'
import { type RoleFilter } from '../../lib/championAnalytics'
import {
  MODEL_POWER_RANKINGS_SUBTITLE,
  TEAM_POWER_RANKINGS_SUBTITLE,
} from '../../lib/metricHints'
import type { RatingRole } from '../../lib/loadPlayerRatings'
import { RATING_ROLES } from '../../lib/loadPlayerRatings'

type RegionFilter = 'all' | 'LCK' | 'LPL' | 'LEC' | 'LCS'

const REGION_FILTERS: { id: RegionFilter; label: string }[] = [
  { id: 'all', label: 'All regions' },
  { id: 'LCK', label: 'LCK' },
  { id: 'LPL', label: 'LPL' },
  { id: 'LEC', label: 'LEC' },
  { id: 'LCS', label: 'LCS' },
]

export function PredictionTeamRankings() {
  const [region, setRegion] = useState<RegionFilter>('all')
  const regions = region === 'all' ? ('all' as const) : ([region] as const)

  return (
    <div>
      <ScoreCaveat />
      <div className="predictions-filters" role="tablist" aria-label="Region filter">
        {REGION_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={region === item.id}
            className={`predictions-filter-btn${region === item.id ? ' is-active' : ''}`}
            onClick={() => setRegion(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <TeamPowerBoard regions={regions} limit={24} />
      <p className="text-secondary text-sm mt-2">{TEAM_POWER_RANKINGS_SUBTITLE}</p>
    </div>
  )
}

export function PredictionPlayerRankings() {
  const [role, setRole] = useState<RatingRole>('mid')
  const [region, setRegion] = useState<RegionFilter>('all')

  return (
    <div>
      <ScoreCaveat />
      <div className="predictions-filters" role="tablist" aria-label="Region filter">
        {REGION_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={region === item.id}
            className={`predictions-filter-btn${region === item.id ? ' is-active' : ''}`}
            onClick={() => setRegion(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <PowerRankingsPanel
        limit={region === 'all' ? 15 : 25}
        role={role}
        onRoleChange={setRole}
        region={region}
        title="nucky player power"
        subtitle={MODEL_POWER_RANKINGS_SUBTITLE}
      />
      {region !== 'all' ? (
        <p className="text-secondary text-sm mt-2">
          Showing {region} rows from the model board (role tabs: {RATING_ROLES.join(', ')}). LCS
          includes LTA labels when present.
        </p>
      ) : null}
    </div>
  )
}

export function PredictionChampionRankings() {
  const { filteredChampions, data } = useDashboard()
  const [role, setRole] = useState<RoleFilter>('all')

  const roles = useMemo(
    () => ['all', 'top', 'jungle', 'mid', 'adc', 'support'] as const,
    [],
  )

  return (
    <div>
      <ScoreCaveat label="about OP vs weekly standouts" />
      <div className="predictions-filters" role="tablist" aria-label="Role filter">
        {roles.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={role === r}
            className={`predictions-filter-btn${role === r ? ' is-active' : ''}`}
            onClick={() => setRole(r)}
          >
            {r}
          </button>
        ))}
      </div>
      <ChampionPowerTable
        champions={filteredChampions}
        teamChampions={data?.teamChampions ?? []}
        limit={20}
        role={role}
        title="champion rankings"
      />
    </div>
  )
}
