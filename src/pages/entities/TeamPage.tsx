import { useCallback, useMemo, useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
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
} from '../../lib/entities'
import { isDisplayableTeam } from '../../lib/teamAnalytics'
import { isDisplayablePlayer, normalizePosition, ROLES, type RoleKey } from '../../lib/playerRadar'
import { getTeamRosterDepth } from '../../lib/mergeSlices'
import type { Player } from '../../hooks/useDashboardData'
import { fetchTeamUpcomingSchedule, type EsportsScheduleRow } from '../../lib/loadEsportsSchedules'
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
import { roleLabel } from '../../lib/championAnalytics'

export default function TeamPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [activeTab, setActiveTab] = useState<TeamPageTab>('stats')
  const [upcomingSchedule, setUpcomingSchedule] = useState<EsportsScheduleRow[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSource, setScheduleSource] = useState<'loaded' | 'empty' | 'unavailable'>('unavailable')

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
      team ? buildTeamMatchHistory(players, slug, undefined, filterLeague, filterSplit) : [],
    [players, team, slug, filterLeague, filterSplit],
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
    () => (team ? buildTeamGoldGraph(players, slug) : []),
    [players, team, slug],
  )

  const topOpponents = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of matchHistory) {
      counts.set(m.opponent, (counts.get(m.opponent) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [matchHistory])

  useEffect(() => {
    if (!team || activeTab !== 'schedule') return
    let cancelled = false
    setScheduleLoading(true)
    void fetchTeamUpcomingSchedule(team.name, { league: team.league, limit: 12 }).then((rows) => {
      if (cancelled) return
      setUpcomingSchedule(rows)
      setScheduleSource(rows.length ? 'loaded' : 'empty')
      setScheduleLoading(false)
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
        <Link to="/teams" className="entity-back-link">
          ← Teams
        </Link>
      </div>
    )
  }

  return (
    <div className="page-section entity-page">
      {filterBar}
      <TeamSubnav active={activeTab} onChange={setActiveTab} />

      <Link to="/teams" className="entity-back-link">
        ← Teams
      </Link>

      <header className="entity-header">
        <div>
          <h1 className="page-title entity-title-row">
            <TeamLogo name={team.name} size={32} />
            {team.name}
          </h1>
          <p className="entity-subtitle">
            <LeagueLogo league={team.league} size={20} />
            {team.league}
          </p>
        </div>
        <div className="entity-stat-row">
          <div className="stat-tile">
            <div className="stat-value">{formatPct(team.winrate, 1)}</div>
            <div className="stat-label">Winrate</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">
              {team.wins}-{team.losses}
            </div>
            <div className="stat-label">Record</div>
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
                          {p ? `${p.gd15 > 0 ? '+' : ''}${formatNum(p.gd15, 1)}` : '—'}
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
                      <th>Split</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingSchedule.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.scheduled_at
                            ? formatProfileDate(row.scheduled_at)
                            : 'TBD'}
                        </td>
                        <td>
                          <EntityLink type="team" name={row.team_a} /> vs{' '}
                          <EntityLink type="team" name={row.team_b} />
                        </td>
                        <td className="text-secondary">{row.split || row.league}</td>
                        <td className="text-secondary">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-secondary text-sm">
                No upcoming fixtures in the schedule database for {team.name}. Schedule rows sync from
                Liquipedia when the esports_schedules indexer runs — check back after the next sync.
              </p>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">Match History</h3>
            <div className="entity-table-wrap">
              <table className="entity-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opponent</th>
                    <th>Result</th>
                    <th>Tournament</th>
                  </tr>
                </thead>
                <tbody>
                  {matchHistory.map((m, i) => (
                    <tr key={`${m.date}-${i}`}>
                      <td>{formatGameDate(m.date)}</td>
                      <td>
                        <EntityLink type="team" name={m.opponent} />
                      </td>
                      <td className={m.result === 'W' ? 'text-accent' : 'text-secondary'}>
                        {m.result}
                      </td>
                      <td>{m.tournament}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'gold' && <TeamGoldGraph games={goldGraphGames} />}
    </div>
  )
}
