import { useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'

export default function Matchups() {
  const { data, loading, filteredTeams, filteredPlayers } = useDashboard()
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')

  const teams = useMemo(
    () => [...filteredTeams].sort((a, b) => a.name.localeCompare(b.name)),
    [filteredTeams]
  )
  const teamAData = useMemo(() => teams.find((t) => t.name === teamA), [teams, teamA])
  const teamBData = useMemo(() => teams.find((t) => t.name === teamB), [teams, teamB])

  const headToHead = useMemo(() => {
    if (!teamA || !teamB || !data) return null
    const matchupRows = ((data as unknown as { matchups?: Array<{
      teamA: string
      teamB: string
      games: number
      winsA: number
      winsB: number
    }> }).matchups ?? [])

    const row = matchupRows.find(
      (m) =>
        (m.teamA === teamA && m.teamB === teamB) ||
        (m.teamA === teamB && m.teamB === teamA)
    )

    if (!row) return null
    const sameOrder = row.teamA === teamA
    return {
      games: row.games,
      winsA: sameOrder ? row.winsA : row.winsB,
      winsB: sameOrder ? row.winsB : row.winsA,
    }
  }, [data, teamA, teamB])

  const comparisonBarData = useMemo(() => {
    if (!teamAData || !teamBData) return []
    return [
      { stat: 'Avg KDA', teamA: teamAData.avgKda, teamB: teamBData.avgKda },
      { stat: 'Avg GD@15', teamA: teamAData.avgGd15, teamB: teamBData.avgGd15 },
      { stat: 'Towers', teamA: teamAData.towers, teamB: teamBData.towers },
      { stat: 'Dragons', teamA: teamAData.dragons, teamB: teamBData.dragons },
      { stat: 'Barons', teamA: teamAData.barons, teamB: teamBData.barons },
      { stat: 'Heralds', teamA: teamAData.heralds, teamB: teamBData.heralds },
    ]
  }, [teamAData, teamBData])

  const positionalMatchups = useMemo(() => {
    const positions = ['top', 'jungle', 'mid', 'adc', 'support']
    return positions.map((position) => {
      const teamAPlayer = filteredPlayers
        .filter((p) => p.team === teamA && p.position.toLowerCase() === position)
        .sort((a, b) => b.games - a.games)[0]
      const teamBPlayer = filteredPlayers
        .filter((p) => p.team === teamB && p.position.toLowerCase() === position)
        .sort((a, b) => b.games - a.games)[0]
      return { position, teamAPlayer, teamBPlayer }
    })
  }, [filteredPlayers, teamA, teamB])

  const championOverlap = useMemo(() => {
    if (!data || !teamA || !teamB) return []
    const teamChampionRows = ((data as unknown as { teamChampions?: Array<{
      team: string
      champion: string
      picks: number
      winrate: number
    }> }).teamChampions ?? [])

    const aChampions = teamChampionRows.filter((r) => r.team === teamA)
    const bChampions = teamChampionRows.filter((r) => r.team === teamB)
    const bByChampion = new Map(bChampions.map((row) => [row.champion, row]))

    return aChampions
      .filter((row) => bByChampion.has(row.champion))
      .map((row) => ({
        champion: row.champion,
        teamAPicks: row.picks,
        teamAWinrate: row.winrate,
        teamBPicks: bByChampion.get(row.champion)?.picks ?? 0,
        teamBWinrate: bByChampion.get(row.champion)?.winrate ?? 0,
      }))
      .sort((a, b) => b.teamAPicks + b.teamBPicks - (a.teamAPicks + a.teamBPicks))
  }, [data, teamA, teamB])

  const swap = () => {
    setTeamA(teamB)
    setTeamB(teamA)
  }

  if (loading && !data) return <div className="text-slate-400">Loading matchup data...</div>

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Team Matchup Comparison</h2>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <select
          value={teamA}
          onChange={(e) => setTeamA(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white min-w-[220px]"
        >
          <option value="">Select Team A</option>
          {teams.map((t) => (
            <option key={t.name} value={t.name}>{t.name} ({t.league})</option>
          ))}
        </select>

        <button
          onClick={swap}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm text-white"
          disabled={!teamA && !teamB}
        >
          Swap
        </button>

        <select
          value={teamB}
          onChange={(e) => setTeamB(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white min-w-[220px]"
        >
          <option value="">Select Team B</option>
          {teams.map((t) => (
            <option key={t.name} value={t.name}>{t.name} ({t.league})</option>
          ))}
        </select>
      </div>

      {!teamAData || !teamBData ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
          select two teams to compare
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-center rounded-md border border-slate-700/70 bg-slate-800/40 p-4">
              <div className="text-xl font-bold text-white">{teamAData.name}</div>
              <div className="text-sm text-slate-400">{teamAData.league}</div>
              <div className="mt-2 text-2xl font-bold text-emerald-400">{teamAData.winrate.toFixed(1)}%</div>
              <div className="text-xs text-slate-500">Win Rate</div>
              <div className="text-xs text-slate-400 mt-2">{teamAData.wins}W - {teamAData.losses}L</div>
            </div>
            <div className="flex flex-col items-center justify-center text-slate-400 text-sm rounded-md border border-slate-700/70 bg-slate-800/20 p-4">
              <div className="text-slate-500 text-xs uppercase tracking-wider">Head to Head</div>
              {headToHead ? (
                <>
                  <div className="text-2xl text-slate-200 font-semibold mt-2">{headToHead.winsA} - {headToHead.winsB}</div>
                  <div className="text-xs text-slate-500 mt-1">{headToHead.games} games played</div>
                </>
              ) : (
                <div className="text-sm text-slate-500 mt-2">no games played</div>
              )}
            </div>
            <div className="text-center rounded-md border border-slate-700/70 bg-slate-800/40 p-4">
              <div className="text-xl font-bold text-white">{teamBData.name}</div>
              <div className="text-sm text-slate-400">{teamBData.league}</div>
              <div className="mt-2 text-2xl font-bold text-blue-400">{teamBData.winrate.toFixed(1)}%</div>
              <div className="text-xs text-slate-500">Win Rate</div>
              <div className="text-xs text-slate-400 mt-2">{teamBData.wins}W - {teamBData.losses}L</div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Team Stat Bars</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonBarData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="stat" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend />
                  <Bar dataKey="teamA" name={teamAData.name} fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="teamB" name={teamBData.name} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Player Matchup Grid</h3>
            <div className="grid grid-cols-1 gap-3">
              {positionalMatchups.map(({ position, teamAPlayer, teamBPlayer }) => (
                <div
                  key={position}
                  className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 border border-slate-800/70 rounded-md p-3"
                >
                  <div className="text-sm">
                    {teamAPlayer ? (
                      <>
                        <div className="text-slate-100 font-medium">{teamAPlayer.name}</div>
                        <div className="text-xs text-slate-400">
                          KDA {teamAPlayer.kda.toFixed(2)} · GD@15 {teamAPlayer.gd15 > 0 ? '+' : ''}
                          {teamAPlayer.gd15.toFixed(1)} · {teamAPlayer.games}g
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500">no data</div>
                    )}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-slate-500 text-center min-w-20">{position}</div>
                  <div className="text-sm text-right">
                    {teamBPlayer ? (
                      <>
                        <div className="text-slate-100 font-medium">{teamBPlayer.name}</div>
                        <div className="text-xs text-slate-400">
                          KDA {teamBPlayer.kda.toFixed(2)} · GD@15 {teamBPlayer.gd15 > 0 ? '+' : ''}
                          {teamBPlayer.gd15.toFixed(1)} · {teamBPlayer.games}g
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500">no data</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Champion Overlap</h3>
            {championOverlap.length === 0 ? (
              <div className="text-sm text-slate-500">
                no data
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-800">
                    <tr>
                      <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2">Champion</th>
                      <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2">{teamAData.name}</th>
                      <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-3 py-2">{teamBData.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {championOverlap.map((row) => (
                      <tr key={row.champion} className="border-b border-slate-800/50 hover:bg-slate-800/40">
                        <td className="px-3 py-2 text-slate-200">{row.champion}</td>
                        <td className="px-3 py-2 text-slate-300">
                          {row.teamAPicks} picks · {row.teamAWinrate.toFixed(1)}% WR
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {row.teamBPicks} picks · {row.teamBWinrate.toFixed(1)}% WR
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
