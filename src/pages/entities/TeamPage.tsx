import { useCallback, useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import ShellLink from '../../components/shell/ShellLink'
import { useEntityPageData } from '../../hooks/useEntityPageData'
import {
  mergeTeamsByCanonical,
  buildTeamMatchHistory,
  computeSideWinrates,
  buildTeamTrend,
  priorityChampsByRole,
  playerChampionIcons,
  teamHasData,
  teamMatchesCanonical,
  bestChampionsByRole,
  buildTeamGoldGraph,
  buildTeamObjectivesGraph,
} from '../../lib/entities'
import { isDisplayableTeam } from '../../lib/teamAnalytics'
import { isDisplayablePlayer, normalizePosition, ROLES, type RoleKey } from '../../lib/playerRadar'
import { getTeamRosterDepth } from '../../lib/mergeSlices'
import type { Player } from '../../hooks/useDashboardData'
import { fetchTeamUpcomingCitoSchedule, type CitoScheduleRow } from '../../lib/loadCitoSchedule'
import { buildGameToSeriesMap } from '../../lib/seriesAnalytics'
import { seriesPath } from '../../lib/seriesPath'
import { tournamentPath } from '../../lib/tournamentCatalog'
import { fetchCitoGoldForTeam } from '../../lib/loadCitoGold'
import type { CitoGameGoldRecord } from '../../lib/citoGoldMatch'
import type { GolGameGoldRecord } from '../../lib/golGoldMatch'
import { fetchGolGoldCache } from '../../lib/loadGolGold'
import { formatGameDate, formatNum, formatPct, formatProfileDate } from '../../lib/format'
import TeamRadarChart from '../../components/teams/TeamRadarChart'
import {
  EntityFilterBar,
  EntityLink,
  TeamLogo,
  LeagueLogo,
  TeamSideWinrates,
  TeamTrendChart,
  ChampionIcon,
  ChampionEntityInline,
} from '../../components/entities'
import TeamSubnav, { type TeamPageTab } from '../../components/entities/TeamSubnav'
import { TeamProfileCard, TeamObjectiveChart } from '../../components/entities/TeamObjectiveProfile'
import TeamBestChampionsByRole from '../../components/entities/TeamBestChampionsByRole'
import TeamGoldGraph from '../../components/entities/TeamGoldGraph'
import TeamObjectivesGraph from '../../components/entities/TeamObjectivesGraph'
import { roleLabel } from '../../lib/championAnalytics'

export default function TeamPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [activeTab, setActiveTab] = useState<TeamPageTab>('stats')
  const [upcomingSchedule, setUpcomingSchedule] = useState<CitoScheduleRow[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSource, setScheduleSource] = useState<'loaded' | 'empty' | 'unavailable'>('unavailable')
  const [citoGoldRows, setCitoGoldRows] = useState<CitoGameGoldRecord[]>([])
  const [golGoldRows, setGolGoldRows] = useState<GolGameGoldRecord[]>([])
  const [citoGoldLoading, setCitoGoldLoading] = useState(false)

  const hasData = useCallback(
    (data: Parameters<typeof teamHasData>[0]) => teamHasData(data, slug),
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

  const filterLeague = filters.league === 'All Tier 1' ? undefined : filters.league
  const filterSplit = filters.split === 'ALL' ? undefined : filters.split || undefined

  const teams = useMemo(() => (data?.teams ?? []).filter(isDisplayableTeam), [data])
  const team = useMemo(() => mergeTeamsByCanonical(teams, slug), [teams, slug])
  const players = useMemo(() => (data?.players ?? []).filter(isDisplayablePlayer), [data])

  const roster = useMemo<Array<{ player?: Player; name: string; position: string; games: number; isSub: boolean }>>(() => {
    if (!team) return []
    const roleOrder = new Map(ROLES.map((role, index) => [role, index]))
    const teamPlayers = players.filter((p) => teamMatchesCanonical(p.team, slug))
    const findPlayer = (name: string, role: string) =>
      teamPlayers.find(
        (p) =>
          p.name.toLowerCase() === name.toLowerCase() &&
          normalizePosition(p.position) === role,
      ) ?? teamPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())

    const depth = getTeamRosterDepth(team.name, data?.rosterDepth ?? [], teamPlayers)
    const hasDepth = depth.starters.length > 0 && (data?.rosterDepth?.length ?? 0) > 0

    if (hasDepth) {
      const rows: Array<{ player?: Player; name: string; position: string; games: number; isSub: boolean }> = []
      for (const starter of depth.starters) {
        rows.push({
          player: findPlayer(starter.name, starter.position),
          name: starter.name,
          position: starter.position,
          games: starter.games,
          isSub: false,
        })
        for (const sub of depth.subsByRole[starter.position] ?? []) {
          rows.push({
            player: findPlayer(sub.name, sub.position),
            name: sub.name,
            position: sub.position,
            games: sub.games,
            isSub: true,
          })
        }
      }
      return rows
    }

    return teamPlayers
      .sort((a, b) => {
        const ra = normalizePosition(a.position)
        const rb = normalizePosition(b.position)
        const oa = ra !== null ? (roleOrder.get(ra) ?? 99) : 99
        const ob = rb !== null ? (roleOrder.get(rb) ?? 99) : 99
        if (oa !== ob) return oa - ob
        return a.name.localeCompare(b.name)
      })
      .map((p) => ({ player: p, name: p.name, position: p.position, games: p.games, isSub: false }))
  }, [players, team, slug, data])

  const matchHistory = useMemo(
    () =>
      team
        ? buildTeamMatchHistory(
            players,
            slug,
            undefined,
            filterLeague,
            filterSplit,
            data?.gameCatalog,
          )
        : [],
    [players, team, slug, filterLeague, filterSplit, data?.gameCatalog],
  )
  const gameToSeriesId = useMemo(
    () => (data ? buildGameToSeriesMap(data) : new Map<string, string>()),
    [data],
  )
  const sides = useMemo(() => computeSideWinrates(players, slug), [players, slug])
  const trend = useMemo(
    () => buildTeamTrend(players, slug, 15, filterLeague, filterSplit),
    [players, slug, filterLeague, filterSplit],
  )
  const priorityByRole = useMemo(
    () =>
      team && data
        ? priorityChampsByRole(data.teamChampions ?? [], teams, team.name, players)
        : null,
    [team, data, teams, players],
  )
  const bestByRole = useMemo(
    () => (team ? bestChampionsByRole(players, slug) : null),
    [players, team, slug],
  )
  const goldGraphGames = useMemo(
    () => (team ? buildTeamGoldGraph(players, slug, 30, citoGoldRows, golGoldRows) : []),
    [players, team, slug, citoGoldRows, golGoldRows],
  )
  const objectivesGraphGames = useMemo(
    () => (team ? buildTeamObjectivesGraph(players, slug, citoGoldRows) : []),
    [players, team, slug, citoGoldRows],
  )

  const topOpponents = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of matchHistory) {
      counts.set(m.opponent, (counts.get(m.opponent) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [matchHistory])

  useEffect(() => {
    if (!team || activeTab !== 'gold') return
    let cancelled = false

    const rosterPlayers = players.filter((p) => teamMatchesCanonical(p.team, slug))
    if (!rosterPlayers.length) {
      setCitoGoldRows([])
      setGolGoldRows([])
      setCitoGoldLoading(false)
      return
    }

    const anchor = rosterPlayers.reduce(
      (best, p) => ((p.games ?? 0) > (best.games ?? 0) ? p : best),
      rosterPlayers[0]!,
    )
    const log = anchor?.gameLog ?? []
    const dates = log.map((g) => g.date).filter(Boolean)
    const oeGameIds = log.map((g) => g.gameId).filter((id): id is string => Boolean(id))

    setCitoGoldLoading(true)
    void Promise.all([
      fetchCitoGoldForTeam(slug, dates, oeGameIds),
      fetchGolGoldCache(),
    ]).then(([citoRows, golRows]) => {
      if (cancelled) return
      setCitoGoldRows(citoRows)
      setGolGoldRows(golRows)
      setCitoGoldLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [team, activeTab, players, slug])

  useEffect(() => {
    if (!team || activeTab !== 'schedule') return
    let cancelled = false
    setScheduleLoading(true)
    void fetchTeamUpcomingCitoSchedule(team.name, { limit: 3 })
      .then((rows) => {
        if (cancelled) return
        setUpcomingSchedule(rows)
        setScheduleSource(rows.length ? 'loaded' : 'empty')
      })
      .catch(() => {
        if (!cancelled) {
          setUpcomingSchedule([])
          setScheduleSource('empty')
        }
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [team, activeTab])

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

  if (loading && !data) {
    return (
      <div className="page-section entity-page">
        {filterBar}
        <div className="empty-state">Loading team…</div>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="page-section entity-page">
        {filterBar}
        <div className="empty-state">Team not found for this filter.</div>
        <ShellLink to="/teams" className="entity-back-link">
          ← Teams
        </ShellLink>
      </div>
    )
  }

  return (
    <div className="page-section entity-page">
      {filterBar}
      <TeamSubnav active={activeTab} onChange={setActiveTab} />

      <ShellLink to="/teams" className="entity-back-link">
        ← Teams
      </ShellLink>

      <header className="entity-hero">
        <div>
          <p className="page-header-eyebrow">team</p>
          <h1 className="entity-hero-name entity-title-row">
            <TeamLogo name={team.name} size={32} />
            {team.name}
          </h1>
          <p className="entity-hero-meta entity-subtitle">
            <LeagueLogo league={team.league} size={20} />
            {team.league}
          </p>
        </div>
        <div className="dash-kpi-grid" style={{ marginBottom: 0 }}>
          <div className="dash-kpi">
            <span className="dash-kpi-label">Winrate</span>
            <span className="dash-kpi-value">{formatPct(team.winrate, 1)}</span>
          </div>
          <div className="dash-kpi">
            <span className="dash-kpi-label">Record</span>
            <span className="dash-kpi-value">
              {team.wins}-{team.losses}
            </span>
          </div>
        </div>
      </header>

      {activeTab === 'stats' && (
        <>
          <div className="overview-grid overview-grid-2">
            <TeamRadarChart team={team} cohort={teams} highlighted compact />
            <TeamProfileCard team={team} />
          </div>

          <div className="overview-grid overview-grid-2">
            {bestByRole ? <TeamBestChampionsByRole byRole={bestByRole} /> : null}
            <TeamObjectiveChart team={team} />
          </div>

          <div className="overview-grid overview-grid-2">
            <TeamSideWinrates sides={sides} />
            <TeamTrendChart points={trend} />
          </div>

          <div className="card">
            <h3 className="card-title">Roster</h3>
            <div className="entity-table-wrap">
              <table className="entity-table entity-table-compact">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Role</th>
                    <th>KDA</th>
                    <th>GD@15</th>
                    <th>KP%</th>
                    <th>DMG%</th>
                    <th>GOLD%</th>
                    <th>Champ Pool</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((row) => {
                    const p = row.player
                    return (
                      <tr key={`${row.name}|${row.position}|${row.isSub ? 'sub' : 'starter'}`}>
                        <td>
                          {p ? (
                            <EntityLink
                              type="player"
                              name={row.name}
                              player={p}
                              allPlayers={players}
                              showIcon={false}
                            />
                          ) : (
                            <EntityLink type="player" name={row.name} />
                          )}
                          {row.isSub && (
                            <span className="entity-roster-sub-badge" title={`${row.games} games`}>
                              sub · {row.games}g
                            </span>
                          )}
                        </td>
                        <td>{row.position.toUpperCase()}</td>
                        <td>{p ? formatNum(p.kda, 2) : '—'}</td>
                        <td>
                          {p && typeof p.gd15 === 'number'
                            ? `${p.gd15 > 0 ? '+' : ''}${formatNum(p.gd15, 1)}`
                            : '—'}
                        </td>
                        <td>{p ? formatPct(p.kp, 1) : '—'}</td>
                        <td>{p ? formatPct(p.dmgShare, 1) : '—'}</td>
                        <td>{p ? formatPct(p.goldShare, 1) : '—'}</td>
                        <td>
                          <div className="entity-champ-pool">
                            {p &&
                              playerChampionIcons(p).map((champ) => (
                                <ChampionIcon key={champ} name={champ} size={20} />
                              ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {topOpponents.length > 0 && (
            <div className="card">
              <h3 className="card-title">Head-to-Head</h3>
              <p className="card-subtitle">Recent opponents · open Matchups to compare</p>
              <ul className="entity-h2h-list">
                {topOpponents.map(([opp, n]) => (
                  <li key={opp}>
                    <EntityLink type="team" name={opp} />
                    <span className="text-secondary">{n} recent games</span>
                    <Link
                      to={`/matchups?teamA=${encodeURIComponent(team.name)}&teamB=${encodeURIComponent(opp)}`}
                      className="entity-inline-link"
                    >
                      Compare →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {priorityByRole && (
            <div>
              <h2 className="card-title">Highest Priority Champions by Role</h2>
              <div className="overview-grid overview-grid-2">
                {(['top', 'jungle', 'mid', 'adc', 'support'] as RoleKey[]).map((role) => (
                  <div key={role} className="card" style={{ padding: 'var(--component-gap)' }}>
                    <h3 className="card-title">{roleLabel(role)}</h3>
                    <ul className="entity-priority-list">
                      {(priorityByRole[role] ?? []).map((entry) => (
                        <li key={entry.champion}>
                          <ChampionEntityInline name={entry.champion} iconSize={18} />
                          <span className="text-accent">{entry.priorityScore.toFixed(1)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'schedule' && (
        <>
          <div className="card">
            <h3 className="card-title">Upcoming Schedule</h3>
            {scheduleLoading ? (
              <p className="text-secondary text-sm">Loading schedule…</p>
            ) : scheduleSource === 'loaded' ? (
              <div className="entity-table-wrap">
                <table className="entity-table entity-table-compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Matchup</th>
                      <th>Tournament</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingSchedule.map((row) => (
                      <tr key={row.match_id}>
                        <td>
                          {row.scheduled_at ? formatProfileDate(row.scheduled_at) : 'TBD'}
                        </td>
                        <td>
                          {row.status === 'pending results' ? (
                            <span className="text-secondary">TBD vs TBD</span>
                          ) : (
                            <>
                              <EntityLink type="team" name={row.team_a} /> vs{' '}
                              <EntityLink type="team" name={row.team_b} />
                            </>
                          )}
                        </td>
                        <td className="text-secondary">
                          {row.tournament_name ?? row.block_name ?? row.league}
                        </td>
                        <td className="text-secondary">
                          {row.status === 'tbd' && !row.team_a?.trim() && !row.team_b?.trim()
                            ? 'pending results'
                            : row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-secondary text-sm">
                No upcoming fixtures in schedule database.
              </p>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">Match History</h3>
            <div className="entity-table-wrap">
              <table className="entity-table">
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
                  {matchHistory.map((m, i) => {
                    const seriesId = m.gameId ? gameToSeriesId.get(m.gameId) : undefined
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
          </div>
        </>
      )}

      {activeTab === 'gold' && (
        <>
          {goldGraphGames.length > 0 ? (
            <TeamGoldGraph games={goldGraphGames} loading={citoGoldLoading} />
          ) : null}
          {objectivesGraphGames.length > 0 ? (
            <TeamObjectivesGraph
              games={objectivesGraphGames}
              citoRows={citoGoldRows}
              teamSlugOrName={slug}
              loading={citoGoldLoading}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
