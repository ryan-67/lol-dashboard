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
import { powerScoreTo100 } from '../../lib/scoreNormalize'
import { staggerListReveal, tabTransitionIn } from '../../theme/animations'

const ROLE_LABEL: Record<RatingRole, string> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'mid',
  adc: 'adc',
  support: 'support',
}

export type PowerRegionFilter = 'all' | 'LCK' | 'LPL' | 'LEC' | 'LCS'

function regionMatch(homeRegion: string | undefined, filter: PowerRegionFilter): boolean {
  if (filter === 'all') return true
  const r = (homeRegion ?? '').toUpperCase()
  if (filter === 'LCS') return r === 'LCS' || r === 'LTA' || r.startsWith('LTA')
  return r === filter
}

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
  /** Filter model board rows by home region (LCS includes LTA). */
  region?: PowerRegionFilter
}

export default function PowerRankingsPanel({
  limit = 8,
  title = 'nucky power rankings',
  subtitle = 'Role-normalized player power from the nucky model (box-score prior + region shift).',
  role: roleProp,
  onRoleChange,
  hideRoleTabs = false,
  region = 'all',
}: PowerRankingsPanelProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const [bundle, setBundle] = useState<PlayerRatingsBundle | null>(null)
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

  const rows: PlayerPowerRow[] = useMemo(() => {
    const all = bundle?.roles?.[role] ?? []
    const filtered = region === 'all' ? all : all.filter((r) => regionMatch(r.region, region))
    return filtered.slice(0, limit)
  }, [bundle, role, region, limit])

  useGSAP(
    () => {
      if (!listRef.current || loading || !rows.length) return
      staggerListReveal(listRef.current, '.power-rankings-row')
      tabTransitionIn(listRef.current)
    },
    { dependencies: [loading, role, region, rows.length, bundle?.generatedAt] },
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
          {rows.map((row) => (
            <li key={`${row.player}-${row.team}-${row.rank}`} className="power-rankings-row">
              <span className="power-rankings-rank">#{row.rank}</span>
              <span className="power-rankings-player">
                <EntityLink type="player" name={row.player} showIcon={false} />
                <span className="power-rankings-meta">
                  <EntityLink type="team" name={row.team} showIcon /> · {row.region}
                </span>
              </span>
              <span className="power-rankings-score" title="power score /100">
                {formatNum(powerScoreTo100(row.powerScore), 1)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {bundle?.generatedAt ? (
        <p className="power-rankings-footer">
          model v{bundle.version} · updated {formatModelUpdatedDate(bundle.generatedAt)} UTC
        </p>
      ) : null}
    </section>
  )
}
