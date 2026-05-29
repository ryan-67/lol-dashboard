import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Champion, TeamChampion } from '../../hooks/useDashboardData'
import {
  championRoleBadgeColor,
  computeUniqueChampions,
  type UniqueChampionEntry,
} from '../../lib/matchupAnalytics'
import { roleLabel } from '../../lib/championAnalytics'
import { scrollEntrance } from '../../theme/animations'

interface UniqueChampionsProps {
  teamChampions: TeamChampion[]
  champions: Champion[]
  teamAName: string
  teamBName: string
}

function UniqueList({
  title,
  entries,
  emptyMessage,
}: {
  title: string
  entries: UniqueChampionEntry[]
  emptyMessage: string
}) {
  return (
    <div className="unique-champs-list card" style={{ padding: 'var(--component-gap)' }}>
      <h3 className="card-title">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-secondary text-sm">{emptyMessage}</p>
      ) : (
        <ul className="unique-champs-rows">
          {entries.map((entry) => {
            const color = championRoleBadgeColor(entry.role)
            return (
              <li key={entry.champion} className="unique-champs-row">
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
                <div className="unique-champs-row-meta text-secondary">
                  {entry.games} games · {entry.winrate.toFixed(1)}% WR
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function UniqueChampions({
  teamChampions,
  champions,
  teamAName,
  teamBName,
}: UniqueChampionsProps) {
  const sectionRef = useRef<HTMLDivElement>(null)

  const championsByName = useMemo(
    () => new Map(champions.map((c) => [c.name, c])),
    [champions],
  )

  const { teamAUnique, teamBUnique } = useMemo(
    () => computeUniqueChampions(teamChampions, teamAName, teamBName, championsByName),
    [teamChampions, teamAName, teamBName, championsByName],
  )

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [teamAName, teamBName, teamAUnique.length, teamBUnique.length] },
  )

  const emptyMsg = 'No unique champions — all picks overlap with opponent'

  return (
    <div ref={sectionRef} className="page-section">
      <h2 className="card-title">Unique Champions</h2>
      <p className="card-subtitle">Champions played by one team but not the other in this filter</p>
      <div className="overview-grid overview-grid-2">
        <UniqueList
          title={`Only played by ${teamAName}`}
          entries={teamAUnique}
          emptyMessage={emptyMsg}
        />
        <UniqueList
          title={`Only played by ${teamBName}`}
          entries={teamBUnique}
          emptyMessage={emptyMsg}
        />
      </div>
    </div>
  )
}
