import { Link } from 'react-router-dom'
import type { TournamentSeriesRow } from '../../lib/seriesAnalytics'
import { seriesPath } from '../../lib/seriesPath'
import { formatGameDate } from '../../lib/format'
import { TeamLogo } from '../entities'
import { recapTeamTag } from '../../lib/recapTeamTag'

interface TournamentMatchListProps {
  rows: TournamentSeriesRow[]
}

export default function TournamentMatchList({ rows }: TournamentMatchListProps) {
  if (!rows.length) {
    return <p className="text-secondary">No completed series in this tournament.</p>
  }

  return (
    <div className="entity-table-wrap">
      <table className="entity-table tournament-match-list">
        <thead>
          <tr>
            <th>Matchup</th>
            <th>Score</th>
            <th>Patch</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.seriesId}>
              <td>
                <Link to={seriesPath(row.seriesId)} className="entity-link tournament-series-link">
                  <TeamLogo name={row.teamA} size={20} />
                  <span>{recapTeamTag(row.teamA)}</span>
                  <span className="tournament-series-vs">vs</span>
                  <TeamLogo name={row.teamB} size={20} />
                  <span>{recapTeamTag(row.teamB)}</span>
                </Link>
              </td>
              <td className="text-accent">{row.scoreLabel}</td>
              <td>{row.patch}</td>
              <td>{formatGameDate(row.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
