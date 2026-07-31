import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import ShellLink from '../../components/shell/ShellLink'
import { useEntityPageData } from '../../hooks/useEntityPageData'
import { resolvePlayerFromSlug, bestWorstChampions, sideCellClass } from '../../lib/entities'
import {
  playersForRole,
  isDisplayablePlayer,
  formatGameLogMetric,
  roleMatchHistoryMetrics,
  computeGameScore,
  type RoleKey,
} from '../../lib/playerRadar'
import { getPlayerRole, resolveLaneOpponentForGame } from '../../lib/playerAnalytics'
import { unitIntervalTo100 } from '../../lib/scoreNormalize'
import { formatGameDate, formatNum } from '../../lib/format'
import { resolveTournamentDisplay, buildTournamentIdentityFromGame, tournamentPath } from '../../lib/tournamentCatalog'
import { resolveGameOpponent } from '../../lib/gameOpponent'
import PlayerRadarChart from '../../components/players/PlayerRadarChart'
import PlayerRadarStatsGrid from '../../components/players/PlayerRadarStatsGrid'
import PlayerFormChart from '../../components/players/PlayerFormChart'
import PlayerModelCard from '../../components/players/PlayerModelCard'
import PlayerGameExplorer from '../../components/players/PlayerGameExplorer'
import SectionSubnav from '../../components/ui/SectionSubnav'
import KpiTile from '../../components/ui/KpiTile'
import EntityHeroField from '../../components/ui/EntityHeroField'
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

const PLAYER_PAGE_SECTIONS = [
  { id: 'player-overview', label: 'Overview' },
  { id: 'player-trends', label: 'Trends' },
  { id: 'player-form', label: 'Form' },
  { id: 'player-history', label: 'History' },
]

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
        <ShellLink to="/players" className="entity-back-link">
          ← Players
        </ShellLink>
      </div>
    )
  }

  const wins = (player.gameLog ?? []).filter((g) => g.result === 1).length
  const losses = (player.gameLog ?? []).length - wins

  return (
    <div className="page-section entity-page">
      {filterBar}

      <ShellLink to="/players" className="entity-back-link">
        ← Players
      </ShellLink>

      <header className="entity-hero">
        <EntityHeroField />
        <div>
          <p className="page-header-eyebrow">player</p>
          <h1 className="entity-hero-name">{player.name}</h1>
          <p className="entity-hero-meta entity-subtitle">
            <TeamLogo name={player.team} size={22} />
            <EntityLink type="team" name={player.team} showIcon={false} /> ·{' '}
            <LeagueLogo league={player.league} size={18} /> {player.league} ·{' '}
            <span>{role.toUpperCase()}</span>
          </p>
        </div>
        <div className="dash-kpi-grid" style={{ marginBottom: 0 }}>
          <KpiTile label="KDA" value={player.kda} decimals={2} />
          <KpiTile label="Games" value={player.games} />
          <KpiTile label="W-L" display={`${wins}-${losses}`} />
          <KpiTile
            label="Winrate"
            value={(wins / Math.max(player.games, 1)) * 100}
            decimals={1}
            suffix="%"
          />
        </div>
      </header>

      <SectionSubnav items={PLAYER_PAGE_SECTIONS} />

      <section id="player-overview">
        <PlayerModelCard player={player} role={role} />

        <div className="overview-grid overview-grid-2">
          <div className="player-radar-stack">
            <PlayerRadarChart player={player} role={role} cohort={cohort} hideHeader />
            <PlayerRadarStatsGrid player={player} role={role} cohort={cohort} />
          </div>
          <PlayerChampionTable player={player} role={role} cohort={cohort} />
        </div>

        <div className="overview-grid overview-grid-2">
          <ChampionWinrateBars title="Best Champions" entries={champExtremes.best} tone="best" />
          <ChampionWinrateBars title="Worst Champions" entries={champExtremes.worst} tone="worst" />
        </div>
      </section>

      <section id="player-trends">
        <PlayerGameExplorer player={player} cohort={cohort} role={role} />
      </section>

      <section id="player-form">
        <PlayerFormChart players={[player]} cohortPlayers={cohort} />
      </section>

      <section id="player-history" className="card">
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
                <th>Perf</th>
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
                    <td>{formatNum(unitIntervalTo100(computeGameScore(g, role, cohort)), 1)}</td>
                    <td className="text-secondary text-sm">
                      <span className="entity-tournament-cell">
                        <LeagueLogo league={tournamentIdentity.league} size={16} />
                        <ShellLink to={tournamentPath(tournamentIdentity.id)} className="entity-link">
                          {tournament}
                        </ShellLink>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
