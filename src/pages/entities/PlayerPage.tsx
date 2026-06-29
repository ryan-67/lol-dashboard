import { useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useEntityPageData } from '../../hooks/useEntityPageData'
import { resolvePlayerFromSlug, bestWorstChampions, sideCellClass } from '../../lib/entities'
import {
  playersForRole,
  isDisplayablePlayer,
  formatGameLogMetric,
  roleMatchHistoryMetrics,
  type RoleKey,
} from '../../lib/playerRadar'
import { getPlayerRole, resolveLaneOpponentForGame } from '../../lib/playerAnalytics'
import { formatGameDate, formatNum, formatPct } from '../../lib/format'
import { resolveTournamentDisplay, buildTournamentIdentityFromGame, tournamentPath } from '../../lib/tournamentCatalog'
import { resolveGameOpponent } from '../../lib/gameOpponent'
import PlayerRadarChart from '../../components/players/PlayerRadarChart'
import PlayerFormChart from '../../components/players/PlayerFormChart'
import {
  EntityFilterBar,
  EntityLink,
  TeamLogo,
  LeagueLogo,
  ChampionEntityInline,
  ChampionWinrateBars,
  PlayerChampionTable,
} from '../../components/entities'
import type { DashboardData } from '../../hooks/useDashboardData'

