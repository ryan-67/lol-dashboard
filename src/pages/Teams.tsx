import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { useDashboard } from '../context/DashboardContext'
import {
  isDisplayableTeam,
  type TeamScope,
} from '../lib/teamAnalytics'
import { isTier1Team } from '../lib/mergeSlices'
import {
  TeamFilterBar,
  TeamRadarGrid,
  TeamComparisonSection,
} from '../components/teams'
import TeamMetricsTableCard from '../components/teams/TeamMetricsTableCard'
import { scrollEntranceStagger, refreshScrollTrigger } from '../theme/animations'

export default function Teams() {
  const { filteredTeams, filteredPlayers, filteredChampions, data, league, split } =
    useDashboard()
  const [scope, setScope] = useState<TeamScope>('top')
  const [compareKeys, setCompareKeys] = useState<string[]>([])
  const [showTable, setShowTable] = useState(false)

  const teams = useMemo(
    () => filteredTeams.filter(isDisplayableTeam).filter(isTier1Team),
    [filteredTeams],
  )

  const allTier1Selected = league === 'All Tier 1'

  const radarGridRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      scrollEntranceStagger(radarGridRef.current, '.radar-card')
    },
    { scope: radarGridRef, dependencies: [scope, league, split, teams.length] },
  )

  useEffect(() => {
    requestAnimationFrame(() => refreshScrollTrigger())
  }, [scope, league, split, showTable, compareKeys.length])

  return (
    <div className="page-section">
      <TeamFilterBar scope={scope} onScopeChange={setScope} />

      {teams.length === 0 ? (
        <div className="empty-state">No teams match the current filters.</div>
      ) : (
        <div ref={radarGridRef}>
          <TeamRadarGrid teams={teams} scope={scope} allTier1Selected={allTier1Selected} />
        </div>
      )}

      <TeamComparisonSection
        teams={teams}
        compareKeys={compareKeys}
        onCompareChange={setCompareKeys}
        players={filteredPlayers}
        teamChampions={data?.teamChampions ?? []}
        champions={filteredChampions}
      />

      <div className="players-table-toggle">
        <button type="button" className="btn" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Hide Tables' : 'Show Tables'}
        </button>
      </div>

      {showTable && (
        <TeamMetricsTableCard
          teams={teams}
          players={filteredPlayers}
          subtitle="All teams in the current league, year, and split filter."
        />
      )}
    </div>
  )
}
