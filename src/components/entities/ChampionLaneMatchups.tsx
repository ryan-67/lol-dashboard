import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Player } from '../../hooks/useDashboardData'
import { buildChampionLaneMatchups, type LaneMatchupRow } from '../../lib/championMatchups'
import { roleLabel } from '../../lib/championAnalytics'
import { ROLES } from '../../lib/playerRadar'
import { formatPct } from '../../lib/format'
import { RESULT_COLORS } from '../../theme/chartTheme'
import { animateBarGrow } from '../../theme/animations'
import ChampionEntityInline from './ChampionEntityInline'
import ShareableChart from '../ui/ShareableChart'

interface ChampionLaneMatchupsProps {
  championName: string
  players: Player[]
}

function MatchupColumn({
  title,
  rows,
  tone,
}: {
  title: string
  rows: LaneMatchupRow[]
  tone: 'favorable' | 'hard'
}) {
  const color = tone === 'favorable' ? RESULT_COLORS.win : RESULT_COLORS.loss
  return (
    <div className="lane-matchup-col">
      <h4 className="lane-matchup-col-title">{title}</h4>
      {rows.length ? (
        <ul className="lane-matchup-list">
          {rows.map((row) => (
            <li key={row.opponent} className="lane-matchup-row">
              <ChampionEntityInline name={row.opponent} iconSize={22} />
              <div className="lane-matchup-track">
                <div
                  className="lane-matchup-fill"
                  style={{ width: `${row.winrate}%`, background: color }}
                />
              </div>
              <span className="lane-matchup-wr" style={{ color }}>
                {formatPct(row.winrate, 0)}
              </span>
              <span className="lane-matchup-games text-tertiary">{row.games}g</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-tertiary text-sm">Not enough lane data in this filter.</p>
      )}
    </div>
  )
}

/**
 * Lane matchups reconstructed from game logs: same game + same role +
 * opposite team = a direct lane opponent.
 */
export default function ChampionLaneMatchups({ championName, players }: ChampionLaneMatchupsProps) {
  const sectionRef = useRef<HTMLDivElement>(null)

  const result = useMemo(
    () => buildChampionLaneMatchups(players, championName),
    [players, championName],
  )

  const roleDist = useMemo(() => {
    const total = Object.values(result.roleCounts).reduce((a, b) => a + (b ?? 0), 0)
    if (!total) return []
    return ROLES.filter((r) => (result.roleCounts[r] ?? 0) > 0).map((r) => ({
      role: r,
      games: result.roleCounts[r] ?? 0,
      share: ((result.roleCounts[r] ?? 0) / total) * 100,
    }))
  }, [result.roleCounts])

  useGSAP(
    () => {
      animateBarGrow(sectionRef.current, '.lane-matchup-fill, .lane-role-fill', {
        duration: 0.6,
        stagger: 0.04,
      })
    },
    { scope: sectionRef, dependencies: [result.totalLaneGames, championName] },
  )

  if (!result.favorable.length && !result.hard.length && !roleDist.length) return null

  return (
    <ShareableChart ref={sectionRef} className="card lane-matchup-card">
      <div className="player-chart-header-row">
        <div>
          <h3 className="card-title">Lane Matchups</h3>
          <p className="card-subtitle">
            Reconstructed from head-to-head lane assignments · min 2 games
          </p>
        </div>
        {result.totalLaneGames > 0 ? (
          <div className="player-consistency-stat text-secondary">
            {result.totalLaneGames} lane games
          </div>
        ) : null}
      </div>

      {roleDist.length ? (
        <div className="lane-role-dist">
          {roleDist.map((r) => (
            <div key={r.role} className="lane-role-row">
              <span className="lane-role-label">{roleLabel(r.role)}</span>
              <div className="lane-role-track">
                <div className="lane-role-fill" style={{ width: `${r.share}%` }} />
              </div>
              <span className="lane-role-share text-secondary">
                {formatPct(r.share, 0)} · {r.games}g
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {result.favorable.length || result.hard.length ? (
        <div className="lane-matchup-grid">
          <MatchupColumn title="Favorable" rows={result.favorable} tone="favorable" />
          <MatchupColumn title="Hard" rows={result.hard} tone="hard" />
        </div>
      ) : null}
    </ShareableChart>
  )
}
