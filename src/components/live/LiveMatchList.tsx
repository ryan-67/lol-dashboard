import { Link } from 'react-router-dom'
import type { LiveMatchSummary } from '../../lib/live/types'
import { LeagueLogo } from '../entities'
import LiveTeamLogo from './LiveTeamLogo'
import LiveStatusBadge from './LiveStatusBadge'

interface LiveMatchListProps {
  matches: LiveMatchSummary[]
}

function ScoreCell({ a, b, live }: { a: number | null; b: number | null; live: boolean }) {
  if (a == null && b == null) return <span className="live-row-score live-row-score-empty">vs</span>
  return (
    <span className={`live-row-score${live ? ' live-row-score-active' : ''}`}>
      {a ?? 0}
      <span className="live-row-score-sep">–</span>
      {b ?? 0}
    </span>
  )
}

export default function LiveMatchList({ matches }: LiveMatchListProps) {
  if (!matches.length) {
    return (
      <div className="empty-state">
        No live or upcoming matches for this filter right now. Check back around match time.
      </div>
    )
  }

  return (
    <ul className="live-match-list">
      {matches.map((m) => {
        const live = m.state === 'live'
        return (
          <li key={m.matchId} className={`live-match-row${live ? ' is-live' : ''}`}>
            <Link to={`/live/${m.matchId}`} className="live-match-link">
              <div className="live-row-league">
                <LeagueLogo league={m.league} />
                <span className="live-row-league-name">{m.league}</span>
                {m.bestOf ? <span className="live-row-bo">Bo{m.bestOf}</span> : null}
              </div>

              <div className="live-row-teams">
                <span className="live-row-team">
                  <LiveTeamLogo name={m.team1.name} logoUrl={m.team1.logoUrl} size={24} />
                  <span className="live-row-team-name">{m.team1.name}</span>
                </span>
                <ScoreCell a={m.team1.score} b={m.team2.score} live={live} />
                <span className="live-row-team live-row-team-right">
                  <span className="live-row-team-name">{m.team2.name}</span>
                  <LiveTeamLogo name={m.team2.name} logoUrl={m.team2.logoUrl} size={24} />
                </span>
              </div>

              <div className="live-row-status">
                <LiveStatusBadge state={m.state} startTime={m.startTime} />
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
