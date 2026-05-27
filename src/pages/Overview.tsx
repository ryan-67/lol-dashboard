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

export default function Overview() {
  const { data, filteredTeams, filteredPlayers, filteredChampions, loading, league, split } = useDashboard()

  if (loading && !data) {
    return <div className="bg-slate-900 rounded-lg p-4 border border-slate-800 h-80 animate-pulse" />
  }

  const topTeamsByWinrate = [...filteredTeams]
    .sort((a, b) => b.winrate - a.winrate)
    .slice(0, 8)
    .map((team) => ({
      ...team,
      shortName: team.name.length > 14 ? `${team.name.slice(0, 14)}...` : team.name,
    }))

  const positionColors: Record<string, string> = {
    top: '#f97316',
    jungle: '#22c55e',
    mid: '#a855f7',
    adc: '#3b82f6',
    support: '#eab308',
  }

  const playersByPosition = ['top', 'jungle', 'mid', 'adc', 'support'].map((position) => ({
    position,
    color: positionColors[position],
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
      .map((c) => c.name)
  )

  championScatterData.forEach((champion) => {
    if (top10ChampionLabels.has(champion.name)) {
      champion.label = champion.name
    }
  })

  const hottestPlayers = [...filteredPlayers].sort((a, b) => b.kda - a.kda).slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Top Teams by Winrate</h2>
          <p className="text-xs text-slate-500 mb-4">Top 8 teams in current filter by winrate.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTeamsByWinrate} layout="vertical" margin={{ top: 8, right: 16, left: 28, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(value) => `${value}%`}
                />
                <YAxis dataKey="shortName" type="category" width={112} stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Winrate']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                />
                <Bar dataKey="winrate" radius={[0, 4, 4, 0]}>
                  {topTeamsByWinrate.map((t) => (
                    <Cell key={t.name} fill="#3b82f6" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Player Performance Scatter</h2>
          <p className="text-xs text-slate-500 mb-4">X = GD@15, Y = KDA, bubble size = games, color by role.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="GD@15"
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
                />
                <YAxis type="number" dataKey="y" name="KDA" stroke="#64748b" fontSize={12} />
                <ZAxis type="number" dataKey="z" name="Games" range={[70, 420]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'GD@15') return [`${value > 0 ? '+' : ''}${value}`, name]
                    return [value, name]
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                />
                <Legend />
                {playersByPosition.map((group) => (
                  <Scatter
                    key={group.position}
                    name={group.position}
                    data={group.data}
                    fill={group.color}
                    fillOpacity={0.8}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Champion Presence vs Winrate</h2>
          <p className="text-xs text-slate-500 mb-4">Bubble size = picks. Labels show top 10 by presence.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Presence"
                  unit="%"
                  domain={[0, 100]}
                  stroke="#64748b"
                  fontSize={12}
                />
                <YAxis type="number" dataKey="y" name="Winrate" unit="%" stroke="#64748b" fontSize={12} />
                <ZAxis type="number" dataKey="z" name="Picks" range={[70, 420]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'Presence' || name === 'Winrate') return [`${value.toFixed(1)}%`, name]
                    return [value, name]
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                />
                <Scatter name="Champions" data={championScatterData} fill="#60a5fa" fillOpacity={0.75}>
                  <LabelList dataKey="label" position="top" fill="#e2e8f0" fontSize={10} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Current Filter Snapshot</h2>
          <p className="text-xs text-slate-500 mb-4">
            League: <span className="text-slate-300">{league}</span> · Split:{' '}
            <span className="text-slate-300">{split}</span>
          </p>
          <div className="h-80 grid grid-cols-1 gap-3">
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-md p-3">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Highest Winrate Team</div>
              <div className="text-xl font-semibold text-slate-100 mt-1">
                {topTeamsByWinrate[0]?.name ?? 'N/A'}
              </div>
              <div className="text-sm text-blue-300 mt-1">
                {topTeamsByWinrate[0] ? `${topTeamsByWinrate[0].winrate.toFixed(1)}% winrate` : ''}
              </div>
            </div>
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-md p-3">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Highest KDA Player</div>
              <div className="text-xl font-semibold text-slate-100 mt-1">
                {hottestPlayers[0]?.name ?? 'N/A'}
              </div>
              <div className="text-sm text-blue-300 mt-1">
                {hottestPlayers[0] ? `${hottestPlayers[0].kda.toFixed(2)} KDA · ${hottestPlayers[0].team}` : ''}
              </div>
            </div>
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-md p-3">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Most Present Champion</div>
              <div className="text-xl font-semibold text-slate-100 mt-1">
                {championScatterData[0]?.name ?? 'N/A'}
              </div>
              <div className="text-sm text-blue-300 mt-1">
                {championScatterData[0] ? `${championScatterData[0].presence.toFixed(1)}% presence` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-4">Hottest Players This Split</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800">
              <tr>
                <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2">Rank</th>
                <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2">Player</th>
                <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2">Team</th>
                <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2">Position</th>
                <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2">KDA</th>
                <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2">Games</th>
              </tr>
            </thead>
            <tbody>
              {hottestPlayers.map((player, index) => (
                <tr key={player.name} className="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors">
                  <td className="px-3 py-2 text-slate-500 font-semibold">#{index + 1}</td>
                  <td className="px-3 py-2 text-white font-medium">{player.name}</td>
                  <td className="px-3 py-2 text-slate-300">{player.team}</td>
                  <td className="px-3 py-2 text-slate-400 uppercase">{player.position}</td>
                  <td className="px-3 py-2 text-blue-400 font-semibold">{player.kda.toFixed(2)}</td>
                  <td className="px-3 py-2 text-slate-300">{player.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
