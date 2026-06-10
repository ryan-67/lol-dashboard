import { useCallback, useMemo } from 'react'
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
} from '../../lib/entities'
import { isDisplayableTeam } from '../../lib/teamAnalytics'
import { isDisplayablePlayer, normalizePosition, ROLES } from '../../lib/playerRadar'
import { playerKey } from '../../lib/playerAnalytics'
import { formatNum, formatPct } from '../../lib/format'
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
import TeamObjectiveProfile from '../../components/entities/TeamObjectiveProfile'
import { roleLabel } from '../../lib/championAnalytics'
import type { RoleKey } from '../../lib/playerRadar'

export default function TeamPage() {
  const { slug = '' } = useParams<{ slug: string }>()

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
  const filterSplit = filters.split || undefined

  const teams = useMemo(() => (data?.teams ?? []).filter(isDisplayableTeam), [data])
  const team = useMemo(() => mergeTeamsByCanonical(teams, slug), [teams, slug])
  const players = useMemo(() => (data?.players ?? []).filter(isDisplayablePlayer), [data])

  const roster = useMemo(() => {
    if (!team) return []
    const roleOrder = new Map(ROLES.map((role, index) => [role, index]))
    return players
      .filter((p) => teamMatchesCanonical(p.team, slug))
      .sort((a, b) => {
        const ra = normalizePosition(a.position)
        const rb = normalizePosition(b.position)
        const oa = ra !== null ? (roleOrder.get(ra) ?? 99) : 99
        const ob = rb !== null ? (roleOrder.get(rb) ?? 99) : 99
        if (oa !== ob) return oa - ob
        return a.name.localeCompare(b.name)
      })
  }, [players, team, slug])

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

  const topOpponents = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of matchHistory) {
      counts.set(m.opponent, (counts.get(m.opponent) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [matchHistory])

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
          <div className="stat-tile">
            <div className="stat-value">{formatNum(team.avgGd15, 1)}</div>
            <div className="stat-label">GD@15</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatNum(team.avgKda, 2)}</div>
            <div className="stat-label">KDA</div>
          </div>
        </div>
      </header>

      <TeamRadarChart team={team} cohort={teams} highlighted />

      <TeamObjectiveProfile team={team} />

      <div className="overview-grid overview-grid-2">
        <TeamSideWinrates sides={sides} />
        <TeamTrendChart points={trend} />
      </div>

      {topOpponents.length > 0 && (
        <div className="card page-section">
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

      <div className="card page-section">
        <h3 className="card-title">Upcoming Schedule</h3>
        <p className="text-secondary text-sm">
          Schedule integration coming soon — check back after esports_schedules sync.
        </p>
      </div>

      <div className="card page-section">
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
                  <td>{m.date}</td>
                  <td>
                    <EntityLink type="team" name={m.opponent} />
                  </td>
                  <td className={m.result === 'W' ? 'text-accent' : 'text-secondary'}>{m.result}</td>
                  <td>{m.tournament}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card page-section">
        <h3 className="card-title">Roster</h3>
        <div className="entity-table-wrap">
          <table className="entity-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Role</th>
                <th>Games</th>
                <th>KDA</th>
                <th>GD@15</th>
                <th>Champ Pool</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={playerKey(p)}>
                  <td>
                    <EntityLink
                      type="player"
                      name={p.name}
                      player={p}
                      allPlayers={players}
                      showIcon={false}
                    />
                  </td>
                  <td>{p.position.toUpperCase()}</td>
                  <td>{p.games}</td>
                  <td>{formatNum(p.kda, 2)}</td>
                  <td>
                    {p.gd15 > 0 ? '+' : ''}
                    {formatNum(p.gd15, 1)}
                  </td>
                  <td>
                    <div className="entity-champ-pool">
                      {playerChampionIcons(p).map((champ) => (
                        <ChampionIcon key={champ} name={champ} size={20} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {priorityByRole && (
        <div className="page-section">
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
    </div>
  )
}
