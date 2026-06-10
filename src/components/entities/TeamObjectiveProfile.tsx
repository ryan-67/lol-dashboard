import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Team } from '../../hooks/useDashboardData'
import { formatGameLength } from '../../lib/matchupAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'
import { formatNum, formatPct } from '../../lib/format'

const tooltip = makeChartTooltipContent(
  (props) => String(props.payload?.[0]?.payload?.label ?? ''),
  (props) => {
    const row = props.payload?.[0]?.payload as { value?: number; unit?: string }
    if (row?.value == null) return []
    return [{ label: 'Value', value: `${row.value}${row.unit ?? ''}` }]
  },
)

export default function TeamObjectiveProfile({ team }: { team: Team }) {
  const ref = useRef<HTMLDivElement>(null)
  const games = Math.max(team.wins + team.losses, 1)
  const killsPg = team.killsPerGame ?? (team.kills ?? 0) / games
  const deathsPg = team.deathsPerGame ?? (team.deaths ?? 0) / games
  const voidGrubsPg = team.voidGrubsPerGame ?? 0
  const dragonsPg = team.dragonsPerGame ?? 0

  const objectiveChart = [
    { label: 'Void grubs / game', value: voidGrubsPg, unit: '' },
    { label: 'Dragons / game', value: dragonsPg, unit: '' },
    { label: 'Heralds / game', value: team.heraldsPerGame ?? 0, unit: '' },
    { label: 'Barons / game', value: team.baronsPerGame ?? 0, unit: '' },
  ]

  useGSAP(() => scrollEntrance(ref.current), { scope: ref, dependencies: [team.name] })

  return (
    <div ref={ref} className="overview-grid overview-grid-2">
      <div className="card">
        <h3 className="card-title">Team Profile</h3>
        <div className="entity-stat-row entity-stat-row-wrap">
          <div className="stat-tile">
            <div className="stat-value">{formatGameLength(team.avgGameLength)}</div>
            <div className="stat-label">Avg Duration</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatNum(killsPg, 1)}</div>
            <div className="stat-label">Kills / Game</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatNum(deathsPg, 1)}</div>
            <div className="stat-label">Deaths / Game</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatPct(team.firstBloodRate ?? 0, 1)}</div>
            <div className="stat-label">First Blood %</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatNum(dragonsPg, 2)}</div>
            <div className="stat-label">Dragons / Game</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Objective Priority</h3>
        <p className="card-subtitle">Void grubs vs dragons vs other objectives (per game)</p>
        <div className="entity-chart-body entity-chart-body-sm">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={objectiveChart} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fill: CHART.tick, fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
                tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
              />
              <Tooltip content={tooltip} />
              <Bar dataKey="value" fill="var(--accent)" radius={0} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
