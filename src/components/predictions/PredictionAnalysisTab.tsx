import { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '../../context/DashboardContext'
import {
  buildEntitySearchIndex,
  searchEntities,
  type EntitySearchEntry,
} from '../../lib/entities/searchIndex'
import { getTeamRosterDepth, isTier1Player, isTier1Team } from '../../lib/mergeSlices'
import { teamMatchesCanonical } from '../../lib/entities'
import {
  normalizePosition,
  playersForRole,
  roleMatchHistoryMetrics,
  type RoleKey,
  isDisplayablePlayer,
} from '../../lib/playerRadar'
import TeamModelCard from '../entities/TeamModelCard'
import PlayerModelCard from '../players/PlayerModelCard'
import PlayerRadarChart from '../players/PlayerRadarChart'
import PlayerFormChart from '../players/PlayerFormChart'
import TeamRadarChart from '../teams/TeamRadarChart'
import TeamRosterRadars from '../entities/TeamRosterRadars'
import ScoreCaveat from '../ui/ScoreCaveat'
import {
  EntityLink,
  TeamLogo,
  ChampionIcon,
  TeamStatTrends,
  ChampionEntityInline,
  LeagueLogo,
} from '../entities'
import ChampionMatchHistoryTable from '../champions/ChampionMatchHistoryTable'
import { computeOpScores, isDisplayableChampion } from '../../lib/championAnalytics'
import { formatGameDate, formatNum, formatPct } from '../../lib/format'
import { opScoreTo100 } from '../../lib/scoreNormalize'
import { OP_SCORE_HINT } from '../../lib/metricHints'
import {
  playerFromRecentForm,
  teamLastGameDate,
  RECENT_FORM_MAX_DAYS,
  RECENT_FORM_MAX_GAMES,
} from '../../lib/recentFormPlayer'
import {
  buildTeamMatchHistory,
  sideCellClass,
} from '../../lib/entities/entityAnalytics'
import { buildGameToSeriesMap } from '../../lib/seriesAnalytics'
import { seriesPath } from '../../lib/seriesPath'
import { tournamentPath, buildTournamentIdentityFromGame, resolveTournamentDisplay } from '../../lib/tournamentCatalog'
import { resolveGameOpponent } from '../../lib/gameOpponent'
import { resolveLaneOpponentForGame } from '../../lib/playerAnalytics'
import { formatGameLogMetric, computeGameScore } from '../../lib/playerRadar'
import { unitIntervalTo100 } from '../../lib/scoreNormalize'
import ShellLink from '../shell/ShellLink'
import type { DashboardData, Player, Team } from '../../hooks/useDashboardData'

function AnalysisStaleNote({
  daysSinceLastGame,
  gamesUsed,
  isThinSample,
  isStale,
}: {
  daysSinceLastGame: number | null
  gamesUsed: number
  isThinSample: boolean
  isStale: boolean
}) {
  if (!isStale && !isThinSample) return null
  return (
    <p className="predictions-analysis-note text-secondary text-sm">
      Limited recent activity
      {daysSinceLastGame != null ? ` · last game ${daysSinceLastGame}d ago` : ''}
      {gamesUsed > 0 ? ` · radar uses ${gamesUsed} games` : ''}
      {isThinSample ? ' · thin sample' : ''}. Insights still shown from the available window.
    </p>
  )
}

function TeamAnalysisMatchHistory({
  players,
  team,
  gameCatalog,
  gameToSeries,
}: {
  players: Player[]
  team: Team
  gameCatalog: DashboardData['gameCatalog'] | undefined
  gameToSeries: Map<string, string>
}) {
  const rows = useMemo(
    () => buildTeamMatchHistory(players, team.name, undefined, undefined, undefined, gameCatalog),
    [players, team.name, gameCatalog],
  )

  return (
    <section className="card">
      <h3 className="card-title">Match History</h3>
      <p className="card-subtitle">Same game log as the team identity page (active filters).</p>
      {rows.length === 0 ? (
        <p className="text-secondary text-sm">No games in the current filter.</p>
      ) : (
        <div className="entity-table-wrap">
          <table className="entity-table entity-table-compact">
            <thead>
              <tr>
                <th>Result</th>
                <th>Matchup</th>
                <th>Side</th>
                <th>Patch</th>
                <th>Tournament</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 25).map((m, i) => {
                const seriesId = m.gameId ? gameToSeries.get(m.gameId) : undefined
                return (
                  <tr key={`${m.date}-${m.gameId || i}`}>
                    <td className={m.result === 'W' ? 'text-accent' : 'text-secondary'}>
                      {m.result}
                    </td>
                    <td className="entity-inline-row">
                      <EntityLink type="team" name={m.teamName} /> vs{' '}
                      {m.opponent ? <EntityLink type="team" name={m.opponent} /> : '—'}
                      {seriesId ? (
                        <>
                          {' · '}
                          <ShellLink to={seriesPath(seriesId)} className="entity-inline-link">
                            series
                          </ShellLink>
                        </>
                      ) : null}
                    </td>
                    <td className={m.sideClass}>{m.side}</td>
                    <td>{m.patch}</td>
                    <td>
                      <span className="entity-tournament-cell">
                        <LeagueLogo league={m.tournamentLeague} size={16} />
                        <ShellLink to={tournamentPath(m.tournamentId)} className="entity-link">
                          {m.tournament}
                        </ShellLink>
                      </span>
                    </td>
                    <td>{formatGameDate(m.date)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function PlayerAnalysisMatchHistory({
  player,
  players,
  role,
  gameCatalog,
}: {
  player: Player
  players: Player[]
  role: RoleKey
  gameCatalog: Parameters<typeof resolveGameOpponent>[3]
}) {
  const metrics = useMemo(() => roleMatchHistoryMetrics(role), [role])
  const cohort = useMemo(() => playersForRole(players, role), [players, role])
  const sorted = useMemo(
    () => [...(player.gameLog ?? [])].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [player.gameLog],
  )

  return (
    <section className="card">
      <h3 className="card-title">Match History</h3>
      <p className="card-subtitle">Same game log as the player identity page (active filters).</p>
      {sorted.length === 0 ? (
        <p className="text-secondary text-sm">No games in the current filter.</p>
      ) : (
        <div className="entity-table-wrap">
          <table className="entity-table entity-table-compact">
            <thead>
              <tr>
                <th>Date</th>
                <th>Champion</th>
                <th>Result</th>
                <th>Side</th>
                <th>Opponent</th>
                <th>Against</th>
                {metrics.map((m) => (
                  <th key={m.key}>{m.shortLabel}</th>
                ))}
                <th>K/D/A</th>
                <th>Perf</th>
                <th>Tournament</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 20).map((g, i) => {
                const opponent = resolveGameOpponent(g, player.team, players, gameCatalog)
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
                    <td>
                      {laneOpponent ? <EntityLink type="player" name={laneOpponent} /> : '—'}
                    </td>
                    {metrics.map((m) => (
                      <td key={m.key}>{formatGameLogMetric(g, m.key, cohort, m.format)}</td>
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
      )}
    </section>
  )
}

export default function PredictionAnalysisTab() {
  const { catalog, filteredPlayers, filteredTeams, filteredChampions, data } = useDashboard()
  const [index, setIndex] = useState<EntitySearchEntry[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<EntitySearchEntry | null>(null)

  useEffect(() => {
    if (!catalog) return
    void buildEntitySearchIndex(catalog).then(setIndex)
  }, [catalog])

  const results = useMemo(() => searchEntities(index, query).slice(0, 12), [index, query])

  const teams = useMemo(() => filteredTeams.filter(isTier1Team), [filteredTeams])
  const players = useMemo(
    () => filteredPlayers.filter((p) => isTier1Player(p) && isDisplayablePlayer(p)),
    [filteredPlayers],
  )
  const allPlayers = useMemo(
    () => (data?.players ?? []).filter((p) => isTier1Player(p) && isDisplayablePlayer(p)),
    [data?.players],
  )

  const team = useMemo(() => {
    if (selected?.type !== 'team') return null
    return (
      teams.find((t) => teamMatchesCanonical(t.name, selected.label)) ??
      (data?.teams ?? []).find((t) => teamMatchesCanonical(t.name, selected.label)) ??
      null
    )
  }, [selected, teams, data?.teams])

  const player = useMemo(() => {
    if (selected?.type !== 'player') return null
    const lower = selected.label.toLowerCase()
    return (
      players.find((p) => p.name.toLowerCase() === lower) ??
      allPlayers.find((p) => p.name.toLowerCase() === lower) ??
      null
    )
  }, [selected, players, allPlayers])

  const championEntry = useMemo(() => {
    if (selected?.type !== 'champion') return null
    const displayable = filteredChampions.filter(isDisplayableChampion)
    const scored = computeOpScores(displayable, 1).all
    return scored.find((e) => e.champion.name.toLowerCase() === selected.label.toLowerCase()) ?? null
  }, [selected, filteredChampions])

  const gameToSeries = useMemo(
    () => (data ? buildGameToSeriesMap(data) : new Map<string, string>()),
    [data],
  )

  const teamLastDate = useMemo(
    () => (team ? teamLastGameDate(players.length ? players : allPlayers, team.name) : null),
    [team, players, allPlayers],
  )

  const playerRole = useMemo(
    () => (player ? (normalizePosition(player.position) ?? 'mid') : 'mid') as RoleKey,
    [player],
  )

  const playerRecent = useMemo(
    () => (player ? playerFromRecentForm(player) : null),
    [player],
  )

  const playerCohort = useMemo(() => {
    const pool = players.length ? players : allPlayers
    return playersForRole(pool, playerRole)
  }, [players, allPlayers, playerRole])

  const teamRoster = useMemo(() => {
    if (!team || !data) return []
    const pool = players.length ? players : allPlayers
    const teamPlayers = pool.filter((p) => teamMatchesCanonical(p.team, team.name))
    const roleOrder = new Map<RoleKey, number>([
      ['top', 0],
      ['jungle', 1],
      ['mid', 2],
      ['adc', 3],
      ['support', 4],
    ])
    const depth = getTeamRosterDepth(team.name, data.rosterDepth ?? [], teamPlayers)
    if (depth.starters.length > 0 && (data.rosterDepth?.length ?? 0) > 0) {
      return depth.starters.map((s) => {
        const role = normalizePosition(s.position) ?? 'mid'
        const hit = teamPlayers.find(
          (p) =>
            p.name.toLowerCase() === s.name.toLowerCase() &&
            normalizePosition(p.position) === role,
        )
        return {
          player: hit,
          name: s.name,
          position: s.position,
          games: s.games,
          isSub: false,
        }
      })
    }
    return teamPlayers
      .sort((a, b) => {
        const ra = normalizePosition(a.position)
        const rb = normalizePosition(b.position)
        return (roleOrder.get(ra ?? 'mid') ?? 99) - (roleOrder.get(rb ?? 'mid') ?? 99)
      })
      .map((p) => ({
        player: p,
        name: p.name,
        position: p.position,
        games: p.games,
        isSub: false,
      }))
  }, [team, data, players, allPlayers])

  const rosterForRadars = useMemo(() => {
    if (!teamRoster.length) return []
    return teamRoster.map((row) => {
      if (!row.player) return row
      const recent = playerFromRecentForm(row.player)
      return { ...row, player: recent.player }
    })
  }, [teamRoster])

  return (
    <div className="predictions-analysis-tab">
      <ScoreCaveat label="model analysis vs filter form" />
      <p className="card-subtitle">
        Search a player, team, or champion for nucky model current-strength outlook, recent-form
        radars (last ~{RECENT_FORM_MAX_GAMES} games / {RECENT_FORM_MAX_DAYS}d), trends, and match
        history.
      </p>

      <div className="predictions-analysis-search">
        <input
          type="search"
          className="entity-search-input predictions-analysis-input"
          placeholder="search player, team, or champion…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(null)
          }}
          aria-label="Search entities for model analysis"
        />
        {query.trim() && !selected && results.length > 0 ? (
          <ul className="predictions-analysis-results" role="listbox">
            {results.map((entry) => (
              <li key={`${entry.type}-${entry.slug}`}>
                <button
                  type="button"
                  className="predictions-analysis-result"
                  onClick={() => {
                    setSelected(entry)
                    setQuery(entry.label)
                  }}
                >
                  {entry.type === 'champion' ? (
                    <ChampionIcon name={entry.label} size={18} />
                  ) : entry.type === 'team' ? (
                    <TeamLogo name={entry.label} size={18} />
                  ) : null}
                  <span>{entry.label}</span>
                  <span className="text-secondary text-sm">{entry.type}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!selected ? (
        <p className="text-secondary text-sm">pick an entity to load model outlook.</p>
      ) : selected.type === 'team' && team ? (
        <div className="predictions-analysis-stack">
          <TeamModelCard team={team} lastGameDate={teamLastDate} />
          <div className="overview-grid overview-grid-2">
            <TeamRadarChart team={team} cohort={teams} highlighted compact />
            <TeamStatTrends
              players={players.length ? players : allPlayers}
              teamSlugOrName={team.name}
            />
          </div>
          <TeamRosterRadars
            roster={rosterForRadars}
            players={(players.length ? players : allPlayers).map((p) => playerFromRecentForm(p).player)}
          />
          <TeamAnalysisMatchHistory
            players={players.length ? players : allPlayers}
            team={team}
            gameCatalog={data?.gameCatalog}
            gameToSeries={gameToSeries}
          />
          <p className="text-secondary text-sm">
            Full identity page:{' '}
            <EntityLink type="team" name={team.name} showIcon={false} />
          </p>
        </div>
      ) : selected.type === 'player' && player && playerRecent ? (
        <div className="predictions-analysis-stack">
          <PlayerModelCard player={player} role={playerRole} showFallback />
          <AnalysisStaleNote
            daysSinceLastGame={playerRecent.daysSinceLastGame}
            gamesUsed={playerRecent.gamesUsed}
            isThinSample={playerRecent.isThinSample}
            isStale={playerRecent.isStale}
          />
          <div className="overview-grid overview-grid-2">
            <div className="player-radar-stack">
              <p className="card-subtitle mb-1">
                Recent-form radar · {playerRecent.gamesUsed}g in window
              </p>
              <PlayerRadarChart
                player={playerRecent.player}
                role={playerRole}
                cohort={playerCohort.map((p) => playerFromRecentForm(p).player)}
                hideHeader
              />
            </div>
            <PlayerFormChart players={[player]} cohortPlayers={playerCohort} />
          </div>
          <PlayerAnalysisMatchHistory
            player={player}
            players={players.length ? players : allPlayers}
            role={playerRole}
            gameCatalog={data?.gameCatalog}
          />
          <p className="text-secondary text-sm">
            Full identity page:{' '}
            <EntityLink type="player" name={player.name} showIcon={false} />
          </p>
        </div>
      ) : selected.type === 'champion' && championEntry ? (
        <div className="predictions-analysis-stack">
          <div className="card">
            <h3 className="card-title">
              <ChampionIcon name={championEntry.champion.name} size={28} />{' '}
              {championEntry.champion.name}
            </h3>
            <p className="card-subtitle" title={OP_SCORE_HINT}>
              OP score in the current dashboard slice (presence / WR / ban / KDA composite) — not the
              same as weekly Champion of the Week when filters differ.
            </p>
            <div className="predictions-champ-metrics">
              <div>
                <span className="text-secondary text-sm">OP /100</span>
                <p className="text-accent font-mono text-2xl">
                  {formatNum(opScoreTo100(championEntry.opScore), 1)}
                </p>
              </div>
              <div>
                <span className="text-secondary text-sm">presence</span>
                <p>{formatPct(championEntry.champion.presence, 1)}</p>
              </div>
              <div>
                <span className="text-secondary text-sm">winrate</span>
                <p>{formatPct(championEntry.champion.winrate, 1)}</p>
              </div>
              <div>
                <span className="text-secondary text-sm">picks</span>
                <p>{championEntry.champion.picks}</p>
              </div>
            </div>
          </div>
          <ChampionMatchHistoryTable
            championName={championEntry.champion.name}
            players={players.length ? players : allPlayers}
            data={data}
            limit={30}
          />
          <p className="text-secondary text-sm">
            Full identity page:{' '}
            <EntityLink type="champion" name={championEntry.champion.name} showIcon={false} />
          </p>
        </div>
      ) : (
        <p className="text-secondary text-sm">
          no outlook for {selected.label} in the current data slice. Try widening LEAGUE/YEAR/SPLIT
          filters.
        </p>
      )}
    </div>
  )
}
