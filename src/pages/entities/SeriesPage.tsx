import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import {
  buildTeamsForSeries,
  filterPlayersForSeries,
} from '../../lib/seriesAnalytics'
import { isDisplayablePlayer } from '../../lib/playerRadar'
import { isDisplayableTeam } from '../../lib/teamAnalytics'
import { decodeSeriesIdParam } from '../../lib/seriesPath'
import { useSeriesPageData } from '../../hooks/useSeriesPageData'
import { fetchSeriesRecapById } from '../../lib/loadWeeklyRecap'
import { fetchCitoGoldForSeries } from '../../lib/loadCitoGold'
import type { CitoGameGoldRecord } from '../../lib/citoGoldMatch'
import { fetchGolGoldCache } from '../../lib/loadGolGold'
import type { GolGameGoldRecord } from '../../lib/golGoldMatch'
import { recapLineToText, type WeeklyRecapLine } from '../../lib/weeklyRecap'
import { recapTeamTag } from '../../lib/recapTeamTag'
import { formatGameDate } from '../../lib/format'
import { scrollEntranceStagger } from '../../theme/animations'
import { resolveTournamentDisplay, parseCanonicalSplit } from '../../lib/tournamentCatalog'
import SeriesSubnav, { type SeriesPageTab } from '../../components/series/SeriesSubnav'
import SeriesDraftSummary from '../../components/series/SeriesDraftSummary'
import SeriesRoleComparison from '../../components/series/SeriesRoleComparison'
import SeriesGamePanel from '../../components/series/SeriesGamePanel'
import { EntityLink, TeamLogo, LeagueLogo } from '../../components/entities'
import TeamComparisonRadar from '../../components/teams/TeamComparisonRadar'
import TeamComparisonStatsChart from '../../components/teams/TeamComparisonStatsChart'
import SeriesShareCharts from '../../components/series/SeriesShareCharts'
import { buildSeriesDistributionRows } from '../../lib/seriesGameInsights'
import WeeklyRecap from '../../components/overview/WeeklyRecap'

