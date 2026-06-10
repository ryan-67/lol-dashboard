import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { BestChampionByRoleEntry } from '../../lib/entities/entityAnalytics'
import { roleLabel } from '../../lib/championAnalytics'
import type { RoleKey } from '../../lib/playerRadar'
import { ROLES } from '../../lib/playerRadar'
import { formatNum, formatPct } from '../../lib/format'
import { scrollEntranceStagger } from '../../theme/animations'
import ChampionEntityInline from './ChampionEntityInline'

interface TeamBestChampionsByRoleProps {
  byRole: Record<RoleKey, BestChampionByRoleEntry[]>
}

export default function TeamBestChampionsByRole({ byRole }: TeamBestChampionsByRoleProps) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(() => scrollEntranceStagger(ref.current, '.entity-best-champ-row'), {
    scope: ref,
    dependencies: [byRole],
  })

  const hasData = ROLES.some((role) => (byRole[role] ?? []).length > 0)

  return (
    <div ref={ref} className="card">
      <h3 className="card-title">Best Champions by Role</h3>
      <p className="card-subtitle">Winrate, KDA, and performance score on this roster</p>
      {!hasData ? (
        <div className="empty-state text-sm">No champion data for this filter.</div>
      ) : (
        <ul className="entity-best-champ-list">
          {ROLES.map((role) => {
            const top = byRole[role]?.[0]
            if (!top) return null
            return (
              <li key={role} className="entity-best-champ-row">
                <span className="entity-best-champ-role">{roleLabel(role)}</span>
                <ChampionEntityInline name={top.champion} iconSize={22} />
                <span className="entity-best-champ-stat">{formatPct(top.winrate, 1)} WR</span>
                <span className="entity-best-champ-stat">{formatNum(top.kda, 2)} KDA</span>
                <span className="entity-best-champ-stat text-accent">
                  {top.perfScore.toFixed(0)} perf
                </span>
                <span className="text-secondary text-xs">{top.games}g</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
