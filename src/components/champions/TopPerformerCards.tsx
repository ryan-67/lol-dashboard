import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Champion } from '../../hooks/useDashboardData'
import { bestByRole, roleColor, roleLabel } from '../../lib/championAnalytics'
import { scrollEntranceStagger } from '../../theme/animations'

interface TopPerformerCardsProps {
  champions: Champion[]
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

export default function TopPerformerCards({ champions }: TopPerformerCardsProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const bestByRoleEntries = bestByRole(champions)

  useGSAP(
    () => {
      scrollEntranceStagger(gridRef.current, '.performer-card')
    },
    { scope: gridRef, dependencies: [champions.length] },
  )

  return (
    <div className="page-section">
      <h2 className="card-title">Top Performers by Role</h2>
      <p className="card-subtitle">Highest win rate with minimum 5 picks</p>
      <div ref={gridRef} className="performer-grid performer-grid-5">
        {bestByRoleEntries.map(({ role, champion }) => {
          const color = roleColor(role)
          return (
            <div key={role} className="performer-card performer-card-static">
              <div className="performer-card-role" style={{ color }}>
                {roleLabel(role)}
              </div>
              {champion ? (
                <>
                  <div className="performer-card-name">{champion.name}</div>
                  <div className="performer-card-stats">
                    <span className="text-accent">{champion.winrate.toFixed(1)}% WR</span>
                    <span className="text-secondary"> · {champion.avgKda.toFixed(2)} KDA</span>
                  </div>
                  <MiniSparkline data={champion.sparkline ?? []} color={color} />
                </>
              ) : (
                <div className="text-dim text-sm">No qualifying data</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
