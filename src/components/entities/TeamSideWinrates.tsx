import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { SideStats, SideWinrates } from '../../lib/entities/entityAnalytics'
import { formatGameLength } from '../../lib/matchupAnalytics'
import { formatNum } from '../../lib/format'
import { scrollEntrance } from '../../theme/animations'

interface SideRow {
  label: string
  blue: string
  red: string
  /** Side with the more favorable value for this metric, or null when not meaningfully comparable. */
  better: 'blue' | 'red' | null
}

function compare(blue: number | null, red: number | null): 'blue' | 'red' | null {
  if (blue == null || red == null || blue === red) return null
  return blue > red ? 'blue' : 'red'
}

function buildRows(sides: SideWinrates): SideRow[] {
  const rows: SideRow[] = [
    {
      label: 'Games',
      blue: `${sides.blue.games}`,
      red: `${sides.red.games}`,
      better: null,
    },
    {
      label: 'Winrate',
      blue: `${sides.blue.winrate.toFixed(1)}%`,
      red: `${sides.red.winrate.toFixed(1)}%`,
      better: compare(sides.blue.winrate, sides.red.winrate),
    },
  ]

  if (sides.blue.avgDuration != null || sides.red.avgDuration != null) {
    rows.push({
      label: 'Avg Duration',
      blue: formatGameLength(sides.blue.avgDuration ?? undefined),
      red: formatGameLength(sides.red.avgDuration ?? undefined),
      better: null,
    })
  }

  if (sides.blue.avgGd15 != null || sides.red.avgGd15 != null) {
    const fmt = (v: SideStats['avgGd15']) => (v != null ? `${v > 0 ? '+' : ''}${formatNum(v, 0)}` : '—')
    rows.push({
      label: 'Avg GD@15',
      blue: fmt(sides.blue.avgGd15),
      red: fmt(sides.red.avgGd15),
      better: compare(sides.blue.avgGd15, sides.red.avgGd15),
    })
  }

  if (sides.blue.avgGpm != null || sides.red.avgGpm != null) {
    rows.push({
      label: 'Team GPM',
      blue: formatNum(sides.blue.avgGpm, 0),
      red: formatNum(sides.red.avgGpm, 0),
      better: compare(sides.blue.avgGpm, sides.red.avgGpm),
    })
  }

  if (sides.blue.killsPerMin != null || sides.red.killsPerMin != null) {
    rows.push({
      label: 'Kills / Min',
      blue: formatNum(sides.blue.killsPerMin, 2),
      red: formatNum(sides.red.killsPerMin, 2),
      better: compare(sides.blue.killsPerMin, sides.red.killsPerMin),
    })
  }

  if (sides.blue.visionPerMin != null || sides.red.visionPerMin != null) {
    rows.push({
      label: 'Vision / Min',
      blue: formatNum(sides.blue.visionPerMin, 2),
      red: formatNum(sides.red.visionPerMin, 2),
      better: compare(sides.blue.visionPerMin, sides.red.visionPerMin),
    })
  }

  if (sides.blue.firstBloodRate != null || sides.red.firstBloodRate != null) {
    rows.push({
      label: 'First Blood %',
      blue: sides.blue.firstBloodRate != null ? `${formatNum(sides.blue.firstBloodRate, 1)}%` : '—',
      red: sides.red.firstBloodRate != null ? `${formatNum(sides.red.firstBloodRate, 1)}%` : '—',
      better: compare(sides.blue.firstBloodRate, sides.red.firstBloodRate),
    })
  }

  return rows
}

export default function TeamSideWinrates({ sides }: { sides: SideWinrates }) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(() => scrollEntrance(ref.current), { scope: ref })

  const rows = useMemo(() => buildRows(sides), [sides])
  const hasData = sides.blue.games > 0 || sides.red.games > 0

  return (
    <div ref={ref} className="card">
      <h3 className="card-title">Blue/Red Side Comparison</h3>
      <p className="card-subtitle">Profile by side of the map.</p>
      {!hasData ? (
        <div className="empty-state text-sm">Side data not available for this filter.</div>
      ) : (
        <div className="side-cmp-table">
          <div className="side-cmp-header">
            <span className="side-cmp-header-side side-cmp-header-blue">Blue</span>
            <span />
            <span className="side-cmp-header-side side-cmp-header-red">Red</span>
          </div>
          {rows.map((row) => (
            <div key={row.label} className="side-cmp-row">
              <span className={`side-cmp-value${row.better === 'blue' ? ' side-cmp-value-better' : ''}`}>
                {row.blue}
              </span>
              <span className="side-cmp-label">{row.label}</span>
              <span className={`side-cmp-value${row.better === 'red' ? ' side-cmp-value-better' : ''}`}>
                {row.red}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
