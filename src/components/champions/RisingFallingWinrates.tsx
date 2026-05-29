import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Champion } from '../../hooks/useDashboardData'
import {
  computeRisingFallingWinrate,
  FALLING_COLOR,
  RISING_COLOR,
  roleColor,
  roleLabel,
} from '../../lib/championAnalytics'
import { scrollEntrance } from '../../theme/animations'

interface RisingFallingWinratesProps {
  champions: Champion[]
}

function TrendList({
  title,
  entries,
  direction,
}: {
  title: string
  entries: ReturnType<typeof computeRisingFallingWinrate>['rising']
  direction: 'rising' | 'falling'
}) {
  const color = direction === 'rising' ? RISING_COLOR : FALLING_COLOR
  const arrow = direction === 'rising' ? '▲' : '▼'

  return (
    <div className="trend-list card" style={{ padding: 'var(--component-gap)' }}>
      <h3 className="card-title">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-secondary text-sm">No champions in this category</p>
      ) : (
        <ul className="trend-rows">
          {entries.map((entry) => (
            <li key={entry.champion.name} className="trend-row">
              <div className="trend-row-main">
                <span className="font-medium">{entry.champion.name}</span>
                <span
                  className="role-badge"
                  style={{ color: roleColor(entry.role), borderColor: roleColor(entry.role) }}
                >
                  {roleLabel(entry.role)}
                </span>
              </div>
              <div className="trend-row-meta text-secondary">
                {entry.priorWinrate.toFixed(1)}% → {entry.recentWinrate.toFixed(1)}%
              </div>
              <div className="trend-row-delta" style={{ color }}>
                {arrow} {Math.abs(entry.delta).toFixed(1)}%
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function RisingFallingWinrates({ champions }: RisingFallingWinratesProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const result = computeRisingFallingWinrate(champions)

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [champions.length] },
  )

  return (
    <div ref={sectionRef} className="page-section">
      <h2 className="card-title">Rising & Falling Winrates</h2>
      <p className="card-subtitle">Recent 2 weeks vs prior 2 weeks (champion win %)</p>
      {!result.sufficient ? (
        <div className="empty-state">Not enough weekly data for winrate trend comparison</div>
      ) : (
        <div className="overview-grid overview-grid-2">
          <TrendList title="Rising" entries={result.rising} direction="rising" />
          <TrendList title="Falling" entries={result.falling} direction="falling" />
        </div>
      )}
    </div>
  )
}
