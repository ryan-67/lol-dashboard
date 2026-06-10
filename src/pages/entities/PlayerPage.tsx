import { useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useEntityPageData } from '../../hooks/useEntityPageData'
import { resolvePlayerFromSlug, bestWorstChampions } from '../../lib/entities'
import { playersForRole, isDisplayablePlayer } from '../../lib/playerRadar'
import { getPlayerRole } from '../../lib/playerAnalytics'
import { formatNum, formatPct } from '../../lib/format'
import PlayerRadarChart from '../../components/players/PlayerRadarChart'
import PlayerFormChart from '../../components/players/PlayerFormChart'
import {
  EntityFilterBar,
  EntityLink,
  TeamLogo,
  LeagueLogo,
  ChampionEntityInline,
  ChampionWinrateBars,
  PlayerChampionPie,
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

  const champExtremes = useMemo(
    () => (player ? bestWorstChampions(player, 1) : { best: [], worst: [] }),
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
        <PlayerRadarChart player={player} role={role} cohort={cohort} />
        <PlayerChampionPie player={player} />
      </div>

      <PlayerFormChart players={[player]} cohortPlayers={cohort} />

      <div className="overview-grid overview-grid-2">
        <ChampionWinrateBars title="Best Champions" entries={champExtremes.best} tone="best" />
        <ChampionWinrateBars title="Worst Champions" entries={champExtremes.worst} tone="worst" />
      </div>

      <div className="card page-section">
        <h3 className="card-title">Match History</h3>
        <div className="entity-table-wrap">
          <table className="entity-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Champion</th>
                <th>Opponent</th>
                <th>Result</th>
                <th>KDA</th>
                <th>GD@15</th>
                <th>Side</th>
              </tr>
            </thead>
            <tbody>
              {[...(player.gameLog ?? [])]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 20)
                .map((g, i) => (
                  <tr key={`${g.date}-${i}`}>
                    <td>{g.date}</td>
                    <td>
                      <ChampionEntityInline name={g.champion} />
                    </td>
                    <td>
                      <EntityLink type="team" name={g.opponent ?? 'Unknown'} />
                    </td>
                    <td className={g.result === 1 ? 'text-accent' : 'text-secondary'}>
                      {g.result === 1 ? 'W' : 'L'}
                    </td>
                    <td>{formatNum(g.kda, 2)}</td>
                    <td>{g.gd15 > 0 ? '+' : ''}{formatNum(g.gd15, 1)}</td>
                    <td>{g.side ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