export default function SeriesPage() {
  const { seriesId: seriesIdParam = '' } = useParams<{ seriesId: string }>()
  const seriesId = decodeSeriesIdParam(seriesIdParam)
  const [activeTab, setActiveTab] = useState<SeriesPageTab>('overview')
  const [recapLine, setRecapLine] = useState<WeeklyRecapLine | null>(null)
  const [recapLoading, setRecapLoading] = useState(true)
  const [citoGoldRows, setCitoGoldRows] = useState<CitoGameGoldRecord[]>([])
  const [golGoldRows, setGolGoldRows] = useState<GolGameGoldRecord[]>([])
  const [citoGoldLoading, setCitoGoldLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data, cohortData, series, loading, fallbackNotice } = useSeriesPageData(seriesId)

  const cohortPlayers = useMemo(
    () => (cohortData?.players ?? []).filter(isDisplayablePlayer),
    [cohortData?.players],
  )

  const cohortTeams = useMemo(
    () => (cohortData?.teams ?? []).filter(isDisplayableTeam),
    [cohortData?.teams],
  )

  const scopedPlayers = useMemo(
    () => (series ? filterPlayersForSeries(data?.players ?? [], series) : []),
    [data?.players, series],
  )

  const scopedTeams = useMemo(
    () =>
      series && data
        ? buildTeamsForSeries(data.teams ?? [], scopedPlayers, series, citoGoldRows)
        : [],
    [data, scopedPlayers, series, citoGoldRows],
  )

  const seriesShareRows = useMemo(
    () => (series ? buildSeriesDistributionRows(scopedPlayers, series) : []),
    [scopedPlayers, series],
  )

  useEffect(() => {
    if (!series) {
      setCitoGoldRows([])
      setGolGoldRows([])
      return
    }
    let cancelled = false
    const dates = series.games.map((g) => g.date).filter(Boolean)
    const oeGameIds = series.games.map((g) => g.id).filter(Boolean)
    setCitoGoldLoading(true)
    void Promise.all([
      fetchCitoGoldForSeries(series.teamA, series.teamB, dates, oeGameIds),
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
  }, [series])

  const tournamentLabel = useMemo(() => {
    if (!series) return ''
    return resolveTournamentDisplay(series.league, series.split, series.playoffs)
  }, [series])

  const seriesLeagueForLogo = useMemo(() => {
    if (!series) return ''
    const { season } = parseCanonicalSplit(series.split ?? '')
    if (season === 'MSI' || season === 'Worlds' || season === 'First Stand') return season
    return series.league
  }, [series])

  useEffect(() => {
    if (!series) return
    let cancelled = false
    setRecapLoading(true)
    void fetchSeriesRecapById(series.seriesId).then((line) => {
      if (cancelled) return
      if (line) {
        setRecapLine(line)
      } else {
        const domWins = Math.max(series.winsA, series.winsB)
        const vicWins = Math.min(series.winsA, series.winsB)
        setRecapLine({
          id: series.seriesId,
          date: series.lastDate,
          dateLabel: formatGameDate(series.lastDate),
          segments: [
            { kind: 'team', canonicalName: series.winner, label: recapTeamTag(series.winner) },
            { kind: 'text', value: ' beat ' },
            { kind: 'team', canonicalName: series.loser, label: recapTeamTag(series.loser) },
            {
              kind: 'text',
              value: ` ${domWins}-${vicWins} in ${tournamentLabel}.`,
            },
          ],
          score: {
            winner: series.winner,
            loser: series.loser,
            winnerAbbr: recapTeamTag(series.winner),
            loserAbbr: recapTeamTag(series.loser),
            score: `${domWins}-${vicWins}`,
            tournamentLabel,
          },
        })
      }
      setRecapLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [series, tournamentLabel])

  useGSAP(
    () => {
      scrollEntranceStagger(ref.current, '.series-card')
    },
    { scope: ref, dependencies: [activeTab, seriesId, scopedPlayers.length] },
  )

  const activeGame = useMemo(() => {
    if (!series || !activeTab.startsWith('game-')) return null
    const n = Number(activeTab.replace('game-', ''))
    return series.games[n - 1] ?? null
  }, [series, activeTab])

  if (loading && !data) {
    return <div className="empty-state">Loading series…</div>
  }

  if (!series) {
    return (
      <div className="page-section entity-page">
        <div className="empty-state">{fallbackNotice ?? 'Series not found.'}</div>
        <Link to="/tournaments" className="entity-back-link">
          ← Tournaments
        </Link>
      </div>
    )
  }

  const recapLines = recapLine ? [recapLine] : []

  return (
    <div ref={ref} className="page-section entity-page series-page">
      {fallbackNotice ? (
        <p className="card-subtitle mb-4 text-secondary">{fallbackNotice}</p>
      ) : null}

      <SeriesSubnav
        gameCount={series.games.length}
        active={activeTab}
        onChange={setActiveTab}
      />

      <header className="entity-header">
        <div>
          <h1 className="page-title series-page-title">
            <EntityLink type="team" name={series.teamA} showIcon={false}>
              {recapTeamTag(series.teamA)}
            </EntityLink>
            <span className="series-page-vs">vs</span>
            <EntityLink type="team" name={series.teamB} showIcon={false}>
              {recapTeamTag(series.teamB)}
            </EntityLink>
          </h1>
          <p className="entity-subtitle entity-title-row">
            <LeagueLogo league={seriesLeagueForLogo} size={20} />
            {tournamentLabel} · {series.scoreLabel} · {formatGameDate(series.lastDate)}
            {series.patch && series.patch !== '—' ? ` · Patch ${series.patch}` : ''}
          </p>
        </div>
        <div className="series-page-logos">
          <TeamLogo name={series.teamA} size={40} />
          <span className="series-page-score text-accent">{series.scoreLabel}</span>
          <TeamLogo name={series.teamB} size={40} />
        </div>
      </header>

      {activeTab === 'overview' && (
        <>
          <section className="card series-card">
            <h2 className="card-title">Series Recap</h2>
            {recapLoading ? (
              <p className="text-secondary">Loading recap…</p>
            ) : recapLines.length ? (
              <WeeklyRecap
                lines={recapLines}
                players={scopedPlayers}
                champions={data?.champions ?? []}
                title=""
                showSeriesLink={false}
              />
            ) : (
              <p className="text-secondary">{recapLineToText(recapLines[0]!)}</p>
            )}
          </section>

          <section className="card series-card">
            <h2 className="card-title">Draft Summary</h2>
            <SeriesDraftSummary series={series} />
          </section>

          {scopedTeams.length >= 2 ? (
            <>
              <section className="card series-card">
                <h2 className="card-title">Team Comparison</h2>
                <TeamComparisonRadar teams={scopedTeams} cohort={cohortTeams} embedded />
                <TeamComparisonStatsChart
                  teams={scopedTeams}
                  players={scopedPlayers}
                  variant="series"
                />
              </section>

              {seriesShareRows.length ? (
                <section className="card series-card">
                  <h2 className="card-title">Resource Share</h2>
                  <p className="card-subtitle">Average damage and gold share per player across the series</p>
                  <SeriesShareCharts
                    teamA={series.teamA}
                    teamB={series.teamB}
                    league={series.league}
                    rows={seriesShareRows}
                  />
                </section>
              ) : null}

              <section className="card series-card">
                <h2 className="card-title">Role-by-Role</h2>
                <SeriesRoleComparison
                  series={series}
                  teams={scopedTeams}
                  players={scopedPlayers}
                  cohortPlayers={cohortPlayers}
                />
              </section>
            </>
          ) : null}
        </>
      )}

      {activeGame ? (
        <section className="card series-card">
          <SeriesGamePanel
            series={series}
            game={activeGame}
            players={scopedPlayers}
            cohortPlayers={cohortPlayers}
            citoGoldRows={citoGoldRows}
            golGoldRows={golGoldRows}
            citoGoldLoading={citoGoldLoading}
          />
        </section>
      ) : null}
    </div>
  )
}
