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
} from '../components/teams'
import TeamMetricsTableCard from '../components/teams/TeamMetricsTableCard'
import { scrollEntranceStagger, refreshScrollTrigger } from '../theme/animations'
import PageHeader, { PageHeaderReadout } from '../components/ui/PageHeader'
import TeamPowerBoard from '../components/rankings/TeamPowerBoard'
import SectionSubnav from '../components/ui/SectionSubnav'
import { powerRegionsFromSelectedLeagues } from '../lib/powerRegionFilter'

export default function Teams() {
  const { filteredTeams, filteredPlayers, league, split, selectedLeagues } =
    useDashboard()
  const [scope, setScope] = useState<TeamScope>('top')
  const [showTable, setShowTable] = useState(true)

  const teams = useMemo(
    () =>
      filteredTeams
        .filter(isDisplayableTeam)
        .filter(isTier1Team)
        .filter((t) => t.games >= 3),
    [filteredTeams],
  )

  const powerRegions = useMemo(
    () => powerRegionsFromSelectedLeagues(selectedLeagues),
    [selectedLeagues],
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
  }, [scope, league, split, showTable])

  return (
    <div className="page-section">
      <PageHeader
        eyebrow="teams"
        title="team power & style"
        subtitle="Radar profiles and objective fingerprints across the filtered split. Multi-team compares live on Matchups."
        meta={
          <>
            <PageHeaderReadout label="teams" value={teams.length} />
            <PageHeaderReadout label="split" value={`${league} · ${split}`} />
          </>
        }
      />

      <SectionSubnav
        items={[
          { id: 'teams-rankings', label: 'rankings' },
          { id: 'teams-radar', label: 'radar' },
          { id: 'teams-tables', label: 'tables' },
        ]}
        extra={<TeamFilterBar scope={scope} onScopeChange={setScope} compact />}
      />

      <section id="teams-rankings" className="players-section">
        <TeamPowerBoard regions={powerRegions} />
      </section>

      <section id="teams-radar" className="players-section">
        {teams.length === 0 ? (
          <div className="empty-state">No teams match the current filters.</div>
        ) : (
          <div ref={radarGridRef}>
            <TeamRadarGrid teams={teams} scope={scope} allTier1Selected={allTier1Selected} />
          </div>
        )}
      </section>

      <section id="teams-tables" className="players-section">
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
      </section>
    </div>
  )
}
