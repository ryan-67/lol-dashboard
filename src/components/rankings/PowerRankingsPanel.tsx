import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import {
  fetchPlayerRatings,
  RATING_ROLES,
  type PlayerPowerRow,
  type PlayerRatingsBundle,
  type RatingRole,
} from '../../lib/loadPlayerRatings'
import { EntityLink } from '../entities'
import { formatModelUpdatedDate, formatNum } from '../../lib/format'
import { fetchMlFreshness, type MlFreshness } from '../../lib/loadMlFreshness'
import { fetchModelMetadata } from '../../lib/loadModelMetadata'
import { matchPowerRegion, type PowerRegions } from '../../lib/powerRegionFilter'
import { powerScoreTo100 } from '../../lib/scoreNormalize'
import { MODEL_POWER_RANKINGS_SUBTITLE } from '../../lib/metricHints'
import { animateMeterFill, staggerListReveal, tabTransitionIn } from '../../theme/animations'

const ROLE_LABEL: Record<RatingRole, string> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'mid',
  adc: 'adc',
  support: 'support',
}

export type PowerRegionFilter = 'all' | 'LCK' | 'LPL' | 'LEC' | 'LCS'

interface PowerRankingsPanelProps {
  /** Limit rows per role */
  limit?: number
  title?: string
  subtitle?: string
  /** Externally-controlled role (e.g. from a page-level role filter). */
  role?: RatingRole
  /** Called when the internal role tabs change (ignored once `role` is externally controlled). */
  onRoleChange?: (role: RatingRole) => void
  /** Hide the built-in role tablist — pass `role` from the parent instead. */
  hideRoleTabs?: boolean
  /**
   * Filter model board rows by home region(s). Prefer `regions` from the dashboard
   * LEAGUE filter; `region` is a single-region shorthand (predictions tabs).
   */
  regions?: PowerRegions
  /** @deprecated Prefer `regions`. Single-region shorthand. */
  region?: PowerRegionFilter
}

export default function PowerRankingsPanel({
  limit = 10,
  title = 'nucky power rankings',
  subtitle = MODEL_POWER_RANKINGS_SUBTITLE,
  role: roleProp,
  onRoleChange,
  hideRoleTabs = false,
  regions,
  region = 'all',
}: PowerRankingsPanelProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const [bundle, setBundle] = useState<PlayerRatingsBundle | null>(null)
  const [freshness, setFreshness] = useState<MlFreshness | null>(null)
  const [modelExportedAt, setModelExportedAt] = useState<string | null>(null)
  const [internalRole, setInternalRole] = useState<RatingRole>('mid')
  const [loading, setLoading] = useState(true)
  const role = roleProp ?? internalRole

  const setRole = (next: RatingRole) => {
    setInternalRole(next)
    onRoleChange?.(next)
  }

  useEffect(() => {
    let alive = true
    const load = (force = false) => {
      void fetchPlayerRatings({ force }).then((data) => {
        if (!alive) return
        setBundle(data)
        setLoading(false)
      })
      void fetchMlFreshness({ force }).then((data) => {
        if (!alive || !data) return
        setFreshness(data)
      })
      void fetchModelMetadata({ force }).then((meta) => {
        if (!alive || !meta?.exported_at) return
        setModelExportedAt(meta.exported_at)
      })
    }
    load()
    const onVis = () => {
      if (document.visibilityState === 'visible') load(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const effectiveRegions: PowerRegions = regions ?? (region === 'all' ? 'all' : [region])

  const rows: PlayerPowerRow[] = useMemo(() => {
    const all = bundle?.roles?.[role] ?? []
    const filtered =
      effectiveRegions === 'all'
        ? all
        : all.filter((r) => matchPowerRegion(r.region, effectiveRegions))
    return [...filtered]
      .map((row) => ({
        ...row,
        displayScore100:
          row.displayScore100 ??
          powerScoreTo100(row.powerScore, { effGames: row.effGames }),
      }))
      .sort((a, b) => (b.displayScore100 ?? 0) - (a.displayScore100 ?? 0))
      .slice(0, limit)
      .map((row, idx) => ({ ...row, rank: idx + 1 }))
  }, [bundle, role, effectiveRegions, limit])

  const scored = useMemo(() => {
    const values = rows.map((r) =>
      r.displayScore100 != null
        ? r.displayScore100
        : powerScoreTo100(r.powerScore, { effGames: r.effGames }),
    )
    const top = Math.max(...values, 1)
    const floor = Math.min(...values, 0)
    const span = Math.max(top - floor, 1)
    return rows.map((row, i) => ({
      row,
      score: values[i],
      // Bars measure distance from the bottom of the visible board, so the
      // spread between #1 and #8 is legible instead of eight near-full bars.
      fill: 0.18 + 0.82 * ((values[i] - floor) / span),
    }))
  }, [rows])

  useGSAP(
    () => {
      if (!listRef.current || loading || !rows.length) return
      staggerListReveal(listRef.current, '.power-rankings-row')
      animateMeterFill(listRef.current, '.power-rankings-bar i', { stagger: 0.045 })
      tabTransitionIn(listRef.current)
    },
    { dependencies: [loading, role, effectiveRegions, rows.length, bundle?.generatedAt] },
  )

  return (
    <section className="card power-rankings-panel dash-reveal">
      <div className="power-rankings-head">
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="card-subtitle mb-0">{subtitle}</p>
        </div>
        {!hideRoleTabs && (
          <div className="power-rankings-roles" role="tablist" aria-label="Role">
            {RATING_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={role === r}
                className={`power-rankings-role${role === r ? ' is-active' : ''}`}
                onClick={() => setRole(r)}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="dash-skeleton-list" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dash-skeleton-row" />
          ))}
        </div>
      ) : !bundle ? (
        <p className="text-secondary text-sm">rankings unavailable.</p>
      ) : (
        <ol className="power-rankings-list" ref={listRef}>
          {scored.map(({ row, score, fill }) => (
            <li
              key={`${row.player}-${row.team}-${row.rank}`}
              className="power-rankings-row"
              data-podium={row.rank <= 3 ? row.rank : undefined}
            >
              <span className="power-rankings-rank">
                <b>{row.rank}</b>
              </span>
              <span className="power-rankings-player">
                <EntityLink type="player" name={row.player} showIcon={false} />
                <span className="power-rankings-meta">
                  <EntityLink type="team" name={row.team} showIcon /> · {row.region}
                </span>
              </span>
              <span className="power-rankings-bar" aria-hidden="true">
                <i style={{ ['--fill' as string]: fill }} />
              </span>
              <span className="power-rankings-score" title="power score /100">
                {formatNum(score, 1)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {bundle?.generatedAt ? (
        <p className="power-rankings-footer">
          model v{bundle.version} · updated{' '}
          {formatModelUpdatedDate(
            modelExportedAt ?? freshness?.modelExportedAt ?? bundle.generatedAt,
          )}
          {freshness?.oeAheadOfModelDays != null && freshness.oeAheadOfModelDays > 2 ? (
            <span className="power-rankings-stale">
              {' '}
              · OE through {freshness.oeDataThrough} ({freshness.oeAheadOfModelDays}d ahead of
              model holdout)
            </span>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}
