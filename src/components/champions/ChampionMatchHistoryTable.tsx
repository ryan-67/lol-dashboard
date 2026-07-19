import type { Player } from '../../hooks/useDashboardData'
import type { DashboardData } from '../../hooks/useDashboardData'
import { buildChampionMatchHistory } from '../../lib/championMatchHistory'
import { formatGameDate, formatNum } from '../../lib/format'
import { seriesPath } from '../../lib/seriesPath'
import { tournamentPath } from '../../lib/tournamentCatalog'
import {
  EntityLink,
  ChampionEntityInline,
  LeagueLogo,
  TeamLogo,
} from '../entities'
import ShellLink from '../shell/ShellLink'
import { useMemo } from 'react'

interface ChampionMatchHistoryTableProps {
  championName: string
  players: Player[]
  data?: DashboardData | null
  limit?: number
  title?: string
}

export default function ChampionMatchHistoryTable({
  championName,
  players,
  data,
  limit = 40,
  title,
}: ChampionMatchHistoryTableProps) {
  const rows = useMemo(
    () =>
      buildChampionMatchHistory(players, championName, {
        limit,
        gameCatalog: data?.gameCatalog,
        data: data ?? undefined,
      }),
    [players, championName, limit, data],
  )

  return (
    <section className="card">
      <h3 className="card-title">{title ?? `Match History · ${championName}`}</h3>
      <p className="card-subtitle">
        Games where {championName} was picked in the active LEAGUE/YEAR/SPLIT filters.
      </p>
      {rows.length === 0 ? (
        <p className="text-secondary text-sm">No games for this champion in the current filter.</p>
      ) : (
        <div className="entity-table-wrap">
          <table className="entity-table entity-table-compact">
            <thead>
              <tr>
                <th>Date</th>
                <th>W/L</th>
                <th>Player</th>
                <th>Role</th>
                <th>KDA</th>
                <th>CSD@15</th>
                <th>Opp team</th>
                <th>Opp player</th>
                <th>Opp champ</th>
                <th>Side</th>
                <th>Patch</th>
                <th>Tournament</th>
                <th>Game</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.gameId}-${row.playerName}-${i}`}>
                  <td>{formatGameDate(row.date)}</td>
                  <td className={row.result === 'W' ? 'text-accent' : 'text-secondary'}>
                    {row.result}
                  </td>
                  <td>
                    <EntityLink type="player" name={row.playerName} showIcon={false} />
                  </td>
                  <td className="text-secondary text-sm">{row.role}</td>
                  <td className="font-mono text-sm">
                    {row.kills}/{row.deaths}/{row.assists}
                    <span className="text-tertiary"> · {formatNum(row.kda, 2)}</span>
                  </td>
                  <td className="font-mono text-sm">
                    {row.csd15 != null
                      ? `${row.csd15 > 0 ? '+' : ''}${formatNum(row.csd15, 1)}`
                      : '—'}
                  </td>
                  <td>
                    {row.opponentTeam ? (
                      <span className="entity-inline-row">
                        <TeamLogo name={row.opponentTeam} size={16} />
                        <EntityLink type="team" name={row.opponentTeam} showIcon={false} />
                      </span>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                  <td>
                    {row.opponentPlayer ? (
                      <EntityLink type="player" name={row.opponentPlayer} showIcon={false} />
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                  <td>
                    {row.opponentChampion ? (
                      <ChampionEntityInline name={row.opponentChampion} iconSize={18} />
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                  <td className={row.sideClass}>{row.side}</td>
                  <td className="text-secondary text-sm">{row.patch}</td>
                  <td>
                    <span className="entity-tournament-cell">
                      <LeagueLogo league={row.tournamentLeague} size={16} />
                      <ShellLink to={tournamentPath(row.tournamentId)} className="entity-link">
                        {row.tournament}
                      </ShellLink>
                    </span>
                  </td>
                  <td>
                    {row.seriesId ? (
                      <ShellLink
                        to={seriesPath(row.seriesId, { gameNumber: row.seriesGameNumber })}
                        className="entity-inline-link"
                      >
                        {row.seriesGameNumber != null ? `G${row.seriesGameNumber}` : 'series'}
                      </ShellLink>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
