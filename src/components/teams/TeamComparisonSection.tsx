import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Champion, Player, Team, TeamChampion } from '../../hooks/useDashboardData'
import { teamKey } from '../../lib/teamAnalytics'
import { scrollEntrance } from '../../theme/animations'
import TeamDropdown from './TeamDropdown'
import TeamComparisonRadar from './TeamComparisonRadar'
import TeamComparisonStatsChart from './TeamComparisonStatsChart'
import TeamComparisonPriorityChamps from './TeamComparisonPriorityChamps'
import TeamComparisonSharePies from './TeamComparisonSharePies'

interface TeamComparisonSectionProps {
  teams: Team[]
  compareKeys: string[]
  onCompareChange: (keys: string[]) => void
  players: Player[]
  teamChampions: TeamChampion[]
  champions: Champion[]
}

export default function TeamComparisonSection({
  teams,
  compareKeys,
  onCompareChange,
  players,
  teamChampions,
  champions,
}: TeamComparisonSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null)

  const teamByKey = useMemo(() => {
    const map = new Map<string, Team>()
    teams.forEach((t) => map.set(teamKey(t), t))
    return map
  }, [teams])

  const compareTeams = useMemo(
    () =>
      compareKeys
        .map((k) => teamByKey.get(k))
        .filter((t): t is Team => Boolean(t)),
    [compareKeys, teamByKey],
  )

  const radarCohort = useMemo(() => {
    if (!compareTeams.length) return teams
    const leagues = new Set(compareTeams.map((t) => t.league))
    return teams.filter((t) => leagues.has(t.league))
  }, [compareTeams, teams])

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [compareTeams.length] },
  )

  return (
    <div ref={sectionRef} className="page-section team-comparison-section">
      <h2 className="card-title">Team Comparison</h2>
      <TeamDropdown teams={teams} selectedKeys={compareKeys} onChange={onCompareChange} />

      {compareTeams.length === 0 ? (
        <p className="card-subtitle">Select one or more teams to compare.</p>
      ) : (
        <>
          <TeamComparisonRadar teams={compareTeams} cohort={radarCohort} embedded />
          <TeamComparisonStatsChart teams={compareTeams} players={players} />
          <TeamComparisonPriorityChamps
            teams={compareTeams}
            teamChampions={teamChampions}
            champions={champions}
          />
          <TeamComparisonSharePies teams={compareTeams} players={players} />
        </>
      )}
    </div>
  )
}
