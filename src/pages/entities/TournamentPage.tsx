import { useMemo, useRef, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import { useEntityPageData } from '../../hooks/useEntityPageData'
import type { DashboardData, Player } from '../../hooks/useDashboardData'
import {
  buildTournamentChampionRows,
  buildTournamentSummaries,
  buildTournamentSeriesStandings,
  filterChampionsForTournament,
  filterPlayersForTournament,
  filterTeamsForTournament,
  findTournamentById,
} from '../../lib/tournamentAnalytics'
import {
  sequentialTournamentNeighbors,
  tournamentPath,
} from '../../lib/tournamentCatalog'
import { formatGameDate, formatNum, formatPct } from '../../lib/format'
import { scrollEntranceStagger } from '../../theme/animations'
import { TournamentSubnav, type TournamentPageTab } from '../../components/tournaments'
import TournamentMatchList from '../../components/tournaments/TournamentMatchList'
import { buildTournamentSeriesList } from '../../lib/seriesAnalytics'
import { EntityLink, ChampionEntityInline, LeagueLogo } from '../../components/entities'
import PlayerRadarChart from '../../components/players/PlayerRadarChart'
import TeamRadarChart from '../../components/teams/TeamRadarChart'
import {
  ROLES,
  bestPlayerForRole,
  computeGameScore,
  highestPlayerRadarHighlight,
  normalizePosition,
  playersForRole,
  type RoleKey,
} from '../../lib/playerRadar'
import { highestTeamRadarHighlight } from '../../lib/teamAnalytics'
import { teamMatchesCanonical } from '../../lib/entities/slugs'
import { formatDurationMinSec } from '../../lib/tournamentFormat'
import { computeOpScores, roleLabel, type RoleFilter } from '../../lib/championAnalytics'
import RoleFilterBar from '../../components/champions/RoleFilterBar'
import PlayerDropdown from '../../components/players/PlayerDropdown'
import PlayerFormChart from '../../components/players/PlayerFormChart'
import PlayerChampionPool from '../../components/players/PlayerChampionPool'
import PlayerComparisonRadar from '../../components/players/PlayerComparisonRadar'
import { playerKey } from '../../lib/playerAnalytics'

function OpChampionSpotlight({
  champions,
}: {
  champions: ReturnType<typeof filterChampionsForTournament>
}) {
  const { top } = computeOpScores(champions)
  if (!top) return <p className="text-secondary text-sm">—</p>

  const { champion, role, opScore } = top
  return (
    <div className="tournament-standout-spotlight">
      <span className="role-badge tournament-standout-role">{roleLabel(role)}</span>
      <div className="tournament-standout-op-score">
        <span className="text-secondary text-xs">OP SCORE</span>
        <span className="text-accent text-xl">{opScore.toFixed(2)}</span>
      </div>
      <ChampionEntityInline name={champion.name} iconSize={24} />
      <div className="tournament-standout-mini-stats">
        <span>{champion.presence.toFixed(1)}% presence</span>
        <span>{champion.winrate.toFixed(1)}% WR</span>
        <span>{champion.picks} picks</span>
      </div>
    </div>
  )
}

export default function TournamentPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const hasTournamentData = useCallback(
    (d: DashboardData) => findTournamentById(d, slug) !== null,
    [slug],
  )
  const { data, loading, fallbackNotice } = useEntityPageData(hasTournamentData)
  const [activeTab, setActiveTab] = useState<TournamentPageTab>('overview')
  const [champRoleFilter, setChampRoleFilter] = useState<RoleFilter>('all')
  const [selectedPlayerKeys, setSelectedPlayerKeys] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const allTournaments = useMemo(
    () => (data ? buildTournamentSummaries(data) : []),
    [data],
  )

  const tournament = useMemo(
    () => (data ? findTournamentById(data, slug) : null),
    [data, slug],
  )

  const neighbors = useMemo(
    () => sequentialTournamentNeighbors(allTournaments, slug),
    [allTournaments, slug],
  )

  const scopedPlayers = useMemo(
    () => (tournament && data ? filterPlayersForTournament(data.players, tournament) : []),
    [data, tournament],
  )

  const scopedTeams = useMemo(
    () =>
      tournament && data
        ? filterTeamsForTournament(data.teams ?? [], scopedPlayers, data, tournament)
        : [],
    [data, scopedPlayers, tournament],
  )

  const standings = useMemo(
    () => (data && tournament ? buildTournamentSeriesStandings(data, tournament) : []),
    [data, tournament],
  )

  const scopedChampions = useMemo(
    () =>
      tournament
        ? filterChampionsForTournament(
            data?.champions ?? [],
            scopedPlayers,
            data?.gameCatalog,
          )
        : [],
    [data?.champions, data?.gameCatalog, scopedPlayers, tournament],
  )

  const championRows = useMemo(
    () => buildTournamentChampionRows(scopedChampions, champRoleFilter),
    [scopedChampions, champRoleFilter],
  )

  const seriesList = useMemo(
    () => (tournament && data ? buildTournamentSeriesList(data, tournament) : []),
    [data, tournament],
  )

  const standoutPlayer = useMemo(() => {
    if (!scopedPlayers.length) return null
    let best: { player: (typeof scopedPlayers)[0]; score: number; role: RoleKey } | null = null
    for (const player of scopedPlayers) {
      const role = normalizePosition(player.position) ?? 'mid'
      const cohort = playersForRole(scopedPlayers, role)
      const logs = player.gameLog ?? []
      if (!logs.length) continue
      const score =
        logs.reduce((s, g) => s + computeGameScore(g, role, cohort), 0) / logs.length
      if (!best || score > best.score) best = { player, score, role }
    }
    return best
  }, [scopedPlayers])

  const standoutTeam = useMemo(() => {
    if (!standings.length) return null
    const eligible = standings.filter((r) => r.wins + r.losses >= 3)
    const row = (eligible.length ? eligible : standings)[0]
    return row ? scopedTeams.find((t) => teamMatchesCanonical(t.name, row.team)) ?? null : null
  }, [standings, scopedTeams])

  const standoutChampion = useMemo(() => {
    const { top } = computeOpScores(scopedChampions)
    return top?.champion ?? scopedChampions[0] ?? null
  }, [scopedChampions])

  const radarPlayers = useMemo(
    () =>
      ROLES.map((role) => {
        const best = bestPlayerForRole(scopedPlayers, role)
        return best ? { player: best, role } : null
      }).filter((x): x is { player: (typeof scopedPlayers)[0]; role: RoleKey } => x !== null),
    [scopedPlayers],
  )

  const selectedPlayers = useMemo(
    () =>
      selectedPlayerKeys
        .map((key) => scopedPlayers.find((p) => playerKey(p) === key))
        .filter((p): p is Player => Boolean(p)),
    [scopedPlayers, selectedPlayerKeys],
  )

  useGSAP(
    () => {
      scrollEntranceStagger(ref.current, '.tournament-card')
    },
    { scope: ref, dependencies: [activeTab, slug, scopedPlayers.length] },
  )

  if (loading && !data) {
    return <div className="empty-state">Loading tournament…</div>
  }

  if (!tournament) {
    return (
      <div className="page-section entity-page">
        <div className="empty-state">Tournament not found for this filter.</div>
        <Link to="/tournaments" className="entity-back-link">
          ← Tournaments
        </Link>
      </div>
    )
  }

  const playerHighlight =
    standoutPlayer &&
    highestPlayerRadarHighlight(
      standoutPlayer.player,
      standoutPlayer.role,
      playersForRole(scopedPlayers, standoutPlayer.role),
    )

  const teamHighlight =
    standoutTeam && highestTeamRadarHighlight(standoutTeam, scopedTeams)

  return (
    <div ref={ref} className="page-section entity-page tournament-page">
      <nav className="tournament-seq-nav" aria-label="Adjacent tournaments">
        {neighbors.prev ? (
          <Link to={tournamentPath(neighbors.prev.id)} className="tournament-seq-link">
            ← {neighbors.prev.displayName}
          </Link>
        ) : (
          <span className="tournament-seq-placeholder" />
        )}
        <span className="tournament-seq-current">{tournament.displayName}</span>
        {neighbors.next ? (
          <Link to={tournamentPath(neighbors.next.id)} className="tournament-seq-link tournament-seq-link-next">
            {neighbors.next.displayName} →
          </Link>
        ) : (
          <span className="tournament-seq-placeholder" />
        )}
      </nav>

      {fallbackNotice ? (
        <p className="card-subtitle mb-4 text-secondary">{fallbackNotice}</p>
      ) : null}

      <TournamentSubnav active={activeTab} onChange={setActiveTab} />

      <Link to="/tournaments" className="entity-back-link">
        ← Tournaments
      </Link>

      <header className="entity-header">
        <div>
          <h1 className="page-title entity-title-row">
            <LeagueLogo league={tournament.league} size={28} />
            {tournament.displayName}
          </h1>
          <p className="entity-subtitle">
            {tournament.region} · {tournament.gameCount} games ·{' '}
            {formatGameDate(tournament.firstGameDate)} – {formatGameDate(tournament.lastGameDate)}
          </p>
        </div>
      </header>

      {activeTab === 'overview' && (
        <>
          <div className="overview-grid overview-grid-2">
            <section className="card tournament-card">
              <h2 className="card-title">Tournament Info</h2>
              <ul className="tournament-info-list">
                <li>
                  <span>Games played</span>
                  <span className="text-accent">{tournament.gameCount}</span>
                </li>
                <li>
                  <span>Average game length</span>
                  <span>{formatDurationMinSec(tournament.avgGameDurationMin)}</span>
                </li>
                <li>
                  <span>First game</span>
                  <span>{formatGameDate(tournament.firstGameDate)}</span>
                </li>
                <li>
                  <span>Last game</span>
                  <span>{formatGameDate(tournament.lastGameDate)}</span>
                </li>
                <li>
                  <span>Canonical split</span>
                  <span className="text-secondary">{tournament.canonicalSplit}</span>
                </li>
              </ul>
            </section>

            <section className="card tournament-card">
              <h2 className="card-title">Rank</h2>
              <p className="card-subtitle">Series winrate in this tournament</p>
              {!standings.length ? (
                <p className="text-secondary text-sm">No rank data.</p>
              ) : (
                <div className="entity-table-wrap">
                  <table className="entity-table entity-table-compact">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>W-L</th>
                        <th>WR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.slice(0, 10).map((row, idx) => (
                        <tr key={row.team}>
                          <td>{idx + 1}</td>
                          <td>
                            <EntityLink type="team" name={row.team} />
                          </td>
                          <td>
                            {row.wins}-{row.losses}
                          </td>
                          <td className="text-accent">{formatPct(row.winrate, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="card tournament-card">
            <h2 className="card-title">Standouts</h2>
            <div className="overview-grid overview-grid-3 tournament-standouts-grid">
              <div className="tournament-standout">
                <h3 className="card-title">Player</h3>
                {!standoutPlayer ? (
                  <p className="text-secondary text-sm">—</p>
                ) : (
                  <>
                    <EntityLink
                      type="player"
                      name={standoutPlayer.player.name}
                      player={standoutPlayer.player}
                      allPlayers={scopedPlayers}
                      showIcon={false}
                    />
                    <p className="text-secondary text-xs mt-1">
                      Avg perf {formatNum(standoutPlayer.score * 100, 1)} ·{' '}
                      {standoutPlayer.player.games} games
                    </p>
                    {playerHighlight ? (
                      <p className="text-accent text-xs mt-1">
                        Top vs avg: {playerHighlight.label} ({playerHighlight.formatted})
                      </p>
                    ) : null}
                    <div className="tournament-standout-radar">
                      <PlayerRadarChart
                        player={standoutPlayer.player}
                        role={standoutPlayer.role}
                        cohort={playersForRole(scopedPlayers, standoutPlayer.role)}
                        compact
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="tournament-standout">
                <h3 className="card-title">Team</h3>
                {!standoutTeam ? (
                  <p className="text-secondary text-sm">—</p>
                ) : (
                  <>
                    <EntityLink type="team" name={standoutTeam.name} />
                    <p className="text-secondary text-xs mt-1">
                      {formatPct(standoutTeam.winrate, 1)} WR · {standoutTeam.wins}W-{standoutTeam.losses}L
                    </p>
                    {teamHighlight ? (
                      <p className="text-accent text-xs mt-1">
                        Top vs avg: {teamHighlight.label} ({teamHighlight.formatted})
                      </p>
                    ) : null}
                    <div className="tournament-standout-radar">
                      <TeamRadarChart team={standoutTeam} cohort={scopedTeams} compact />
                    </div>
                  </>
                )}
              </div>
              <div className="tournament-standout">
                <h3 className="card-title">Champion</h3>
                {!standoutChampion ? (
                  <p className="text-secondary text-sm">—</p>
                ) : (
                  <OpChampionSpotlight champions={scopedChampions} />
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === 'players' && (
        <>
          <section className="card tournament-card">
            <h2 className="card-title">Players</h2>
            {!radarPlayers.length ? (
              <p className="text-secondary">No player data for this tournament.</p>
            ) : (
              <div className="radar-grid radar-grid-5">
                {radarPlayers.map(({ player, role }) => (
                  <PlayerRadarChart
                    key={`${player.name}-${role}`}
                    player={player}
                    role={role}
                    cohort={playersForRole(scopedPlayers, role)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="card tournament-card player-analytics-section">
            <h2 className="card-title">Compare Players</h2>
            <p className="card-subtitle">Tournament-scoped stats · select up to 6 players</p>
            <PlayerDropdown
              players={scopedPlayers}
              selectedKeys={selectedPlayerKeys}
              onChange={setSelectedPlayerKeys}
            />
            {selectedPlayers.length > 0 && (
              <div className="player-analytics-grid">
                <PlayerComparisonRadar players={selectedPlayers} cohort={scopedPlayers} />
                <PlayerFormChart players={selectedPlayers} cohortPlayers={scopedPlayers} />
                <PlayerChampionPool players={selectedPlayers} />
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'teams' && (
        <section className="card tournament-card">
          <h2 className="card-title">Teams</h2>
          {!scopedTeams.length ? (
            <p className="text-secondary">No team data for this tournament.</p>
          ) : (
            <div className="radar-grid">
              {scopedTeams
                .slice()
                .sort((a, b) => b.winrate - a.winrate)
                .map((team) => (
                  <TeamRadarChart key={team.name} team={team} cohort={scopedTeams} />
                ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'champions' && (
        <section className="card tournament-card">
          <h2 className="card-title">Stats Table</h2>
          <RoleFilterBar value={champRoleFilter} onChange={setChampRoleFilter} />
          {!championRows.length ? (
            <p className="text-secondary">No champion data for this tournament.</p>
          ) : (
            <div className="entity-table-wrap">
              <table className="entity-table">
                <thead>
                  <tr>
                    <th>Champion</th>
                    <th>Picks</th>
                    <th>Bans</th>
                    <th>Winrate</th>
                    <th>Presence</th>
                    <th>Priority</th>
                    <th>GD@15</th>
                    <th>CS@15</th>
                    <th>XP@15</th>
                  </tr>
                </thead>
                <tbody>
                  {championRows.map((c) => (
                    <tr key={c.name}>
                      <td>
                        <ChampionEntityInline name={c.name} iconSize={20} />
                      </td>
                      <td>{c.picks}</td>
                      <td>{c.bans}</td>
                      <td className="text-accent">{formatPct(c.winrate, 1)}</td>
                      <td>{formatPct(c.presence, 1)}</td>
                      <td>{formatNum(c.priority, 1)}</td>
                      <td>
                        {c.gd15 != null ? `${c.gd15 > 0 ? '+' : ''}${formatNum(c.gd15, 1)}` : '—'}
                      </td>
                      <td>
                        {c.csd15 != null ? `${c.csd15 > 0 ? '+' : ''}${formatNum(c.csd15, 1)}` : '—'}
                      </td>
                      <td>
                        {c.xpd15 != null ? `${c.xpd15 > 0 ? '+' : ''}${formatNum(c.xpd15, 1)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'matches' && (
        <section className="card tournament-card">
          <h2 className="card-title">Match List</h2>
          <p className="card-subtitle">Completed series in this tournament, newest first</p>
          <TournamentMatchList rows={seriesList} />
        </section>
      )}
    </div>
  )
}
