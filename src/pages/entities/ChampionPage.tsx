import { useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useEntityPageData } from '../../hooks/useEntityPageData'
import {
  findChampionBySlug,
  championHasData,
  topPlayersOnChampion,
} from '../../lib/entities'
import {
  getBanRate,
  getPickRate,
  getPresence,
  isDisplayableChampion,
  roleForChampion,
  roleLabel,
  totalGamesInCohort,
} from '../../lib/championAnalytics'
import { isDisplayablePlayer } from '../../lib/playerRadar'
import { formatNum, formatPct } from '../../lib/format'
import {
  EntityFilterBar,
  EntityLink,
  ChampionIcon,
  ChampionTrendCharts,
} from '../../components/entities'
import { PresenceBarChart } from '../../components/champions'

export default function ChampionPage() {
  const { slug = '' } = useParams<{ slug: string }>()

  const hasData = useCallback(
    (data: Parameters<typeof championHasData>[0]) => championHasData(data, slug),
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

  const champions = useMemo(
    () => (data?.champions ?? []).filter(isDisplayableChampion),
    [data],
  )
  const teams = data?.teams ?? []
  const players = useMemo(() => (data?.players ?? []).filter(isDisplayablePlayer), [data])
  const totalGames = useMemo(() => totalGamesInCohort(teams), [teams])

  const champion = useMemo(() => findChampionBySlug(champions, slug), [champions, slug])
  const role = champion ? roleForChampion(champion) : 'mid'
  const topPlayers = useMemo(
    () => (champion ? topPlayersOnChampion(players, champion.name) : []),
    [champion, players],
  )

  if (loading) return <div className="empty-state">Loading champion…</div>

  if (!champion) {
    return (
      <div className="page-section">
        <div className="empty-state">Champion not found for this filter.</div>
        <Link to="/champions" className="entity-back-link">
          ← Back to Champions
        </Link>
      </div>
    )
  }

  const pickRate = getPickRate(champion, totalGames)
  const banRate = getBanRate(champion, totalGames)
  const presence = getPresence(champion, totalGames)

  return (
    <div className="page-section entity-page">
      <Link to="/champions" className="entity-back-link">
        ← Champions
      </Link>

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

      <header className="entity-header">
        <div>
          <h1 className="page-title entity-title-row">
            <ChampionIcon name={champion.name} size={40} />
            {champion.name}
          </h1>
          <p className="entity-subtitle">{roleLabel(role)}</p>
        </div>
        <div className="entity-stat-row">
          <div className="stat-tile">
            <div className="stat-value">{formatPct(presence, 1)}</div>
            <div className="stat-label">Presence</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatPct(pickRate, 1)}</div>
            <div className="stat-label">Pick Rate</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatPct(banRate, 1)}</div>
            <div className="stat-label">Ban Rate</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatPct(champion.winrate, 1)}</div>
            <div className="stat-label">Winrate</div>
          </div>
        </div>
      </header>

      <ChampionTrendCharts champion={champion} totalGames={totalGames} />

      <PresenceBarChart champions={[champion]} />

      <div className="card page-section">
        <h3 className="card-title">Best Players on {champion.name}</h3>
        <div className="entity-table-wrap">
          <table className="entity-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Games</th>
                <th>Winrate</th>
              </tr>
            </thead>
            <tbody>
              {topPlayers.map(({ player, games, winrate }) => (
                <tr key={`${player.name}|${player.team}`}>
                  <td>
                    <EntityLink type="player" name={player.name} player={player} allPlayers={players} showIcon={false} />
                  </td>
                  <td>
                    <EntityLink type="team" name={player.team} />
                  </td>
                  <td>{games}</td>
                  <td>{formatPct(winrate, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card page-section">
        <h3 className="card-title">Combat Profile</h3>
        <div className="entity-stat-row">
          <div className="stat-tile">
            <div className="stat-value">{formatNum(champion.avgKda, 2)}</div>
            <div className="stat-label">Avg KDA</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatNum(champion.avgDpm ?? 0, 0)}</div>
            <div className="stat-label">DPM</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatNum(champion.avgCsd15 ?? 0, 1)}</div>
            <div className="stat-label">CS@15</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{champion.picks}</div>
            <div className="stat-label">Picks</div>
          </div>
        </div>
      </div>
    </div>
  )
}
