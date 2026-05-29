import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Champion } from '../../hooks/useDashboardData'
import { bestChampionPerRole, roleColor, roleLabel } from '../../lib/championAnalytics'
import { scrollEntranceStagger } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface TopPerformerCardsProps {
  champions: Champion[]
  focusedName: string | null
  onFocus: (name: string) => void
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) {
    return <div className="sparkline-empty text-dim text-xs">No recent games</div>
  }

  const width = 88
  const height = 28
  const points = data
    .map((v, i) => {
      const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width
      const y = height - v * (height - 4) - 2
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} className="sparkline-svg" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  )
}

export default function TopPerformerCards({
  champions,
  focusedName,
  onFocus,
}: TopPerformerCardsProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const topPerformers = bestChampionPerRole(champions)

  useGSAP(
    () => {
      scrollEntranceStagger(gridRef.current, '.performer-card')
    },
    { scope: gridRef, dependencies: [champions.length] },
  )

  if (!topPerformers.length) {
    return (
      <div className="empty-state page-section">Not enough pick data for top performers by role.</div>
    )
  }

  return (
    <div className="page-section">
      <h2 className="card-title">Top Performers by Role</h2>
      <p className="card-subtitle">Highest win rate with minimum 5 picks · click to focus in scatter</p>
      <div ref={gridRef} className="performer-grid">
        {topPerformers.map((c) => {
          const role = c.primaryRole ?? c.positions?.[0] ?? ''
          const color = roleColor(role)
          const isFocused = focusedName === c.name
          return (
            <button
              key={c.name}
              type="button"
              className={`performer-card${isFocused ? ' focused' : ''}`}
              onClick={() => onFocus(c.name)}
            >
              <div className="performer-card-role" style={{ color }}>
                {roleLabel(role)}
              </div>
              <div className="performer-card-name">{c.name}</div>
              <div className="performer-card-stats">
                <span className="text-accent">{c.winrate.toFixed(1)}% WR</span>
                <span className="text-secondary"> · {c.avgKda.toFixed(2)} KDA</span>
              </div>
              <MiniSparkline data={c.sparkline ?? []} color={isFocused ? CHART.accent : color} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
