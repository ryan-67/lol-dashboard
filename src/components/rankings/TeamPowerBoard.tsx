import { useEffect, useMemo, useState } from 'react'
import { fetchRegionStrength, type RegionStrengthBundle } from '../../lib/loadRegionStrength'
import { eloTo100 } from '../../lib/scoreNormalize'
import {
  isTier1HomeRegion,
  matchPowerRegion,
  type PowerRegions,
} from '../../lib/powerRegionFilter'
import { EntityLink, TeamLogo } from '../entities'
import SignalLoader from '../ui/SignalLoader'
import { formatModelUpdatedDate, formatNum } from '../../lib/format'

interface TeamPowerBoardProps {
  limit?: number
  /**
   * Model-board region filter from the dashboard LEAGUE control.
   * Defaults to all tier-1 — never gated by OE split membership (empty Summer LCK
   * must not hide LCK teams from the Elo board).
   */
  regions?: PowerRegions
  /** Current-form rows (Hub). When set, skip Elo artifact fetch. */
  rowsOverride?: Array<{ name: string; region: string; rating: number; score100: number }>
}

/** Global team power board from Component 1 Elo (region_strength.json), display-normalized /100. */
export default function TeamPowerBoard({
  limit = 10,
  regions = 'all',
  rowsOverride,
}: TeamPowerBoardProps) {
  const [bundle, setBundle] = useState<RegionStrengthBundle | null>(null)
  const [loading, setLoading] = useState(!rowsOverride)

  useEffect(() => {
    if (rowsOverride) {
      setLoading(false)
      return
    }
    let alive = true
    void fetchRegionStrength().then((data) => {
      if (!alive) return
      setBundle(data)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [rowsOverride])

  const ranked = useMemo(() => {
    if (rowsOverride?.length) {
      return rowsOverride.slice(0, limit).map((row, idx) => ({
        ...row,
        rank: idx + 1,
      }))
    }
    if (!bundle) return []

    return Object.entries(bundle.teams)
      .map(([name, row]) => ({
        name,
        region: row.homeRegion,
        rating: row.rating,
        score100: eloTo100(row.rating),
      }))
      .filter((row) => isTier1HomeRegion(row.region))
      .filter((row) => matchPowerRegion(row.region, regions))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
      .map((row, idx) => ({ ...row, rank: idx + 1 }))
  }, [bundle, regions, limit, rowsOverride])

  if (loading) {
    return (
      <section className="card power-rankings-panel">
        <SignalLoader compact label="loading team power…" />
      </section>
    )
  }

  if (!ranked.length) {
    return (
      <section className="card power-rankings-panel">
        <div className="power-rankings-head">
          <div>
            <h2 className="card-title">nucky team power</h2>
            <p className="card-subtitle mb-0">No tier-1 teams match the current league filter.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="card power-rankings-panel">
      <div className="power-rankings-head">
        <div>
          <h2 className="card-title">nucky team power</h2>
          <p className="card-subtitle mb-0">
            {rowsOverride
              ? 'Current-form team scores from the hub window (recent maps, not all-time Elo). 100 would mean a near-perfect stretch.'
              : 'Component 1 Elo (0.8×team + 0.2×region) — scores shown out of 100. 100 would require Elo ~2000; typical leaders land in the high 70s–80s.'}
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
                {row.region}
                {rowsOverride
                  ? ` · ${formatNum(row.rating, 0)}% WR`
                  : ` · Elo ${formatNum(row.rating, 1)}`}
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
          model · updated {formatModelUpdatedDate(bundle.generatedAt)}
        </p>
      ) : null}
    </section>
  )
}
