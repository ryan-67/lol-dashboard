import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import ShellLink from '../../components/shell/ShellLink'
import { useEntityPageData } from '../../hooks/useEntityPageData'
import {
  findChampionBySlug,
  championHasData,
  topPlayersOnChampion,
  computeChampionPriorityScore,
  rolesForChampionFromPlayers,
  bestChampionCombos,
} from '../../lib/entities'
import {
  getBanRate,
  getPickRate,
  getPresence,
  isDisplayableChampion,
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
  ChampionEntityInline,
} from '../../components/entities'
import ChampionLaneMatchups from '../../components/entities/ChampionLaneMatchups'
import ChampionMatchHistoryTable from '../../components/champions/ChampionMatchHistoryTable'
import KpiTile from '../../components/ui/KpiTile'

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
    catalogSplits,
  } = useEntityPageData(hasData)

  const champions = useMemo(
    () => (data?.champions ?? []).filter(isDisplayableChampion),
    [data],
  )
  const teams = data?.teams ?? []
  const players = useMemo(() => (data?.players ?? []).filter(isDisplayablePlayer), [data])
  const totalGames = useMemo(() => totalGamesInCohort(teams), [teams])

  const champion = useMemo(() => findChampionBySlug(champions, slug), [champions, slug])
  const roles = useMemo(
    () => (champion ? rolesForChampionFromPlayers(players, champion.name) : []),
    [champion, players],
  )
  const topPlayers = useMemo(
    () => (champion ? topPlayersOnChampion(players, champion.name) : []),
    [champion, players],
  )
  const bestCombos = useMemo(
    () => (champion ? bestChampionCombos(players, champion.name) : []),
    [champion, players],
  )
  const priorityScore = useMemo(
    () =>
      champion && data
        ? computeChampionPriorityScore(champion.name, data.teamChampions ?? [], teams)
        : null,
    [champion, data, teams],
  )

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
        <div className="empty-state">Loading champion…</div>
      </div>
    )
  }

  if (!champion) {
    return (
      <div className="page-section entity-page">
        {filterBar}
        <div className="empty-state">Champion not found for this filter.</div>
        <ShellLink to="/champions" className="entity-back-link">
          ← Champions
        </ShellLink>
      </div>
    )
  }

  const pickRate = getPickRate(champion, totalGames)
  const banRate = getBanRate(champion, totalGames)
  const presence = getPresence(champion, totalGames)
  const roleSubtitle =
    roles.length > 0 ? roles.map((r) => roleLabel(r)).join(' · ') : roleLabel('mid')

  return (
    <div className="page-section entity-page">
      {filterBar}

      <ShellLink to="/champions" className="entity-back-link">
        ← Champions
      </ShellLink>

      <header className="entity-hero">
        <div>
          <p className="page-header-eyebrow">champion</p>
          <h1 className="entity-hero-name entity-title-row">
            <ChampionIcon name={champion.name} size={40} />
            {champion.name}
          </h1>
          <p className="entity-hero-meta entity-subtitle">{roleSubtitle}</p>
        </div>
        <div className="dash-kpi-grid" style={{ marginBottom: 0 }}>
          <KpiTile label="Presence" value={presence} decimals={1} suffix="%" />
          <KpiTile label="Pick" value={pickRate} decimals={1} suffix="%" />
          <KpiTile label="Ban" value={banRate} decimals={1} suffix="%" />
          <KpiTile label="Winrate" value={champion.winrate} decimals={1} suffix="%" />
          <KpiTile
            label="Priority"
            display={priorityScore != null ? undefined : '—'}
            value={priorityScore ?? undefined}
            decimals={1}
            accent
          />
        </div>
      </header>

      <ChampionTrendCharts champion={champion} totalGames={totalGames} />

      <ChampionLaneMatchups championName={champion.name} players={players} />

      <div className="card">
        <h3 className="card-title">Best Players on {champion.name}</h3>
        <div className="entity-table-wrap">
          <table className="entity-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Games</th>
                <th>Winrate</th>
                <th>Perf Score</th>
              </tr>
            </thead>
            <tbody>
              {topPlayers.map(({ player, games, winrate, perfScore }) => (
                <tr key={`${player.name}|${player.team}`}>
                  <td>
                    <EntityLink
                      type="player"
                      name={player.name}
                      player={player}
                      allPlayers={players}
                      showIcon={false}
                    />
                  </td>
                  <td>
                    <EntityLink type="team" name={player.team} />
                  </td>
                  <td>{games}</td>
                  <td>{formatPct(winrate, 1)}</td>
                  <td>{formatNum(perfScore * 100, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {bestCombos.length > 0 && (
        <div className="card">
          <h3 className="card-title">Best Combos</h3>
          <p className="card-subtitle">
            Highest winrate draft partners with {champion.name} (min 3 games, above 50% WR)
          </p>
          <ul className="entity-champ-combo-list">
            {bestCombos.map((combo) => (
              <li key={combo.partner} className="entity-champ-combo-row">
                <ChampionEntityInline name={champion.name} iconSize={22} />
                <span className="text-secondary">+</span>
                <ChampionEntityInline name={combo.partner} iconSize={22} />
                <span className="text-accent">{formatPct(combo.winrate, 1)}</span>
                <span className="text-secondary text-xs">
                  {combo.wins}-{combo.games - combo.wins} · {combo.games}g
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
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

      <ChampionMatchHistoryTable
        championName={champion.name}
        players={players}
        data={data}
        limit={50}
      />
    </div>
  )
}
