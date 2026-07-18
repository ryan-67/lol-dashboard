import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import type { Team } from '../../hooks/useDashboardData'
import {
  fetchRegionStrength,
  type RegionStrengthBundle,
  type RegionStrengthTeam,
} from '../../lib/loadRegionStrength'
import { teamMatchesCanonical } from '../../lib/entities'
import { eloTo100 } from '../../lib/scoreNormalize'
import { formatNum } from '../../lib/format'
import AnimatedCounter from '../ui/AnimatedCounter'
import { scrollEntrance } from '../../theme/animations'

interface TeamModelCardProps {
  team: Team
  /** ISO date (YYYY-MM-DD) of the team's most recent game — prefer this live value over the artifact's stale field. */
  lastGameDate?: string | null
}

interface TeamStrengthHit {
  name: string
  row: RegionStrengthTeam
}

function findTeamRow(bundle: RegionStrengthBundle | null, teamName: string): TeamStrengthHit | null {
  if (!bundle?.teams) return null
  const direct = bundle.teams[teamName]
  if (direct) return { name: teamName, row: direct }
  for (const [name, row] of Object.entries(bundle.teams)) {
    if (name.toLowerCase() === teamName.toLowerCase() || teamMatchesCanonical(name, teamName)) {
      return { name, row }
    }
  }
  return null
}

function confidenceLabel(deviation: number | undefined): string {
  if (typeof deviation !== 'number') return '—'
  if (deviation < 110) return 'High'
  if (deviation < 170) return 'Medium'
  return 'Low'
}

/**
 * nucky model strength — team Elo from region_strength.json with global +
 * region context, and the team's position inside its region's rating band.
 */
function daysSinceDate(isoDate: string): number | null {
  const parsed = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.floor((Date.now() - parsed.getTime()) / 86400000)
}

export default function TeamModelCard({ team, lastGameDate }: TeamModelCardProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [bundle, setBundle] = useState<RegionStrengthBundle | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchRegionStrength().then((data) => {
      if (!cancelled) setBundle(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hit = useMemo(() => findTeamRow(bundle, team.name), [bundle, team.name])

  const context = useMemo(() => {
    if (!bundle?.teams || !hit) return null
    const all = Object.entries(bundle.teams)
      .map(([name, row]) => ({ name, rating: row.rating, region: row.homeRegion }))
      .sort((a, b) => b.rating - a.rating)
    const globalRank = all.findIndex((t) => t.name === hit.name) + 1
    const regionTeams = all.filter((t) => t.region === hit.row.homeRegion)
    const regionRank = regionTeams.findIndex((t) => t.name === hit.name) + 1
    const ratings = regionTeams.map((t) => t.rating)
    const min = Math.min(...ratings)
    const max = Math.max(...ratings)
    const span = Math.max(max - min, 1)
    return {
      globalRank,
      globalCount: all.length,
      regionRank,
      regionCount: regionTeams.length,
      bandMin: min,
      bandMax: max,
      markerPct: ((hit.row.rating - min) / span) * 100,
      regionAvgPct:
        typeof hit.row.regionRating === 'number'
          ? Math.max(0, Math.min(100, ((hit.row.regionRating - min) / span) * 100))
          : null,
    }
  }, [bundle, hit])

  useGSAP(
    () => {
      if (!sectionRef.current || !hit) return
      scrollEntrance(sectionRef.current)
      const marker = sectionRef.current.querySelector('.model-band-marker')
      if (marker) {
        gsap.fromTo(
          marker,
          { left: '0%' },
          {
            left: `${context?.markerPct ?? 0}%`,
            duration: 0.9,
            ease: 'power3.out',
            delay: 0.2,
          },
        )
      }
    },
    { scope: sectionRef, dependencies: [hit?.name, context?.markerPct] },
  )

  if (!hit || !context) return null

  const { row } = hit
  const score100 = eloTo100(row.rating)
  const daysSinceLastSeries = lastGameDate ? daysSinceDate(lastGameDate) : null

  return (
    <div ref={sectionRef} className="card model-outlook-card">
      <div className="model-outlook-main">
        <div className="model-outlook-score-block">
          <span className="model-outlook-eyebrow">nucky model strength</span>
          <span className="model-outlook-score">
            <AnimatedCounter value={score100} decimals={1} />
            <span className="model-outlook-score-max">/100</span>
          </span>
          <span className="model-outlook-rank">
            #{context.globalRank} of {context.globalCount} globally · #{context.regionRank} in{' '}
            {row.homeRegion}
          </span>
        </div>

        <div className="model-outlook-decomp">
          <div className="model-band">
            <div className="model-band-header">
              <span className="model-decomp-label">{row.homeRegion} rating band</span>
              <span className="text-tertiary text-xs">
                Elo {formatNum(row.rating, 0)}
              </span>
            </div>
            <div className="model-band-track">
              {context.regionAvgPct != null ? (
                <div
                  className="model-band-avg-tick"
                  style={{ left: `${context.regionAvgPct}%` }}
                  title={`Region average · ${formatNum(row.regionRating, 0)}`}
                />
              ) : null}
              <div
                className="model-band-marker"
                style={{ left: `${context.markerPct}%` }}
                title={`${team.name} · ${formatNum(row.rating, 0)}`}
              />
            </div>
            <div className="model-band-scale text-tertiary">
              <span>{formatNum(context.bandMin, 0)}</span>
              <span>{formatNum(context.bandMax, 0)}</span>
            </div>
          </div>

          <div className="model-band-meta">
            <span className="text-secondary">
              Confidence: <span className="text-accent">{confidenceLabel(row.ratingDeviation)}</span>
            </span>
            {daysSinceLastSeries != null ? (
              <span className="text-secondary">
                Last series: <span className="text-accent">{daysSinceLastSeries}d ago</span>
              </span>
            ) : typeof row.daysSinceLastSeries === 'number' ? (
              <span className="text-secondary">
                Last series: <span className="text-accent">{row.daysSinceLastSeries}d ago</span>
              </span>
            ) : null}
          </div>
          <p className="model-outlook-footnote text-tertiary">
            Elo trained over historical tier-1 series · dot = {team.name}, tick = region average
          </p>
        </div>
      </div>
    </div>
  )
}
