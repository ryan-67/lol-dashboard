import { useRef } from 'react'
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
  Legend,
  LabelList,
} from 'recharts'
import { scrollEntranceStagger } from '../theme/animations'
import { CHART, roleColor } from '../theme/chartTheme'
import AnimatedCounter from '../components/ui/AnimatedCounter'

export default function Overview() {
  const { data, filteredTeams, filteredPlayers, filteredChampions, loading, league, split } =
    useDashboard()

  const chartsGridRef = useRef<HTMLDivElement>(null)
  const snapshotGridRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      scrollEntranceStagger(chartsGridRef.current, '.card')
      scrollEntranceStagger(snapshotGridRef.current, '.card')
      scrollEntranceStagger(tableRef.current, '.card')
    },
    { dependencies: [loading, league, split] },
  )

  if (loading && !data) {
    return <div className="card h-80" />
  }

  const topTeamsByWinrate = [...filteredTeams]
    .sort((a, b) => b.winrate - a.winrate)
    .slice(0, 8)
    .map((team) => ({
      ...team,
      shortName: team.name.length > 14 ? `${team.name.slice(0, 14)}...` : team.name,
    }))

  const playersByPosition = ['top', 'jungle', 'mid', 'adc', 'support'].map((position) => ({
    position,
    color: roleColor(position),
    data: filteredPlayers
      .filter((p) => (p.position?.toLowerCase() ?? '') === position)
      .map((p) => ({
        ...p,
        x: p.gd15,
        y: p.kda,
        z: p.games,
      })),
  }))

  const championScatterData = filteredChampions.map((c) => ({
    ...c,
    x: c.presence,
    y: c.winrate,
    z: c.picks,
    label: '',
  }))

  const top10ChampionLabels = new Set(
    [...filteredChampions]
      .sort((a, b) => b.presence - a.presence)
      .slice(0, 10)
      .map((c) => c.name),
  )

  championScatterData.forEach((champion) => {
    if (top10ChampionLabels.has(champion.name)) {
      champion.label = champion.name
    }
  })

  const hottestPlayers = [...filteredPlayers].sort((a, b) => b.kda - a.kda).slice(0, 10)
  const topChampionByPresence = [...filteredChampions].sort((a, b) => b.presence - a.presence)[0]

  const tooltipStyle = CHART.tooltip

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
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: CHART.tooltip.color }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Winrate']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                />
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
            X = GD@15, Y = KDA, bubble size = games, color by role.
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
                  cursor={{ strokeDasharray: '3 3', stroke: CHART.grid }}
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => {
                    if (name === 'GD@15') return [`${value > 0 ? '+' : ''}${value}`, name]
                    return [value, name]
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                />
                <Legend
                  wrapperStyle={{
                    fontFamily: CHART.fontFamily,
                    fontSize: CHART.fontSize,
                    color: CHART.tick,
                  }}
                />
                {playersByPosition.map((group) => (
                  <Scatter
                    key={group.position}
                    name={group.position}
                    data={group.data}
                    fill={group.color}
                    fillOpacity={1}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div ref={snapshotGridRef} className="overview-section overview-grid overview-grid-2">
        <div className="card">
          <h2 className="card-title">Champion Presence vs Winrate</h2>
          <p className="card-subtitle">Bubble size = picks. Labels show top 10 by presence.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Presence"
                  unit="%"
                  domain={[0, 100]}
                  stroke={CHART.axis}
                  tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Winrate"
                  unit="%"
                  stroke={CHART.axis}
                  tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                />
                <ZAxis type="number" dataKey="z" name="Picks" range={[70, 420]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: CHART.grid }}
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => {
                    if (name === 'Presence' || name === 'Winrate')
                      return [`${value.toFixed(1)}%`, name]
                    return [value, name]
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                />
                <Scatter name="Champions" data={championScatterData} fill={CHART.accent} fillOpacity={1}>
                  <LabelList
                    dataKey="label"
                    position="top"
                    fill={CHART.tooltip.color}
                    fontSize={10}
                    fontFamily={CHART.fontFamily}
                  />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
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
                  <>
                    <AnimatedCounter
                      value={topTeamsByWinrate[0].winrate}
                      suffix="% winrate"
                      className="text-accent"
                    />
                  </>
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
