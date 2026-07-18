import { useEffect, useState } from 'react'
import {
  fetchPlayerRatings,
  RATING_ROLES,
  type PlayerPowerRow,
  type PlayerRatingsBundle,
  type RatingRole,
} from '../../lib/loadPlayerRatings'
import { EntityLink } from '../entities'
import { formatNum } from '../../lib/format'

const ROLE_LABEL: Record<RatingRole, string> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'mid',
  adc: 'adc',
  support: 'support',
}

interface PowerRankingsPanelProps {
  /** Limit rows per role */
  limit?: number
  title?: string
  subtitle?: string
}

export default function PowerRankingsPanel({
  limit = 8,
  title = 'nucky power rankings',
  subtitle = 'Role-normalized player power from the nucky model (box-score prior + region shift).',
}: PowerRankingsPanelProps) {
  const [bundle, setBundle] = useState<PlayerRatingsBundle | null>(null)
  const [role, setRole] = useState<RatingRole>('mid')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void fetchPlayerRatings().then((data) => {
      if (!alive) return
      setBundle(data)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const rows: PlayerPowerRow[] = (bundle?.roles?.[role] ?? []).slice(0, limit)

  return (
    <section className="card power-rankings-panel dash-reveal">
      <div className="power-rankings-head">
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="card-subtitle mb-0">{subtitle}</p>
        </div>
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
      </div>

      {loading ? (
        <p className="text-secondary text-sm">loading rankings…</p>
      ) : !bundle ? (
        <p className="text-secondary text-sm">rankings unavailable.</p>
      ) : (
        <ol className="power-rankings-list">
          {rows.map((row) => (
            <li key={`${row.player}-${row.team}-${row.rank}`} className="power-rankings-row">
              <span className="power-rankings-rank">#{row.rank}</span>
              <span className="power-rankings-player">
                <EntityLink type="player" name={row.player} showIcon={false} />
                <span className="power-rankings-meta">
                  <EntityLink type="team" name={row.team} /> · {row.region}
                </span>
              </span>
              <span className="power-rankings-score" title="power score">
                {formatNum(row.powerScore, 3)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {bundle?.generatedAt ? (
        <p className="power-rankings-footer">
          model v{bundle.version} · {new Date(bundle.generatedAt).toLocaleDateString()}
        </p>
      ) : null}
    </section>
  )
}
