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
import { formatGameDate, formatNum, formatPct } from '../../lib/format'
import { resolveTournamentDisplay, buildTournamentIdentityFromGame, tournamentPath } from '../../lib/tournamentCatalog'
import { resolveGameOpponent } from '../../lib/gameOpponent'
import { computePlayerCurrentForm, formSparkValues } from '../../lib/currentForm'
import PlayerRadarChart from '../../components/players/PlayerRadarChart'
import PlayerRadarStatsGrid from '../../components/players/PlayerRadarStatsGrid'
import PlayerFormChart from '../../components/players/PlayerFormChart'
import PlayerModelCard from '../../components/players/PlayerModelCard'
import SectionSubnav from '../../components/ui/SectionSubnav'
import KpiTile from '../../components/ui/KpiTile'
import FormBadges from '../../components/ui/FormBadges'
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
  { id: 'player-now', label: 'Now' },
  { id: 'player-evidence', label: 'Evidence' },
  { id: 'player-recent', label: 'Recent' },
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

  const currentForm = useMemo(
    () => (player ? computePlayerCurrentForm(player) : null),
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

  const form = currentForm!

  return (
    <div className="page-section entity-page">
      {filterBar}

      <ShellLink to="/players" className="entity-back-link">
        ← Players
      </ShellLink>

      <header className="entity-hero">
        <EntityHeroField />
        <div>
          <p className="page-header-eyebrow">player · now</p>
          <h1 className="entity-hero-name">{player.name}</h1>
          <p className="entity-hero-meta entity-subtitle">
            <TeamLogo name={player.team} size={22} />
            <EntityLink type="team" name={player.team} showIcon={false} /> ·{' '}
            <LeagueLogo league={player.league} size={18} /> {player.league} ·{' '}
            <span>{role.toUpperCase()}</span>
          </p>
          <FormBadges form={form} className="mt-2" />
        </div>
        <div className="dash-kpi-grid" style={{ marginBottom: 0 }}>
          <KpiTile
            label="Form"
            value={form.formScore}
            decimals={0}
            accent
            spark={formSparkValues(form)}
            meta={form.label}
          />
          <KpiTile
            label="Series WR"
            value={form.winRate * 100}
            decimals={0}
            suffix="%"
            meta={`${form.sampleSize} series`}
          />
          <KpiTile label="KDA" value={player.kda} decimals={2} />
          <KpiTile
            label="Idle"
            display={form.idleDays != null ? `${form.idleDays}d` : '—'}
            meta={form.idleLabel ?? 'active'}
          />
        </div>
      </header>

      <SectionSubnav items={PLAYER_PAGE_SECTIONS} />

      <section id="player-now">
        <PlayerModelCard player={player} role={role} />

        <div className="overview-grid overview-grid-2">
          <div className="player-radar-stack">
            <PlayerRadarChart player={player} role={role} cohort={cohort} hideHeader />
            <PlayerRadarStatsGrid player={player} role={role} cohort={cohort} />
          </div>
          <div>
            <PlayerFormChart players={[player]} cohortPlayers={cohort} />
            {form.series.length > 0 ? (
              <div className="card" style={{ marginTop: '1rem' }}>
                <h3 className="card-title">Last {form.sampleSize} series</h3>
                <ul className="text-sm text-secondary" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {form.series.map((s) => (
                    <li key={`${s.date}-${s.opponent}`} style={{ padding: '0.35rem 0' }}>
                      <span className={s.won ? 'text-accent' : ''}>{s.won ? 'W' : 'L'}</span>
                      {' '}{s.scoreLabel} vs {s.opponent}
                      <span className="text-tertiary"> · {formatGameDate(s.date)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section id="player-evidence">
        <PlayerChampionTable player={player} role={role} cohort={cohort} />
        <div className="overview-grid overview-grid-2">
          <ChampionWinrateBars title="Best Champions" entries={champExtremes.best} tone="best" />
          <ChampionWinrateBars title="Worst Champions" entries={champExtremes.worst} tone="worst" />
        </div>
      </section>

      <section id="player-recent" className="card">
        <h3 className="card-title">Recent games</h3>
        <p className="card-subtitle">
          Form-window evidence ({formatPct(form.winRate * 100, 0)} series WR) — not a career archive.
        </p>
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
              {sortedGameLog.slice(0, 12).map((g, i) => {
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
