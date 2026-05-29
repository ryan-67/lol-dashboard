import { useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { useDashboard } from '../context/DashboardContext'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  CartesianGrid,
  ZAxis,
  LabelList,
} from 'recharts'
import { makeChartTooltipContent } from '../components/ui/ChartTooltip'
import RoleToggleLegend from '../components/ui/RoleToggleLegend'
import { scrollEntranceStagger } from '../theme/animations'
import {
  ROLES,
  championHasRole,
  roleColor,
  roleLabel,
  scatterPresence,
  scatterWinRate,
  totalGamesInCohort,
} from '../lib/championAnalytics'
import { CHART, roleColor as playerRoleColor } from '../theme/chartTheme'
import AnimatedCounter from '../components/ui/AnimatedCounter'

const ROLE_POSITIONS = ['top', 'jungle', 'mid', 'adc', 'support'] as const

const PLAYER_ROLE_LEGEND = ROLE_POSITIONS.map((position) => ({
  key: position,
  label: position.toUpperCase(),
  color: playerRoleColor(position),
}))

const CHAMPION_ROLE_LEGEND = ROLES.map((role) => ({
  key: role,
  label: roleLabel(role),
  color: roleColor(role),
}))

const AXIS_LABEL_STYLE = {
  fill: CHART.tick,
  fontSize: CHART.fontSize,
  fontFamily: CHART.fontFamily,
}

const teamBarTooltip = makeChartTooltipContent(
  (props) => (props.payload?.[0]?.payload as { name?: string })?.name,
  (props) => {
    const row = props.payload?.[0]?.payload as { winrate?: number }
    if (row?.winrate === undefined) return []
    return [{ label: 'Winrate', value: `${row.winrate.toFixed(1)}%` }]
  },
)

const playerScatterTooltip = makeChartTooltipContent(
  (props) => (props.payload?.[0]?.payload as { name?: string })?.name,
  (props) => {
    const row = props.payload?.[0]?.payload as { gd15?: number; kda?: number; games?: number }
    if (!row) return []
    const rows = []
    if (typeof row.gd15 === 'number') {
      rows.push({
        label: 'GD@15',
        value: `${row.gd15 > 0 ? '+' : ''}${row.gd15.toFixed(1)}`,
      })
    }
    if (typeof row.kda === 'number') {
      rows.push({ label: 'KDA', value: row.kda.toFixed(2) })
    }
    if (typeof row.games === 'number') {
      rows.push({ label: 'Games', value: String(row.games) })
    }
    return rows
  },
)

const championScatterTooltip = makeChartTooltipContent(
  (props) => (props.payload?.[0]?.payload as { name?: string })?.name,
  (props) => {
    const row = props.payload?.[0]?.payload as { x?: number; y?: number; picks?: number }
    if (!row) return []
    const rows = []
    if (typeof row.x === 'number') {
      rows.push({ label: 'Presence', value: `${row.x.toFixed(1)}%` })
    }
    if (typeof row.y === 'number') {
      rows.push({ label: 'Winrate', value: `${row.y.toFixed(1)}%` })
    }
    if (typeof row.picks === 'number') {
      rows.push({ label: 'Picks', value: String(row.picks) })
    }
    return rows
  },
)

