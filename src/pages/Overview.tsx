import { useSearchParams } from 'react-router-dom'
import { players, teams, champions } from '../data/mockData'
import StatCard from '../components/StatCard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Overview() {
  const [searchParams] = useSearchParams()
  const league = searchParams.get('league') || 'All Tier 1'

  const filteredTeams = league === 'All Tier 1' ? teams : teams.filter((t) => t.league === league)
  const filteredPlayers = league === 'All Tier 1' ? players : players.filter((p) => p.league === league)

  const topTeams = [...filteredTeams].sort((a, b) => b.winrate - a.winrate).slice(0, 5)
  const topPlayers = [...filteredPlayers].sort((a, b) => b.kda - a.kda).slice(0, 5)
  const topChamps = [...champions].sort((a, b) => b.presence - a.presence).slice(0, 5)

  const totalGames = filteredTeams.reduce((sum, t) => sum + t.games, 0)
  const avgWinrate = filteredTeams.length ? filteredTeams.reduce((sum, t) => sum + t.winrate, 0) / filteredTeams.length : 0

  const chartData = topTeams.map((t) => ({ name: t.name, winrate: Number(t.winrate.toFixed(1)) }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Teams" value={filteredTeams.length} />
        <StatCard title="Players" value={filteredPlayers.length} />
        <StatCard title="Total Games" value={totalGames} />
        <StatCard title="Avg Winrate" value={`${avgWinrate.toFixed(1)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-850 border border-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Top Teams by Winrate</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={60} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="winrate" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#3b82f6' : '#334155'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-850 border border-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Top Players by KDA</h3>
          <div className="space-y-2">
            {topPlayers.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-4">{i + 1}</span>
                  <span className="text-sm text-white font-medium">{p.name}</span>
                  <span className="text-xs text-slate-500">{p.team}</span>
                  <span className="text-xs text-slate-600 uppercase">{p.position}</span>
                </div>
                <span className="text-sm font-bold text-blue-400">{p.kda.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-850 border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-4">Most Present Champions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {topChamps.map((c) => (
            <div key={c.name} className="bg-slate-900 rounded p-3 text-center">
              <div className="text-sm font-bold text-white">{c.name}</div>
              <div className="text-xs text-slate-400 mt-1">{c.presence}% presence</div>
              <div className="text-xs text-slate-500">{c.winrate}% WR</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
