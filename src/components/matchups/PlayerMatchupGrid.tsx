import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Player } from '../../hooks/useDashboardData'
import PlayerRadarChart from '../players/PlayerRadarChart'
import {
  buildPositionalMatchups,
  positionLabel,
  type PositionalMatchup,
} from '../../lib/matchupAnalytics'
import { playersForRole, type RoleKey } from '../../lib/playerRadar'
import { scrollEntranceStagger } from '../../theme/animations'

interface PlayerMatchupGridProps {
  players: Player[]
  teamA: string
  teamB: string
}

function MatchupRow({
  position,
  teamAPlayer,
  teamBPlayer,
  cohort,
}: PositionalMatchup & { cohort: Player[] }) {
  return (
    <div className="matchup-radar-row">
      <div className="matchup-radar-row-header">
        <span className="matchup-row-position">{positionLabel(position)}</span>
      </div>
      <div className="matchup-radar-duo">
        <div className="matchup-radar-slot">
          {teamAPlayer ? (
            <PlayerRadarChart player={teamAPlayer} role={position} cohort={cohort} compact />
          ) : (
            <div className="matchup-radar-placeholder">No data</div>
          )}
        </div>
        <div className="matchup-radar-slot">
          {teamBPlayer ? (
            <PlayerRadarChart player={teamBPlayer} role={position} cohort={cohort} compact />
          ) : (
            <div className="matchup-radar-placeholder">No data</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PlayerMatchupGrid({ players, teamA, teamB }: PlayerMatchupGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const matchups = buildPositionalMatchups(players, teamA, teamB)

  const cohortByRole = useMemo(() => {
    const map = new Map<RoleKey, Player[]>()
    for (const role of ['top', 'jungle', 'mid', 'adc', 'support'] as RoleKey[]) {
      map.set(role, playersForRole(players, role))
    }
    return map
  }, [players])

  useGSAP(
    () => {
      scrollEntranceStagger(gridRef.current, '.matchup-radar-row')
    },
    { scope: gridRef, dependencies: [teamA, teamB, players.length] },
  )

  return (
    <div className="card page-section">
      <h2 className="card-title">Player Matchups</h2>
      <p className="card-subtitle">
        Full role radar profiles for each starter — same charts as the Players tab
      </p>
      <div ref={gridRef} className="matchup-player-grid">
        {matchups.map((row) => (
          <MatchupRow key={row.position} {...row} cohort={cohortByRole.get(row.position) ?? []} />
        ))}
      </div>
    </div>
  )
}
