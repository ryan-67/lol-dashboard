import { useEffect, useMemo, useState } from 'react'
import type { Team } from '../../hooks/useDashboardData'
import { fetchRegionStrength, type RegionStrengthBundle } from '../../lib/loadRegionStrength'
import { eloTo100 } from '../../lib/scoreNormalize'
import { resolveTeamCanonicalName } from '../../lib/entities/slugs'
import { EntityLink, TeamLogo } from '../entities'
import { formatNum } from '../../lib/format'

interface TeamPowerBoardProps {
  teams: Team[]
  limit?: number
}

/** Global team power board from Component 1 Elo (region_strength.json), display-normalized /100. */
export default function TeamPowerBoard({ teams, limit = 8 }: TeamPowerBoardProps) {
  const [bundle, setBundle] = useState<RegionStrengthBundle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void fetchRegionStrength().then((data) => {
      if (!alive) return
      setBundle(data)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const ranked = useMemo(() => {
    if (!bundle) return []
    const filterNames = new Set(
      teams.map((t) => resolveTeamCanonicalName(t.name).toLowerCase()),
    )
    const useFilter = filterNames.size > 0

    const rows = Object.entries(bundle.teams)
      .map(([name, row]) => ({
        name,
        region: row.homeRegion,
        rating: row.rating,
        score100: eloTo100(row.rating),
      }))
      .filter((row) => {
        if (!useFilter) return true
        return filterNames.has(resolveTeamCanonicalName(row.name).toLowerCase())
      })
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
      .map((row, idx) => ({ ...row, rank: idx + 1 }))

    // If filter is so narrow nothing matches, fall back to global top.
    if (!rows.length && useFilter) {
      return Object.entries(bundle.teams)
        .map(([name, row]) => ({
          name,
          region: row.homeRegion,
          rating: row.rating,
          score100: eloTo100(row.rating),
        }))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, limit)
        .map((row, idx) => ({ ...row, rank: idx + 1 }))
    }
    return rows
  }, [bundle, teams, limit])

  if (loading) {
    return (
      <section className="card power-rankings-panel">
        <p className="text-secondary text-sm">loading team power…</p>
      </section>
    )
  }

  if (!ranked.length) return null

  return (
    <section className="card power-rankings-panel">
      <div className="power-rankings-head">
        <div>
          <h2 className="card-title">nucky team power</h2>
          <p className="card-subtitle mb-0">
            Component 1 Elo (0.8×team + 0.2×region) — scores shown out of 100 for dashboard
            consistency.
          </p>
        </div>
      </div>
      <ol className="power-rankings-list">
        {ranked.map((row) => (
          <li key={`${row.name}-${row.rank}`} className="power-rankings-row">
            <span className="power-rankings-rank">#{row.rank}</span>
            <span className="power-rankings-player">
              <span className="entity-inline-row">
                <TeamLogo name={row.name} size={18} />
                <EntityLink type="team" name={row.name} showIcon={false} />
              </span>
              <span className="power-rankings-meta">
                {row.region} · Elo {formatNum(row.rating, 1)}
              </span>
            </span>
            <span className="power-rankings-score" title="power score /100">
              {formatNum(row.score100, 1)}
            </span>
          </li>
        ))}
      </ol>
      {bundle?.generatedAt ? (
        <p className="power-rankings-footer">
          model · updated {new Date(bundle.generatedAt).toLocaleDateString()}
        </p>
      ) : null}
    </section>
  )
}
