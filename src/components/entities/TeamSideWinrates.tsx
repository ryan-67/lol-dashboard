import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { SideWinrates } from '../../lib/entities/entityAnalytics'
import { scrollEntrance } from '../../theme/animations'

export default function TeamSideWinrates({ sides }: { sides: SideWinrates }) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(() => scrollEntrance(ref.current), { scope: ref })

  const hasData = sides.blue.games > 0 || sides.red.games > 0

  return (
    <div ref={ref} className="card">
      <h3 className="card-title">Side Winrates</h3>
      <p className="card-subtitle">Blue vs red side performance</p>
      {!hasData ? (
        <div className="empty-state text-sm">Side data not available for this filter.</div>
      ) : (
        <div className="entity-side-grid">
          <div className="entity-side-tile">
            <div className="entity-side-label">Blue</div>
            <div className="entity-side-value">{sides.blue.winrate.toFixed(1)}%</div>
            <div className="text-secondary text-xs">
              {sides.blue.wins}W - {sides.blue.games - sides.blue.wins}L · {sides.blue.games} games
            </div>
          </div>
          <div className="entity-side-tile">
            <div className="entity-side-label">Red</div>
            <div className="entity-side-value">{sides.red.winrate.toFixed(1)}%</div>
            <div className="text-secondary text-xs">
              {sides.red.wins}W - {sides.red.games - sides.red.wins}L · {sides.red.games} games
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
