import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Champion, Team, TeamChampion } from '../../hooks/useDashboardData'
import { computeTeamPriorityChamps } from '../../lib/matchupAnalytics'
import { teamKey } from '../../lib/teamAnalytics'
import { scrollEntranceStagger } from '../../theme/animations'
import { ChampionEntityInline } from '../entities'
import TeamComparisonTeamLabel from './TeamComparisonTeamLabel'
import ShareableChart from '../ui/ShareableChart'

interface TeamComparisonPriorityChampsProps {
  teams: Team[]
  teamChampions: TeamChampion[]
  champions: Champion[]
}

export default function TeamComparisonPriorityChamps({
  teams,
  teamChampions,
  champions,
}: TeamComparisonPriorityChampsProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const championsByName = useMemo(
    () => new Map(champions.map((c) => [c.name, c])),
    [champions],
  )

  const byTeam = useMemo(
    () =>
      teams.map((team) => ({
        team,
        entries: computeTeamPriorityChamps(
          teamChampions,
          teams,
          team.name,
          championsByName,
          3,
        ),
      })),
    [teams, teamChampions, championsByName],
  )

  useGSAP(
    () => {
      scrollEntranceStagger(gridRef.current, '.team-priority-card')
    },
    { scope: gridRef, dependencies: [teams.map((t) => teamKey(t)).join(',')] },
  )

  return (
    <div className="page-section">
      <h3 className="card-title">Highest Priority Champions</h3>
      <p className="card-subtitle">Top 3 draft priorities by pick rate and slot</p>
      <div ref={gridRef} className="overview-grid overview-grid-2">
        {byTeam.map(({ team, entries }) => (
          <ShareableChart key={teamKey(team)} className="card team-priority-card">
            <TeamComparisonTeamLabel team={team} as="heading" />
            {entries.length === 0 ? (
              <p className="text-secondary text-sm">Not enough pick data</p>
            ) : (
              <ul className="team-priority-champ-list">
                {entries.map((entry, index) => (
                  <li key={entry.champion} className="team-priority-champ-row">
                    <span className="text-tertiary">#{index + 1}</span>
                    <ChampionEntityInline name={entry.champion} iconSize={20} />
                    <span className="text-accent">{entry.pickRate.toFixed(1)}% pick</span>
                  </li>
                ))}
              </ul>
            )}
          </ShareableChart>
        ))}
      </div>
    </div>
  )
}
