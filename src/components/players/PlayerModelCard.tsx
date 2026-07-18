import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import type { Player } from '../../hooks/useDashboardData'
import {
  fetchPlayerRatings,
  type PlayerRatingsBundle,
  type PlayerPowerRow,
  type RatingRole,
} from '../../lib/loadPlayerRatings'
import { ordinalSuffix, powerScoreTo100 } from '../../lib/scoreNormalize'
import { formatNum } from '../../lib/format'
import AnimatedCounter from '../ui/AnimatedCounter'
import { animateBarGrow, scrollEntrance } from '../../theme/animations'

interface PlayerModelCardProps {
  player: Player
  role: string
}

interface ModelRow {
  row: PlayerPowerRow
  roleRows: PlayerPowerRow[]
}

function findRating(
  bundle: PlayerRatingsBundle | null,
  playerName: string,
  role: string,
): ModelRow | null {
  if (!bundle?.roles) return null
  const lower = playerName.toLowerCase()
  const preferred = bundle.roles[role as RatingRole]
  const pools: PlayerPowerRow[][] = preferred
    ? [preferred, ...Object.values(bundle.roles).filter((r) => r !== preferred)]
    : Object.values(bundle.roles)
  for (const rows of pools) {
    const hit = rows.find((r) => r.player.toLowerCase() === lower)
    if (hit) return { row: hit, roleRows: rows }
  }
  return null
}

/**
 * nucky model outlook — the player's role-normalized power rating from the
 * ML pipeline, with the box-score vs region-strength decomposition.
 */
export default function PlayerModelCard({ player, role }: PlayerModelCardProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [bundle, setBundle] = useState<PlayerRatingsBundle | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchPlayerRatings().then((data) => {
      if (!cancelled) setBundle(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hit = useMemo(
    () => findRating(bundle, player.name, role),
    [bundle, player.name, role],
  )

  const decomposition = useMemo(() => {
    if (!hit) return null
    const maxAbs = Math.max(
      ...hit.roleRows.map((r) => Math.max(Math.abs(r.boxScoreZ), Math.abs(r.regionShift))),
      0.01,
    )
    return [
      {
        key: 'box',
        label: 'Box-score impact',
        hint: 'Role-normalized per-game production vs peers',
        value: hit.row.boxScoreZ,
        width: (Math.abs(hit.row.boxScoreZ) / maxAbs) * 100,
      },
      {
        key: 'region',
        label: 'Strength of competition',
        hint: 'Adjustment for region / opponent quality',
        value: hit.row.regionShift,
        width: (Math.abs(hit.row.regionShift) / maxAbs) * 100,
      },
    ]
  }, [hit])

  useGSAP(
    () => {
      if (!sectionRef.current || !hit) return
      scrollEntrance(sectionRef.current)
      animateBarGrow(sectionRef.current, '.model-decomp-fill', {
        duration: 0.7,
        stagger: 0.08,
        delay: 0.15,
      })
    },
    { scope: sectionRef, dependencies: [hit?.row.player] },
  )

  if (!hit) return null

  const { row, roleRows } = hit
  const score100 = powerScoreTo100(row.powerScore)
  const percentile = roleRows.length > 1
    ? Math.round(((roleRows.length - row.rank) / (roleRows.length - 1)) * 100)
    : 100

  return (
    <div ref={sectionRef} className="card model-outlook-card">
      <div className="model-outlook-main">
        <div className="model-outlook-score-block">
          <span className="model-outlook-eyebrow">nucky model rating</span>
          <span className="model-outlook-score">
            <AnimatedCounter value={score100} decimals={1} />
            <span className="model-outlook-score-max">/100</span>
          </span>
          <span className="model-outlook-rank">
            #{row.rank} of {roleRows.length} {role.toUpperCase()}s · {percentile}
            {ordinalSuffix(percentile)} percentile
          </span>
        </div>

        <div className="model-outlook-decomp">
          {decomposition?.map((part) => (
            <div key={part.key} className="model-decomp-row" title={part.hint}>
              <span className="model-decomp-label">{part.label}</span>
              <div
                className={`model-decomp-track${part.value < 0 ? ' model-decomp-negative' : ''}`}
              >
                <div
                  className="model-decomp-fill"
                  style={{ width: `${Math.max(part.width, 2)}%` }}
                />
              </div>
              <span
                className={`model-decomp-value ${part.value >= 0 ? 'text-accent' : 'model-decomp-value-negative'}`}
              >
                {part.value >= 0 ? '+' : ''}
                {formatNum(part.value, 3)}
              </span>
            </div>
          ))}
          <p className="model-outlook-footnote text-tertiary">
            Trained over thousands of tier-1 games · {formatNum(row.effGames, 1)} effective games
            weighted toward recent form
          </p>
        </div>
      </div>
    </div>
  )
}