export default function PlayerPage() {
  const { slug = '' } = useParams<{ slug: string }>()

  const hasData = useCallback(
    (data: DashboardData) => {
      const hit = resolvePlayerFromSlug(data.players.filter(isDisplayablePlayer), slug)
      return Boolean(hit)
    },
    [slug],
  )

  const {
    data,
    loading,
    filters,
    setLeague,
    setYear,
    setSplit,
    leagues,
    years,
    splits,
    fallbackNotice,
    catalogSplits,
  } = useEntityPageData(hasData)

  const filterBar = (
    <EntityFilterBar
      league={filters.league}
      year={filters.year}
      split={filters.split}
      leagues={leagues}
      years={years}
      splits={splits}
      onLeagueChange={setLeague}
      onYearChange={setYear}
      onSplitChange={setSplit}
      fallbackNotice={fallbackNotice}
      catalogSplits={catalogSplits}
    />
  )

  const players = useMemo(
    () => (data?.players ?? []).filter(isDisplayablePlayer),
    [data],
  )

  const resolved = useMemo(
    () => (players.length ? resolvePlayerFromSlug(players, slug) : null),
    [players, slug],
  )

  const player = resolved?.player ?? null
  const role = player ? getPlayerRole(player) : 'mid'
  const cohort = useMemo(() => playersForRole(players, role), [players, role])
  const matchHistoryMetrics = useMemo(() => roleMatchHistoryMetrics(role as RoleKey), [role])

  const champExtremes = useMemo(
    () => (player ? bestWorstChampions(player, 1) : { best: [], worst: [] }),
    [player],
  )

  const sortedGameLog = useMemo(
    () =>
      [...(player?.gameLog ?? [])].sort(
        (a, b) => b.date.localeCompare(a.date) || (b.gameId ?? '').localeCompare(a.gameId ?? ''),
      ),
    [player],
  )

  if (loading && !data) {
    return (
      <div className="page-section entity-page">
        {filterBar}
        <div className="empty-state">Loading player…</div>
      </div>
    )
  }

  if (!player) {
    return (
      <div className="page-section entity-page">
        {filterBar}
        <div className="empty-state">Player not found for this filter.</div>
        <Link to="/players" className="entity-back-link">
          ← Players
        </Link>
      </div>
    )
  }

  const wins = (player.gameLog ?? []).filter((g) => g.result === 1).length
  const losses = (player.gameLog ?? []).length - wins

  return (
    <div className="page-section entity-page">
      {filterBar}

      <Link to="/players" className="entity-back-link">
        ← Players
      </Link>

      <header className="entity-header">
        <div>
          <h1 className="page-title">{player.name}</h1>
          <p className="entity-subtitle">
            <TeamLogo name={player.team} size={22} />
            <EntityLink type="team" name={player.team} showIcon={false} /> ·{' '}
            <LeagueLogo league={player.league} size={18} /> {player.league} ·{' '}
            <span className="text-accent">{role.toUpperCase()}</span>
          </p>
        </div>
        <div className="entity-stat-row">
          <div className="stat-tile">
            <div className="stat-value">{formatNum(player.kda, 2)}</div>
            <div className="stat-label">KDA</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{player.games}</div>
            <div className="stat-label">Games</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">
              {wins}-{losses}
            </div>
            <div className="stat-label">W-L</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatPct((wins / Math.max(player.games, 1)) * 100, 1)}</div>
            <div className="stat-label">Winrate</div>
          </div>
        </div>
      </header>

      <div className="overview-grid overview-grid-2">
        <PlayerRadarChart player={player} role={role} cohort={cohort} hideHeader />
        <PlayerChampionTable player={player} role={role} cohort={cohort} />
      </div>

      <PlayerFormChart players={[player]} cohortPlayers={cohort} />

      <div className="overview-grid overview-grid-2">
        <ChampionWinrateBars title="Best Champions" entries={champExtremes.best} tone="best" />
        <ChampionWinrateBars title="Worst Champions" entries={champExtremes.worst} tone="worst" />
      </div>

      <div className="card">
        <h3 className="card-title">Match History</h3>
        <div className="entity-table-wrap">
          <table className="entity-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Champion</th>
                <th>Result</th>
                <th>Side</th>
                <th>Opponent</th>
                <th>Against</th>
                {matchHistoryMetrics.map((m) => (
                  <th key={m.key}>{m.shortLabel}</th>
                ))}
                <th>K/D/A</th>
                <th>Tournament</th>
              </tr>
            </thead>
            <tbody>
              {sortedGameLog.slice(0, 20).map((g, i) => {
                const opponent = resolveGameOpponent(g, player.team, players, data?.gameCatalog)
                const laneOpponent = resolveLaneOpponentForGame(
                  opponent ? { ...g, opponent } : g,
                  player,
                  players,
                )
                const tournament = resolveTournamentDisplay(
                  g.league ?? player.league,
                  g.split ?? '',
                  g.playoffs,
                  { rawSplit: g.rawSplit, oeYear: g.oeYear },
                )
                const tournamentIdentity = buildTournamentIdentityFromGame(g)
                return (
                  <tr key={`${g.gameId ?? g.date}-${i}`}>
                    <td>{formatGameDate(g.date)}</td>
                    <td>
                      <ChampionEntityInline name={g.champion} />
                    </td>
                    <td className={g.result === 1 ? 'text-accent' : 'text-secondary'}>
                      {g.result === 1 ? 'W' : 'L'}
                    </td>
                    <td className={sideCellClass(g.side)}>
                      {g.side ? g.side.charAt(0).toUpperCase() + g.side.slice(1) : '—'}
                    </td>
                    <td>
                      {opponent ? (
                        <EntityLink type="team" name={opponent} />
                      ) : (
                        <span className="text-secondary">—</span>
                      )}
                    </td>
                    <td>{laneOpponent ? <EntityLink type="player" name={laneOpponent} /> : '—'}</td>
                    {matchHistoryMetrics.map((m) => (
                      <td key={m.key}>
                        {formatGameLogMetric(g, m.key, cohort, m.format)}
                      </td>
                    ))}
                    <td>
                      {g.kills ?? 0}/{g.deaths ?? 0}/{g.assists ?? 0}
                    </td>
                    <td className="text-secondary text-sm">
                      <span className="entity-tournament-cell">
                        <LeagueLogo league={tournamentIdentity.league} size={16} />
                        <Link to={tournamentPath(tournamentIdentity.id)} className="entity-link">
                          {tournament}
                        </Link>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
