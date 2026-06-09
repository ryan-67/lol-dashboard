import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Champion, Team, TeamChampion } from '../../hooks/useDashboardData'
import {
  championRoleBadgeColor,
  computeHighestPriorityChamps,
  type PriorityChampionEntry,
} from '../../lib/matchupAnalytics'
import { roleLabel } from '../../lib/championAnalytics'
import { scrollEntrance } from '../../theme/animations'

interface HighestPriorityChampsProps {
  teamChampions: TeamChampion[]
  teams: Team[]
  champions: Champion[]
  teamAName: string
  teamBName: string
}

function PriorityTable({
  title,
  entries,
}: {
  title: string
  entries: PriorityChampionEntry[]
}) {
  return (
    <div className="unique-champs-list card" style={{ padding: 'var(--component-gap)' }}>
      <h3 className="card-title">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-secondary text-sm">Not enough pick data for this filter</p>
      ) : (
        <div className="priority-champs-table-wrap">
          <table className="priority-champs-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Champion</th>
                <th>Pick%</th>
                <th>Slot</th>
                <th>Score</th>
                <th>WR</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const color = championRoleBadgeColor(entry.role)
                return (
                  <tr key={entry.champion}>
                    <td className="text-tertiary">{index + 1}</td>
                    <td>
                      <div className="unique-champs-row-main">
                        <span className="font-medium">{entry.champion}</span>
                        {entry.role ? (
                          <span
                            className="role-badge"
                            style={{ color, borderColor: color }}
                          >
                            {roleLabel(entry.role)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>{entry.pickRate.toFixed(1)}%</td>
                    <td>{entry.avgPickOrder != null ? entry.avgPickOrder.toFixed(1) : '—'}</td>
                    <td className="text-accent">{entry.priorityScore.toFixed(1)}</td>
                    <td>{entry.winrate.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function HighestPriorityChamps({
  teamChampions,
  teams,
  champions,
  teamAName,
  teamBName,
}: HighestPriorityChampsProps) {
  const sectionRef = useRef<HTMLDivElement>(null)

  const championsByName = useMemo(
    () => new Map(champions.map((c) => [c.name, c])),
    [champions],
  )

  const { teamA, teamB } = useMemo(
    () =>
      computeHighestPriorityChamps(
        teamChampions,
        teams,
        teamAName,
        teamBName,
        championsByName,
      ),
    [teamChampions, teams, teamAName, teamBName, championsByName],
  )

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [teamAName, teamBName, teamA.length, teamB.length] },
  )

  return (
    <div ref={sectionRef} className="page-section">
      <h2 className="card-title">Highest Priority Champs</h2>
      <p className="card-subtitle">
        Draft priority from pick rate and average pick slot (1 = first pick). Score blends both
        signals.
      </p>
      <div className="overview-grid overview-grid-2">
        <PriorityTable title={teamAName} entries={teamA} />
        <PriorityTable title={teamBName} entries={teamB} />
      </div>
    </div>
  )
}