export default function Overview() {
  const { filteredTeams, filteredPlayers, filteredChampions, loading, league, split } =
    useDashboard()
  const [hiddenRoles, setHiddenRoles] = useState<Set<string>>(() => new Set())
  const [hiddenChampionRoles, setHiddenChampionRoles] = useState<Set<string>>(() => new Set())

  const chartsGridRef = useRef<HTMLDivElement>(null)
  const snapshotGridRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      scrollEntranceStagger(chartsGridRef.current, '.card')
      scrollEntranceStagger(snapshotGridRef.current, '.card')
      scrollEntranceStagger(tableRef.current, '.card')
    },
    { dependencies: [loading, league, split, hiddenRoles.size, hiddenChampionRoles.size] },
  )

  const totalGames = useMemo(() => totalGamesInCohort(filteredTeams), [filteredTeams])

  const topTeamsByWinrate = useMemo(
    () =>
      [...filteredTeams]
        .sort((a, b) => b.winrate - a.winrate)
        .slice(0, 8)
        .map((team) => ({
          ...team,
          shortName: team.name.length > 14 ? `${team.name.slice(0, 14)}...` : team.name,
        })),
    [filteredTeams],
  )

  const playersByPosition = useMemo(
    () =>
      ROLE_POSITIONS.map((position) => ({
        position,
        color: playerRoleColor(position),
        data: filteredPlayers
          .filter((p) => (p.position?.toLowerCase() ?? '') === position)
          .map((p) => ({
            ...p,
            x: p.gd15,
            y: p.kda,
            z: p.games,
            label: '',
          })),
      })),
    [filteredPlayers],
  )

  const visibleGroups = useMemo(
    () => playersByPosition.filter((g) => !hiddenRoles.has(g.position)),
    [playersByPosition, hiddenRoles],
  )

  const labelPlayerNames = useMemo(() => {
    const all = visibleGroups.flatMap((g) => g.data)
    return new Set(
      [...all]
        .sort((a, b) => b.games - a.games)
        .slice(0, 12)
        .map((p) => p.name),
    )
  }, [visibleGroups])

  const scatterGroups = useMemo(
    () =>
      visibleGroups.map((group) => ({
        ...group,
        data: group.data.map((p) => ({
          ...p,
          label: labelPlayerNames.has(p.name) ? p.name : '',
        })),
      })),
    [visibleGroups, labelPlayerNames],
  )

  const championsByRole = useMemo(
    () =>
      ROLES.map((role) => ({
        role,
        color: roleColor(role),
        data: filteredChampions
          .filter((c) => championHasRole(c, role))
          .map((c) => ({
            ...c,
            x: scatterPresence(c, totalGames),
            y: scatterWinRate(c),
            z: c.picks,
            label: '',
          })),
      })),
    [filteredChampions, totalGames],
  )

  const visibleChampionGroups = useMemo(
    () => championsByRole.filter((g) => !hiddenChampionRoles.has(g.role)),
    [championsByRole, hiddenChampionRoles],
  )

  const top10ChampionLabels = useMemo(
    () =>
      new Set(
        [...filteredChampions]
          .map((c) => ({ name: c.name, presence: scatterPresence(c, totalGames) }))
          .sort((a, b) => b.presence - a.presence)
          .slice(0, 10)
          .map((c) => c.name),
      ),
    [filteredChampions, totalGames],
  )

  const championChartGroups = useMemo(
    () =>
      visibleChampionGroups.map((group) => ({
        ...group,
        data: group.data.map((c) => ({
          ...c,
          label: top10ChampionLabels.has(c.name) ? c.name : '',
        })),
      })),
    [visibleChampionGroups, top10ChampionLabels],
  )

  const hottestPlayers = useMemo(
    () => [...filteredPlayers].sort((a, b) => b.kda - a.kda).slice(0, 10),
    [filteredPlayers],
  )

  const topChampionByPresence = useMemo(() => {
    const ranked = [...filteredChampions]
      .map((c) => ({ ...c, presence: scatterPresence(c, totalGames) }))
      .sort((a, b) => b.presence - a.presence)
    return ranked[0]
  }, [filteredChampions, totalGames])

  const togglePlayerRole = (position: string) => {
    setHiddenRoles((prev) => {
      const next = new Set(prev)
      if (next.has(position)) next.delete(position)
      else next.add(position)
      return next
    })
  }

  const toggleChampionRole = (role: string) => {
    setHiddenChampionRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  if (loading) {
    return <div className="card h-80" />
  }

  return (
    <div>
      <div ref={chartsGridRef} className="overview-section overview-grid overview-grid-2">
        <div className="card">
          <h2 className="card-title">Top Teams by Winrate</h2>
          <p className="card-subtitle">Top 8 teams in current filter by winrate.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topTeamsByWinrate}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 28, bottom: 8 }}
              >
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  stroke={CHART.axis}
                  tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                  tickFormatter={(value) => `${value}%`}
                />
                <YAxis
                  dataKey="shortName"
                  type="category"
                  width={112}
                  stroke={CHART.axis}
                  tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                />
                <Tooltip content={teamBarTooltip} />
                <Bar dataKey="winrate">
                  {topTeamsByWinrate.map((t) => (
                    <Cell key={t.name} fill={CHART.accent} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Player Performance Scatter</h2>
          <p className="card-subtitle">
            X = GD@15, Y = KDA, bubble size = games. Click legend roles to filter.
          </p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="GD@15"
                  stroke={CHART.axis}
                  tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                  tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="KDA"
                  stroke={CHART.axis}
                  tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                />
                <ZAxis type="number" dataKey="z" name="Games" range={[70, 420]} />
                <Tooltip
                  content={playerScatterTooltip}
                  cursor={{ strokeDasharray: '3 3', stroke: CHART.grid }}
                />
                {scatterGroups.map((group) => (
                  <Scatter
                    key={group.position}
                    name={group.position}
                    data={group.data}
                    fill={group.color}
                    fillOpacity={1}
                  >
                    <LabelList
                      dataKey="label"
                      position="top"
                      fill={CHART.tooltip.color}
                      fontSize={9}
                      fontFamily={CHART.fontFamily}
                    />
                  </Scatter>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <RoleToggleLegend
            items={PLAYER_ROLE_LEGEND}
            hiddenKeys={hiddenRoles}
            onToggle={togglePlayerRole}
            onReset={() => setHiddenRoles(new Set())}
            resetLabel="Show All"
          />
        </div>
      </div>

      <div ref={snapshotGridRef} className="overview-section overview-grid overview-grid-2">
        <div className="card">
          <h2 className="card-title">Champion Presence vs Winrate</h2>
          <p className="card-subtitle">
            Bubble size = picks. Labels show top 10 by presence. Click legend to filter roles.
          </p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 24 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Presence"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  stroke={CHART.axis}
                  tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                  label={{
                    value: 'Presence (%)',
                    position: 'insideBottom',
                    offset: -8,
                    ...AXIS_LABEL_STYLE,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Winrate"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  stroke={CHART.axis}
                  tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                  label={{
                    value: 'Winrate (%)',
                    angle: -90,
                    position: 'insideLeft',
                    ...AXIS_LABEL_STYLE,
                  }}
                />
                <ZAxis type="number" dataKey="z" name="Picks" range={[70, 420]} />
                <Tooltip
                  content={championScatterTooltip}
                  cursor={{ strokeDasharray: '3 3', stroke: CHART.grid }}
                />
                {championChartGroups.map((group) => (
                  <Scatter
                    key={group.role}
                    name={group.role}
                    data={group.data}
                    fill={group.color}
                    fillOpacity={1}
                  >
                    <LabelList
                      dataKey="label"
                      position="top"
                      fill={CHART.tooltip.color}
                      fontSize={10}
                      fontFamily={CHART.fontFamily}
                    />
                  </Scatter>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <RoleToggleLegend
            items={CHAMPION_ROLE_LEGEND}
            hiddenKeys={hiddenChampionRoles}
            onToggle={toggleChampionRole}
            onReset={() => setHiddenChampionRoles(new Set())}
          />
        </div>

        <div className="card">
          <h2 className="card-title">Current Filter Snapshot</h2>
          <p className="card-subtitle">
            League: <span className="text-primary">{league}</span> · Split:{' '}
            <span className="text-primary">{split}</span>
          </p>
          <div className="h-80 grid grid-cols-1 gap-3">
            <div className="stat-tile">
              <div className="stat-label">Highest Winrate Team</div>
              <div className="stat-value">{topTeamsByWinrate[0]?.name ?? 'N/A'}</div>
              <div className="stat-meta">
                {topTeamsByWinrate[0] ? (
                  <AnimatedCounter
                    value={topTeamsByWinrate[0].winrate}
                    suffix="% winrate"
                    className="text-accent"
                  />
                ) : (
                  ''
                )}
              </div>
            </div>
            <div className="stat-tile">
              <div className="stat-label">Highest KDA Player</div>
              <div className="stat-value">{hottestPlayers[0]?.name ?? 'N/A'}</div>
              <div className="stat-meta">
                {hottestPlayers[0] ? (
                  <>
                    <AnimatedCounter value={hottestPlayers[0].kda} decimals={2} suffix=" KDA" /> ·{' '}
                    {hottestPlayers[0].team}
                  </>
                ) : (
                  ''
                )}
              </div>
            </div>
            <div className="stat-tile">
              <div className="stat-label">Most Present Champion</div>
              <div className="stat-value">{topChampionByPresence?.name ?? 'N/A'}</div>
              <div className="stat-meta">
                {topChampionByPresence ? (
                  <AnimatedCounter
                    value={topChampionByPresence.presence}
                    suffix="% presence"
                    className="text-accent"
                  />
                ) : (
                  ''
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={tableRef} className="overview-section">
        <div className="card">
          <h2 className="card-title mb-4">Hottest Players This Split</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Position</th>
                  <th>KDA</th>
                  <th>Games</th>
                </tr>
              </thead>
              <tbody>
                {hottestPlayers.map((player, index) => (
                  <tr key={player.name}>
                    <td className="text-tertiary font-medium">#{index + 1}</td>
                    <td className="font-medium">{player.name}</td>
                    <td className="text-secondary">{player.team}</td>
                    <td className="text-secondary uppercase">{player.position}</td>
                    <td className="text-accent font-medium">{player.kda.toFixed(2)}</td>
                    <td className="text-secondary">{player.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
