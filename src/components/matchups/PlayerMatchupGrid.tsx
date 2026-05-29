import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Player } from '../../hooks/useDashboardData'
import {
  buildPositionalMatchups,
  positionLabel,
  type PositionalMatchup,
} from '../../lib/matchupAnalytics'
import { scrollEntranceStagger } from '../../theme/animations'
import MiniPlayerRadar from './MiniPlayerRadar'

interface PlayerMatchupGridProps {
  players: Player[]
  teamA: string
  teamB: string
}

function MatchupRow({ position, teamAPlayer, teamBPlayer }: PositionalMatchup) {
  const hasBoth = Boolean(teamAPlayer && teamBPlayer)

  return (
    <div className="matchup-row">
      <div className="matchup-row-player">
        {teamAPlayer ? (
          <>
            <div className="player-name">{teamAPlayer.name}</div>
            <div className="matchup-player-pill">{teamAPlayer.games} games</div>
          </>
        ) : (
          <div className="text-dim text-xs">No data</div>
        )}
      </div>

      <div className="matchup-row-center">
        <div className="matchup-row-position">{positionLabel(position)}</div>
        {hasBoth ? (
          <MiniPlayerRadar playerA={teamAPlayer!} playerB={teamBPlayer!} />
        ) : (
          <div className="mini-radar-empty text-dim text-xs">No data</div>
        )}
      </div>

      <div className="matchup-row-player align-right">
        {teamBPlayer ? (
          <>
            <div className="player-name">{teamBPlayer.name}</div>
            <div className="matchup-player-pill">{teamBPlayer.games} games</div>
          </>
        ) : (
          <div className="text-dim text-xs">No data</div>
        )}
      </div>
    </div>
  )
}

export default function PlayerMatchupGrid({ players, teamA, teamB }: PlayerMatchupGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const matchups = buildPositionalMatchups(players, teamA, teamB)

  useGSAP(
    () => {
      scrollEntranceStagger(gridRef.current, '.matchup-row')
    },
    { scope: gridRef, dependencies: [teamA, teamB, players.length] },
  )

  return (
    <div className="card page-section">
      <h2 className="card-title">Player Matchups</h2>
      <p className="card-subtitle">Role-by-role comparison with head-to-head radar (KDA, GD@15, DPM, CS@15)</p>
      <div ref={gridRef} className="matchup-player-grid">
        {matchups.map((row) => (
          <MatchupRow key={row.position} {...row} />
        ))}
      </div>
    </div>
  )
}
