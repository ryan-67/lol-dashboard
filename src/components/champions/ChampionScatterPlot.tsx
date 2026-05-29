import { useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { Champion } from '../../hooks/useDashboardData'
import { useDashboard } from '../../context/DashboardContext'
import {
  ROLES,
  championHasRole,
  roleColor,
  roleLabel,
  scatterCohortAverages,
  scatterPickRate,
  scatterWinRate,
  totalGamesInCohort,
} from '../../lib/championAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import RoleToggleLegend from '../ui/RoleToggleLegend'
import { scrollEntrance } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

const championScatterTooltip = makeChartTooltipContent(
  (props) => (props.payload?.[0]?.payload as { name?: string })?.name,
  (props) => {
    const row = props.payload?.[0]?.payload as {
      x?: number
      y?: number
      picks?: number
      bans?: number
    }
    if (!row) return []
    return [
      { label: 'Pick Rate', value: `${Number(row.x ?? 0).toFixed(1)}%` },
      { label: 'Win Rate', value: `${Number(row.y ?? 0).toFixed(1)}%` },
      { label: 'Picks', value: String(row.picks ?? 0) },
      { label: 'Bans', value: String(row.bans ?? 0) },
    ]
  },
)

interface ChampionScatterPlotProps {
  champions: Champion[]
  focusedName: string | null
  onFocus: (name: string | null) => void
}

const AXIS_LABEL = {
  fill: CHART.tick,
  fontSize: CHART.fontSize,
  fontFamily: CHART.fontFamily,
}

const REF_LABEL = {
  value: 'Cohort average',
  position: 'insideTopRight' as const,
  fill: CHART.tick,
  fontSize: 11,
  fontFamily: CHART.fontFamily,
}

const ROLE_LEGEND_ITEMS = ROLES.map((role) => ({
  key: role,
  label: roleLabel(role),
  color: roleColor(role),
}))

export default function ChampionScatterPlot({
  champions,
  focusedName,
  onFocus,
}: ChampionScatterPlotProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [hoverName, setHoverName] = useState<string | null>(null)
  const [hiddenRoles, setHiddenRoles] = useState<Set<string>>(() => new Set())
  const { filteredTeams } = useDashboard()

  const totalGames = useMemo(() => totalGamesInCohort(filteredTeams), [filteredTeams])
  const averages = useMemo(
    () => scatterCohortAverages(champions, totalGames),
    [champions, totalGames],
  )

  const scatterByRole = useMemo(
    () =>
      ROLES.map((role) => ({
        role,
        color: roleColor(role),
        data: champions
          .filter((c) => championHasRole(c, role))
          .map((c) => ({
            ...c,
            x: scatterPickRate(c, totalGames),
            y: scatterWinRate(c),
            z: c.games ?? c.picks,
            key: c.name,
          })),
      })),
    [champions, totalGames],
  )

  const visibleScatterGroups = useMemo(
    () => scatterByRole.filter((g) => !hiddenRoles.has(g.role)),
    [scatterByRole, hiddenRoles],
  )

  const activeName = focusedName ?? hoverName

  const toggleRole = (role: string) => {
    setHiddenRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  useGSAP(
    () => {
      scrollEntrance(sectionRef.current)
    },
    { scope: sectionRef, dependencies: [champions.length, focusedName, hiddenRoles.size] },
  )

  return (
    <div ref={sectionRef} className="card page-section">
      <h2 className="card-title">Win Rate vs Pick Rate</h2>
      <p className="card-subtitle">
        Dot size = games played · dashed lines = cohort average · click legend to filter roles
        {focusedName ? ` · focused: ${focusedName}` : ''}
      </p>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 24 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="Pick Rate"
              domain={[0, 100]}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => `${v}%`}
              label={{ value: 'Pick Rate', position: 'insideBottom', offset: -8, ...AXIS_LABEL }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Win Rate"
              domain={[0, 100]}
              stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: 'Win Rate',
                angle: -90,
                position: 'insideLeft',
                ...AXIS_LABEL,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 380]} />
            <ReferenceLine
              x={averages.pickRate}
              stroke="rgba(240, 236, 226, 0.25)"
              strokeDasharray="4 4"
              label={REF_LABEL}
            />
            <ReferenceLine
              y={averages.winrate}
              stroke="rgba(240, 236, 226, 0.25)"
              strokeDasharray="4 4"
              label={REF_LABEL}
            />
            <Tooltip
              content={championScatterTooltip}
              cursor={{ strokeDasharray: '3 3', stroke: CHART.grid }}
            />
            {visibleScatterGroups.map((group) => (
              <Scatter
                key={group.role}
                name={group.role}
                data={group.data}
                fill={group.color}
                fillOpacity={1}
                onClick={(p) => {
                  const name = (p as { name: string }).name
                  onFocus(activeName === name ? null : name)
                }}
                onMouseEnter={(p) => setHoverName((p as { name: string }).name)}
                onMouseLeave={() => setHoverName(null)}
              >
                {group.data.map((entry) => {
                  const isActive = activeName === entry.name
                  return (
                    <Cell
                      key={entry.name}
                      fill={isActive ? CHART.accent : group.color}
                      stroke={isActive ? CHART.accent : group.color}
                      strokeWidth={isActive ? 2 : 1}
                    />
                  )
                })}
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <RoleToggleLegend
        items={ROLE_LEGEND_ITEMS}
        hiddenKeys={hiddenRoles}
        onToggle={toggleRole}
        onReset={() => setHiddenRoles(new Set())}
      />
    </div>
  )
}
