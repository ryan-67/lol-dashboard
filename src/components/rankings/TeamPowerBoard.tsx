import { useMemo } from 'react'
import type { Player, Team } from '../../hooks/useDashboardData'
import { computeTeamScore } from '../../lib/teamAnalytics'
import { EntityLink, TeamLogo } from '../entities'
import { formatNum, formatPct } from '../../lib/format'

interface TeamPowerBoardProps {
  teams: Team[]
  players?: Player[]
  limit?: number
}

/** Split-local team scoreboard from OE team metrics (complement to player power model). */
export default function TeamPowerBoard({ teams, players = [], limit = 8 }: TeamPowerBoardProps) {
  const ranked = useMemo(() => {
    return [...teams]
      .map((team) => ({
        team,
        score: computeTeamScore(team, teams, players),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }, [teams, players, limit])

  if (!ranked.length) return null

  return (
    <section className="card power-rankings-panel">
      <div className="power-rankings-head">
        <div>
          <h2 className="card-title">team scoreboard</h2>
          <p className="card-subtitle mb-0">
            Current-filter team scores (winrate, objectives, early game, vision) — local to your
            league/split selection.
          </p>
        </div>
      </div>
      <ol className="power-rankings-list">
        {ranked.map(({ team, score }, idx) => (
          <li key={`${team.name}-${team.league}`} className="power-rankings-row">
            <span className="power-rankings-rank">#{idx + 1}</span>
            <span className="power-rankings-player">
              <span className="entity-inline-row">
                <TeamLogo name={team.name} size={18} />
                <EntityLink type="team" name={team.name} showIcon={false} />
              </span>
              <span className="power-rankings-meta">
                {team.league} · {formatPct(team.winrate, 1)} WR · {team.wins}W-{team.losses}L
              </span>
            </span>
            <span className="power-rankings-score">{formatNum(score, 1)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
