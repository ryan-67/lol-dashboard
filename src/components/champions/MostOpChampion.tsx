import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Champion } from '../../hooks/useDashboardData'
import {
  computeOpScores,
  getBanRate,
  roleColor,
  roleLabel,
  type OpChampionEntry,
} from '../../lib/championAnalytics'
import { scrollEntrance } from '../../theme/animations'
import { ChampionEntityInline } from '../entities'

interface MostOpChampionProps {
  champions: Champion[]
}

function StatPill({
  label,
  value,
  ratio,
}: {
  label: string
  value: string
  /** 0–1 fill amount relative to the category max / 100% ceiling */
  ratio: number
}) {
  const width = Math.min(100, Math.max(4, ratio * 100))
  return (
    <div className="op-stat-pill">
      <div className="op-stat-pill-label">{label}</div>
      <div className="op-stat-pill-value">{value}</div>
      <div className="op-stat-pill-bar">
        <div className="op-stat-pill-bar-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

/** Percent stats: fill = value / 100. Other stats: fill = value / maxInFilter. */
function barRatio(value: number, max: number, kind: 'pct' | 'max'): number {
  if (kind === 'pct') return Math.min(1, Math.max(0, value / 100))
  if (!max || max <= 0) return 0
  return Math.min(1, Math.max(0, value / max))
}

function SpotlightCard({
  entry,
  maxKda,
}: {
  entry: OpChampionEntry
  maxKda: number
}) {
  const { champion, role, opScore } = entry
  const ban = getBanRate(champion)

  return (
    <div className="op-spotlight card">
      <div className="op-spotlight-header">
        <span className="role-badge" style={{ color: roleColor(role), borderColor: roleColor(role) }}>
          {roleLabel(role)}
        </span>
        <div className="op-score-label">OP Score</div>
        <div className="op-score-value">{opScore.toFixed(2)}</div>
        <h2 className="op-champion-name">
          <ChampionEntityInline name={champion.name} iconSize={22} />
        </h2>
      </div>
      <div className="op-stat-pills">
        <StatPill
          label="Presence"
          value={`${champion.presence.toFixed(1)}%`}
          ratio={barRatio(champion.presence, 100, 'pct')}
        />
        <StatPill
          label="Win Rate"
          value={`${champion.winrate.toFixed(1)}%`}
          ratio={barRatio(champion.winrate, 100, 'pct')}
        />
        <StatPill
          label="Ban Rate"
          value={`${ban.toFixed(1)}%`}
          ratio={barRatio(ban, 100, 'pct')}
        />
        <StatPill
          label="KDA"
          value={champion.avgKda.toFixed(2)}
          ratio={barRatio(champion.avgKda, maxKda, 'max')}
        />
      </div>
    </div>
  )
}

export default function MostOpChampion({ champions }: MostOpChampionProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const { top, runners } = computeOpScores(champions)

  const maxKda = useMemo(() => {
    let max = 0
    for (const c of champions) {
      if (c.avgKda > max) max = c.avgKda
    }
    return max > 0 ? max : 1
  }, [champions])

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [champions.length] },
  )

  if (!top) {
    return (
      <div className="empty-state page-section">Not enough games for OP score calculation</div>
    )
  }

  return (
    <div ref={sectionRef} className="page-section op-spotlight-wrap">
      <h2 className="card-title">Most OP Champion</h2>
      <p className="card-subtitle">Composite z-score across presence, win rate, ban rate, and KDA within role</p>
      <div className="op-spotlight-layout">
        <SpotlightCard entry={top} maxKda={maxKda} />
        <div className="op-runners card">
          <h3 className="card-title">Runner Ups</h3>
          <ul className="op-runner-list">
            {runners.map((entry, index) => (
              <li key={entry.champion.name} className="op-runner-row">
                <span className="text-tertiary">#{index + 2}</span>
                <span className="font-medium">
                  <ChampionEntityInline name={entry.champion.name} iconSize={18} />
                </span>
                <span className="text-accent">{entry.opScore.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
