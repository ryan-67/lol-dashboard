import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { Player, Team } from '../../hooks/useDashboardData'
import { teamMatchesCanonical } from '../../lib/entities/slugs'
import { radarColorForTeam } from '../../lib/entities/teamBrandColor'
import { formatNum } from '../../lib/format'
import { animateBarGrow } from '../../theme/animations'
import ShareableChart from '../ui/ShareableChart'
import { TeamLogo } from '../entities'

interface ComparisonRow {
  label: string
  a: number
  b: number
  digits: number
  signed?: boolean
}

interface SeriesComparisonBarsProps {
  teamA: string
  teamB: string
  league?: string
  teams: Team[]
  players: Player[]
}

function sumVision(players: Player[], teamName: string): number {
  return players
    .filter((p) => p.team === teamName || teamMatchesCanonical(p.team, teamName))
    .reduce(
      (sum, p) =>
        sum +
        (p.gameLog ?? []).reduce(
          (s, g) => s + (typeof g.visionScore === 'number' ? g.visionScore : 0),
          0,
        ),
      0,
    )
}

/**
 * Cumulative series totals as mirrored tug-of-war bars — who won each
 * front of the series (combat, objectives, vision, early game).
 */
export default function SeriesComparisonBars({
  teamA,
  teamB,
  league,
  teams,
  players,
}: SeriesComparisonBarsProps) {
  const sectionRef = useRef<HTMLDivElement>(null)

  const rows = useMemo<ComparisonRow[]>(() => {
    const a = teams.find((t) => t.name === teamA || teamMatchesCanonical(t.name, teamA))
    const b = teams.find((t) => t.name === teamB || teamMatchesCanonical(t.name, teamB))
    if (!a || !b) return []

    const candidates: ComparisonRow[] = [
      { label: 'Kills', a: a.kills ?? 0, b: b.kills ?? 0, digits: 0 },
      { label: 'Avg GD@15', a: a.avgGd15 ?? 0, b: b.avgGd15 ?? 0, digits: 0, signed: true },
      { label: 'Towers', a: a.towers, b: b.towers, digits: 0 },
      { label: 'Dragons', a: a.dragons, b: b.dragons, digits: 0 },
      { label: 'Barons', a: a.barons, b: b.barons, digits: 0 },
      { label: 'Heralds', a: a.heralds, b: b.heralds, digits: 0 },
      { label: 'Void Grubs', a: a.voidGrubs ?? 0, b: b.voidGrubs ?? 0, digits: 0 },
      { label: 'Vision', a: sumVision(players, teamA), b: sumVision(players, teamB), digits: 0 },
    ]

    return candidates.filter((row) => row.a !== 0 || row.b !== 0)
  }, [teams, players, teamA, teamB])

  useGSAP(
    () => {
      animateBarGrow(sectionRef.current, '.series-cmp-fill')
    },
    { scope: sectionRef, dependencies: [rows.length] },
  )

  if (rows.length < 2) return null

  const colorA = radarColorForTeam(teamA, league)
  const colorB = radarColorForTeam(teamB, league)

  const fmt = (v: number, row: ComparisonRow) =>
    row.signed && v > 0 ? `+${formatNum(v, row.digits)}` : formatNum(v, row.digits)

  return (
    <ShareableChart ref={sectionRef} className="series-cmp">
      <div className="series-cmp-legend">
        <span className="series-cmp-legend-team" style={{ color: colorA }}>
          <TeamLogo name={teamA} size={16} />
          {teamA}
        </span>
        <span className="series-cmp-legend-team" style={{ color: colorB }}>
          <TeamLogo name={teamB} size={16} />
          {teamB}
        </span>
      </div>
      <div className="series-cmp-rows">
        {rows.map((row) => {
          const magA = Math.abs(row.a)
          const magB = Math.abs(row.b)
          const max = Math.max(magA, magB, 1e-6)
          const aLeads = row.a > row.b
          const bLeads = row.b > row.a
          return (
            <div key={row.label} className="series-cmp-row">
              <span
                className={`series-cmp-value series-cmp-value-a${aLeads ? ' series-cmp-leading' : ''}`}
              >
                {fmt(row.a, row)}
              </span>
              <div className="series-cmp-track series-cmp-track-a">
                <div
                  className="series-cmp-fill series-cmp-fill-a"
                  style={{
                    width: `${(magA / max) * 100}%`,
                    background: colorA,
                    opacity: aLeads ? 0.95 : 0.4,
                  }}
                />
              </div>
              <span className="series-cmp-label">{row.label}</span>
              <div className="series-cmp-track series-cmp-track-b">
                <div
                  className="series-cmp-fill series-cmp-fill-b"
                  style={{
                    width: `${(magB / max) * 100}%`,
                    background: colorB,
                    opacity: bLeads ? 0.95 : 0.4,
                  }}
                />
              </div>
              <span
                className={`series-cmp-value series-cmp-value-b${bLeads ? ' series-cmp-leading' : ''}`}
              >
                {fmt(row.b, row)}
              </span>
            </div>
          )
        })}
      </div>
    </ShareableChart>
  )
}
