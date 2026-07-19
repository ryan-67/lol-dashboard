import { useMemo, useState } from 'react'
import { useDashboard } from '../../context/DashboardContext'
import PowerRankingsPanel from '../rankings/PowerRankingsPanel'
import TeamPowerBoard from '../rankings/TeamPowerBoard'
import ScoreCaveat from '../ui/ScoreCaveat'
import { isTier1Team } from '../../lib/mergeSlices'
import { computeOpScores, isDisplayableChampion } from '../../lib/championAnalytics'
import { ChampionEntityInline } from '../entities'
import { formatNum, formatPct } from '../../lib/format'
import { opScoreTo100 } from '../../lib/scoreNormalize'
import { MODEL_POWER_RANKINGS_SUBTITLE, OP_SCORE_HINT } from '../../lib/metricHints'
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

function regionMatch(homeRegion: string | undefined, filter: RegionFilter): boolean {
  if (filter === 'all') return true
  const r = (homeRegion ?? '').toUpperCase()
  if (filter === 'LCS') return r === 'LCS' || r === 'LTA' || r.startsWith('LTA')
  return r === filter
}

export function PredictionTeamRankings() {
  const { filteredTeams } = useDashboard()
  const [region, setRegion] = useState<RegionFilter>('all')
  const teams = useMemo(() => {
    const tier1 = filteredTeams.filter(isTier1Team)
    if (region === 'all') return tier1
    return tier1.filter((t) => regionMatch(t.league, region))
  }, [filteredTeams, region])

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
      <TeamPowerBoard teams={teams} limit={24} />
      <p className="text-secondary text-sm mt-2">{MODEL_POWER_RANKINGS_SUBTITLE}</p>
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
        title="nucky player power"
        subtitle={MODEL_POWER_RANKINGS_SUBTITLE}
      />
      {region !== 'all' ? (
        <p className="text-secondary text-sm mt-2">
          Region chip highlights context — player power rows are global model ranks (role tabs:{' '}
          {RATING_ROLES.join(', ')}). Filter the identity dashboard for league-window form.
        </p>
      ) : null}
    </div>
  )
}

export function PredictionChampionRankings() {
  const { filteredChampions } = useDashboard()
  const [role, setRole] = useState<'all' | string>('all')

  const scored = useMemo(() => {
    const displayable = filteredChampions.filter(isDisplayableChampion)
    return computeOpScores(displayable, 1).all
  }, [filteredChampions])

  const rows = useMemo(() => {
    if (role === 'all') return scored.slice(0, 20)
    return scored.filter((e) => e.role === role).slice(0, 20)
  }, [scored, role])

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
      <section className="card">
        <h2 className="card-title">champion rankings</h2>
        <p className="card-subtitle" title={OP_SCORE_HINT}>
          OP score in the active dashboard LEAGUE/YEAR/SPLIT slice — meta form, not team/player Elo.
        </p>
        {rows.length === 0 ? (
          <p className="text-secondary text-sm">not enough champion data</p>
        ) : (
          <div className="entity-table-wrap">
            <table className="entity-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Champion</th>
                  <th>Presence</th>
                  <th>Win %</th>
                  <th>OP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry, idx) => (
                  <tr key={entry.champion.name}>
                    <td className="text-secondary">#{idx + 1}</td>
                    <td>
                      <ChampionEntityInline name={entry.champion.name} iconSize={20} />
                    </td>
                    <td className="text-secondary">{formatPct(entry.champion.presence, 1)}</td>
                    <td className="text-secondary">{formatPct(entry.champion.winrate, 1)}</td>
                    <td className="text-accent font-mono">
                      {formatNum(opScoreTo100(entry.opScore), 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
