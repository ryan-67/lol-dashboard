import { useMemo, useRef, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import { useEntityPageData } from '../../hooks/useEntityPageData'
import type { DashboardData } from '../../hooks/useDashboardData'
import {
  buildTournamentSummaries,
  buildTournamentStandings,
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
import { EntityLink, ChampionEntityInline } from '../../components/entities'
import PlayerRadarChart from '../../components/players/PlayerRadarChart'
import TeamRadarChart from '../../components/teams/TeamRadarChart'
import { ROLES, bestPlayerForRole, computeGameScore, normalizePosition, playersForRole, type RoleKey } from '../../lib/playerRadar'
import { formatDurationMinSec } from '../../lib/tournamentFormat'

export default function TournamentPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const hasTournamentData = useCallback(
    (d: DashboardData) => findTournamentById(d, slug) !== null,
    [slug],
  )
  const { data, loading, fallbackNotice } = useEntityPageData(hasTournamentData)
  const [activeTab, setActiveTab] = useState<TournamentPageTab>('overview')
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
    () => (tournament ? filterTeamsForTournament(data?.teams ?? [], scopedPlayers) : []),
    [data?.teams, scopedPlayers, tournament],
  )

  const scopedChampions = useMemo(
    () => (tournament ? filterChampionsForTournament(data?.champions ?? [], scopedPlayers) : []),
    [data?.champions, scopedPlayers, tournament],
  )

  const standings = useMemo(() => buildTournamentStandings(scopedPlayers), [scopedPlayers])

  const standoutPlayer = useMemo(() => {
    if (!scopedPlayers.length) return null
    let best: { player: (typeof scopedPlayers)[0]; score: number } | null = null
    for (const player of scopedPlayers) {
      const role = normalizePosition(player.position) ?? 'mid'
      const cohort = playersForRole(scopedPlayers, role)
      const logs = player.gameLog ?? []
      if (!logs.length) continue
      const score =
        logs.reduce((s, g) => s + computeGameScore(g, role, cohort), 0) / logs.length
      if (!best || score > best.score) best = { player, score }
    }
    return best
  }, [scopedPlayers])

  const standoutTeam = useMemo(() => {
    if (!standings.length) return null
    const eligible = standings.filter((r) => r.wins + r.losses >= 3)
    const row = (eligible.length ? eligible : standings)[0]
    return row ? scopedTeams.find((t) => t.name === row.team) ?? null : null
  }, [standings, scopedTeams])

  const standoutChampion = useMemo(() => scopedChampions[0] ?? null, [scopedChampions])

  const radarPlayers = useMemo(
    () =>
      ROLES.map((role) => {
        const best = bestPlayerForRole(scopedPlayers, role)
        return best ? { player: best, role } : null
      }).filter((x): x is { player: (typeof scopedPlayers)[0]; role: RoleKey } => x !== null),
    [scopedPlayers],
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
          <h1 className="page-title">{tournament.displayName}</h1>
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
              <p className="card-subtitle">Winrate from games in this tournament</p>
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
            <div className="overview-grid overview-grid-3">
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
                      Avg perf score {formatNum(standoutPlayer.score * 100, 1)} ·{' '}
                      {standoutPlayer.player.games} games
                    </p>
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
                  </>
                )}
              </div>
              <div className="tournament-standout">
                <h3 className="card-title">Champion</h3>
                {!standoutChampion ? (
                  <p className="text-secondary text-sm">—</p>
                ) : (
                  <>
                    <ChampionEntityInline name={standoutChampion.name} iconSize={22} />
                    <p className="text-secondary text-xs mt-1">
                      {standoutChampion.picks} picks · {formatPct(standoutChampion.winrate, 1)} WR
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === 'players' && (
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
          <h2 className="card-title">Champions</h2>
          {!scopedChampions.length ? (
            <p className="text-secondary">No champion data for this tournament.</p>
          ) : (
            <div className="entity-table-wrap">
              <table className="entity-table">
                <thead>
                  <tr>
                    <th>Champion</th>
                    <th>Picks</th>
                    <th>Winrate</th>
                    <th>Presence</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedChampions.slice(0, 30).map((c) => (
                    <tr key={c.name}>
                      <td>
                        <ChampionEntityInline name={c.name} iconSize={20} />
                      </td>
                      <td>{c.picks}</td>
                      <td className="text-accent">{formatPct(c.winrate, 1)}</td>
                      <td>{formatPct(c.presence, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
