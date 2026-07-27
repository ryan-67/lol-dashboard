import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDashboard } from '../../context/DashboardContext'
import { EntityLink, TeamLogo, ChampionIcon } from '../entities'
import {
  PREDICTION_LEAGUE_FILTERS,
  type PredictionLeagueFilter,
} from '../../lib/predictions/leagueFilter'
import {
  buildPredictionLogRows,
  fetchPredictionHoldoutLog,
  formatLogModelOdds,
  type HoldoutLogFile,
  type PredictionLogRow,
} from '../../lib/predictions/predictionLog'
import {
  fetchRegionStrength,
  type RegionStrengthBundle,
} from '../../lib/loadRegionStrength'
import {
  fetchPlayerRatings,
  type PlayerRatingsBundle,
} from '../../lib/loadPlayerRatings'
import { formatProfileDate, formatNum } from '../../lib/format'
import { shellAwarePath } from '../../lib/shellPath'
import { seriesPath } from '../../lib/seriesPath'

function seriesHref(seriesId: string, pathname: string): string {
  return shellAwarePath(seriesPath(seriesId), pathname)
}

function ResultBadge({ correct }: { correct: boolean | null }) {
  if (correct == null) return <span className="text-secondary">—</span>
  return correct ? (
    <span className="predictions-log-hit text-accent">hit</span>
  ) : (
    <span className="predictions-log-miss">miss</span>
  )
}

function LogExpanded({ row }: { row: PredictionLogRow }) {
  return (
    <div className="predictions-log-expand">
      {row.games.map((g) => (
        <div key={g.gameId} className="predictions-log-game">
          <div className="predictions-log-game-head">
            <span className="text-secondary">
              G{g.gameNumber} · {g.date}
              {g.patch !== '—' ? ` · ${g.patch}` : ''}
            </span>
            <span>
              winner <EntityLink type="team" name={g.winner} showIcon={false} />
            </span>
            <span className="font-mono text-secondary">
              perf {formatNum(g.teamAPerf, 1)} / {formatNum(g.teamBPerf, 1)}
            </span>
          </div>
          <div className="predictions-log-rosters">
            <div>
              <div className="predictions-log-side-label">{row.teamA}</div>
              <ul className="predictions-log-players">
                {g.playersA.map((p) => (
                  <li key={`${g.gameId}-a-${p.name}`}>
                    <ChampionIcon name={p.champion} size={16} />
                    <EntityLink type="player" name={p.name} showIcon={false} />
                    <span className="text-secondary">{p.role ?? ''}</span>
                    <span className="font-mono text-accent">{formatNum(p.score, 1)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="predictions-log-side-label">{row.teamB}</div>
              <ul className="predictions-log-players">
                {g.playersB.map((p) => (
                  <li key={`${g.gameId}-b-${p.name}`}>
                    <ChampionIcon name={p.champion} size={16} />
                    <EntityLink type="player" name={p.name} showIcon={false} />
                    <span className="text-secondary">{p.role ?? ''}</span>
                    <span className="font-mono text-accent">{formatNum(p.score, 1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PredictionLogTab() {
  const location = useLocation()
  const { data } = useDashboard()
  const [filter, setFilter] = useState<PredictionLeagueFilter>('all')
  const [holdout, setHoldout] = useState<HoldoutLogFile | null>(null)
  const [region, setRegion] = useState<RegionStrengthBundle | null>(null)
  const [ratings, setRatings] = useState<PlayerRatingsBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void Promise.all([
      fetchPredictionHoldoutLog(),
      fetchRegionStrength(),
      fetchPlayerRatings(),
    ]).then(([h, r, p]) => {
      if (!alive) return
      setHoldout(h)
      setRegion(r)
      setRatings(p)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    return buildPredictionLogRows(data, { filter, holdout, region, ratings, limit: 100 })
  }, [data, filter, holdout, region, ratings])

  const tracked = useMemo(() => {
    const withCall = rows.filter((r) => r.correct != null)
    const hits = withCall.filter((r) => r.correct).length
    const holdoutN = rows.filter((r) => r.predictionSource === 'holdout').length
    return { n: withCall.length, hits, holdoutN }
  }, [rows])

  return (
    <div className="predictions-log-tab">
      <div className="predictions-filters" role="tablist" aria-label="League filter">
        {PREDICTION_LEAGUE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={`predictions-filter-btn${filter === item.id ? ' is-active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="predictions-refresh-meta text-secondary text-sm">
        Completed tier-1 series with nucky pre-series calls vs results.
        {holdout?.accuracy != null
          ? ` Holdout ledger: ${Math.round(holdout.accuracy * 1000) / 10}% on ${holdout.seriesCount} series`
          : ''}
        {tracked.n > 0 ? ` · visible window ${tracked.hits}/${tracked.n} correct` : ''}
        {tracked.holdoutN < rows.length
          ? ' · rows without holdout use current Elo (retrospective)'
          : ''}
      </p>

      {loading || !data ? (
        <p className="text-secondary text-sm">loading series log…</p>
      ) : rows.length === 0 ? (
        <p className="text-secondary text-sm">no completed series for this filter.</p>
      ) : (
        <div className="entity-table-wrap predictions-table-wrap">
          <table className="entity-table predictions-table predictions-log-table">
            <thead>
              <tr>
                <th />
                <th>Date</th>
                <th>Matchup</th>
                <th>Result</th>
                <th>League</th>
                <th>Model</th>
                <th>Call</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = expanded === row.seriesId
                return (
                  <Fragment key={row.seriesId}>
                    <tr>
                      <td>
                        <button
                          type="button"
                          className="predictions-log-toggle"
                          aria-expanded={open}
                          onClick={() => setExpanded(open ? null : row.seriesId)}
                        >
                          {open ? '−' : '+'}
                        </button>
                      </td>
                      <td className="text-secondary whitespace-nowrap">
                        {formatProfileDate(row.date)}
                      </td>
                      <td>
                        <span className="predictions-matchup">
                          <span className="predictions-team">
                            <TeamLogo name={row.teamA} size={18} />
                            <EntityLink type="team" name={row.teamA} showIcon={false} />
                          </span>
                          <span className="text-secondary">vs</span>
                          <span className="predictions-team">
                            <TeamLogo name={row.teamB} size={18} />
                            <EntityLink type="team" name={row.teamB} showIcon={false} />
                          </span>
                        </span>
                      </td>
                      <td>
                        <Link
                          to={seriesHref(row.seriesId, location.pathname)}
                          className="text-accent font-mono"
                        >
                          {row.scoreLabel}
                        </Link>
                        <span className="text-secondary"> · </span>
                        <EntityLink type="team" name={row.winner} showIcon={false} />
                      </td>
                      <td className="text-secondary">{row.league}</td>
                      <td className="font-mono text-accent">
                        {formatLogModelOdds(row.modelProbA)}
                      </td>
                      <td>
                        <ResultBadge correct={row.correct} />
                      </td>
                      <td className="text-secondary text-sm">
                        {row.predictionSource === 'holdout' ? 'holdout' : 'retro'}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="predictions-log-expand-row">
                        <td colSpan={8}>
                          <LogExpanded row={row} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
