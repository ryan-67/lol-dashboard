import { useDashboard } from '../context/DashboardContext'
import StatCard from '../components/StatCard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Overview() {
  const { data, filteredTeams, filteredPlayers, filteredChampions, loading } = useDashboard()

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-900 rounded-lg p-4 border border-slate-800 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const topTeams = [...filteredTeams].sort((a, b) => b.winrate - a.winrate).slice(0, 5)
  const topPlayers = [...filteredPlayers].sort((a, b) => b.kda - a.kda).slice(0, 5)
  const topChamps = [...filteredChampions].sort((a, b) => b.presence - a.presence).slice(0, 5)

  const totalGames = filteredTeams.reduce((sum, t) => sum + t.games, 0)
  const avgWinrate = filteredTeams.length
    ? filteredTeams.reduce((sum, t) => sum + t.winrate, 0) / filteredTeams.length
    : 0

  const chartData = topTeams.map((t) => ({
    name: t.name.length > 12 ? t.name.slice(0, 12) + '...' : t.name,
    winrate: Number(t.winrate.toFixed(1)),
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Teams" value={filteredTeams.length} />
        <StatCard title="Players" value={filteredPlayers.length} />
        <StatCard title="Total Games" value={totalGames} />
        <StatCard title="Avg Winrate" value={`${avgWinrate.toFixed(1)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Top Teams by Winrate</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#475569" fontSize={12} />
                <YAxis dataKey="name" type="category" width={100} stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(v: number) => [`${v}%`, 'Winrate']}
                />
                <Bar dataKey="winrate" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#3b82f6' : '#1e40af'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Top Players by KDA</h2>
          <div className="space-y-2">
            {topPlayers.map((p, i) => (
              <div
                key={p.name}
                className="flex items-center justify-between py-2 px-3 rounded hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-4">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.team} · {p.position}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-blue-400">{p.kda}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-4">Most Present Champions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {topChamps.map((c) => (
            <div
              key={c.name}
              className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 hover:border-slate-600 transition-colors"
            >
              <p className="text-sm font-medium text-slate-200">{c.name}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-slate-500">{c.presence.toFixed(1)}% pres</span>
                <span className="text-xs text-blue-400">{c.winrate.toFixed(1)}% wr</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
