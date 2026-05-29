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
import Select from '../components/ui/Select'
import AnimatedCounter from '../components/ui/AnimatedCounter'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { CHART, CHART_TOOLTIP_PROPS, MATCHUP_COLORS } from '../theme/chartTheme'

export default function Matchups() {
  const { data, loading, filteredTeams, filteredPlayers, league, split } = useDashboard()
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  const contentRef = useScrollReveal('.card', [teamA, teamB, league, split])

  const teams = useMemo(
    () => [...filteredTeams].sort((a, b) => a.name.localeCompare(b.name)),
    [filteredTeams],
  )
  const teamAData = useMemo(() => teams.find((t) => t.name === teamA), [teams, teamA])
  const teamBData = useMemo(() => teams.find((t) => t.name === teamB), [teams, teamB])

  const headToHead = useMemo(() => {
    if (!teamA || !teamB || !data) return null
    const matchupRows = data.matchups ?? []

    const row = matchupRows.find(
      (m) =>
        (m.teamA === teamA && m.teamB === teamB) ||
        (m.teamA === teamB && m.teamB === teamA),
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
        .filter((p) => p.team === teamA && (p.position?.toLowerCase() ?? '') === position)
        .sort((a, b) => b.games - a.games)[0]
      const teamBPlayer = filteredPlayers
        .filter((p) => p.team === teamB && (p.position?.toLowerCase() ?? '') === position)
        .sort((a, b) => b.games - a.games)[0]
      return { position, teamAPlayer, teamBPlayer }
    })
  }, [filteredPlayers, teamA, teamB])

  const championOverlap = useMemo(() => {
    if (!data || !teamA || !teamB) return []
    const teamChampionRows = data.teamChampions ?? []

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

  if (loading && !data) {
    return <div className="card h-32 flex items-center justify-center text-secondary">Loading matchup data...</div>
  }

  return (
    <div>
      <h2 className="page-title">Team Matchup Comparison</h2>

      <div className="matchup-controls">
        <Select
          label="Team A"
          className="select-wide"
          value={teamA}
          onChange={(e) => setTeamA(e.target.value)}
        >
          <option value="">Select Team A</option>
          {teams.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.league})
            </option>
          ))}
        </Select>

        <button type="button" onClick={swap} disabled={!teamA && !teamB} className="btn">
          Swap
        </button>

        <Select
          label="Team B"
          className="select-wide"
          value={teamB}
          onChange={(e) => setTeamB(e.target.value)}
        >
          <option value="">Select Team B</option>
          {teams.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.league})
            </option>
          ))}
        </Select>
      </div>

      {!teamAData || !teamBData ? (
        <div className="empty-state">Select two teams to compare</div>
      ) : (
        <div ref={contentRef}>
          <div className="page-section card">
            <div className="matchup-summary">
              <div className="stat-tile text-center">
                <div className="stat-value">{teamAData.name}</div>
                <div className="text-secondary text-sm">{teamAData.league}</div>
                <div className="mt-2 text-2xl font-medium text-accent">
                  {typeof teamAData.winrate === 'number' ? (
                    <AnimatedCounter value={teamAData.winrate} suffix="%" />
                  ) : (
                    '—'
                  )}
                </div>
                <div className="stat-label mt-1">Win Rate</div>
                <div className="text-secondary text-xs mt-2">
                  {teamAData.wins}W - {teamAData.losses}L
                </div>
              </div>

              <div className="stat-tile flex flex-col items-center justify-center text-center">
                <div className="stat-label">Head to Head</div>
                {headToHead ? (
                  <>
                    <div className="stat-value mt-2">
                      {headToHead.winsA} - {headToHead.winsB}
                    </div>
                    <div className="text-tertiary text-xs mt-1">{headToHead.games} games played</div>
                  </>
                ) : (
                  <div className="text-secondary text-sm mt-2">No games played</div>
                )}
              </div>

              <div className="stat-tile text-center">
                <div className="stat-value">{teamBData.name}</div>
                <div className="text-secondary text-sm">{teamBData.league}</div>
                <div className="mt-2 text-2xl font-medium text-accent">
                  {typeof teamBData.winrate === 'number' ? (
                    <AnimatedCounter value={teamBData.winrate} suffix="%" />
                  ) : (
                    '—'
                  )}
                </div>
                <div className="stat-label mt-1">Win Rate</div>
                <div className="text-secondary text-xs mt-2">
                  {teamBData.wins}W - {teamBData.losses}L
                </div>
              </div>
            </div>
          </div>

          <div className="page-section card">
            <h3 className="card-title">Team Stat Bars</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonBarData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="stat"
                    stroke={CHART.axis}
                    tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                  />
                  <YAxis
                    stroke={CHART.axis}
                    tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
                  />
                  <Tooltip {...CHART_TOOLTIP_PROPS} />
                  <Legend
                    wrapperStyle={{
                      fontFamily: CHART.fontFamily,
                      fontSize: CHART.fontSize,
                      color: CHART.tick,
                    }}
                  />
                  <Bar dataKey="teamA" name={teamAData.name} fill={MATCHUP_COLORS.teamA} />
                  <Bar dataKey="teamB" name={teamBData.name} fill={MATCHUP_COLORS.teamB} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="page-section card">
            <h3 className="card-title mb-4">Player Matchup Grid</h3>
            <div className="grid grid-cols-1 gap-3">
              {positionalMatchups.map(({ position, teamAPlayer, teamBPlayer }) => (
                <div key={position} className="matchup-row">
                  <div className="matchup-row-player">
                    {teamAPlayer ? (
                      <>
                        <div className="player-name">{teamAPlayer.name}</div>
                        <div className="player-stats">
                          KDA{' '}
                          {typeof teamAPlayer.kda === 'number' ? teamAPlayer.kda.toFixed(2) : '—'} · GD@15{' '}
                          {typeof teamAPlayer.gd15 === 'number'
                            ? `${teamAPlayer.gd15 > 0 ? '+' : ''}${teamAPlayer.gd15.toFixed(1)}`
                            : '—'}{' '}
                          · {teamAPlayer.games ?? 0}g
                        </div>
                      </>
                    ) : (
                      <div className="text-dim text-xs">No data</div>
                    )}
                  </div>
                  <div className="matchup-row-position">{position}</div>
                  <div className="matchup-row-player align-right">
                    {teamBPlayer ? (
                      <>
                        <div className="player-name">{teamBPlayer.name}</div>
                        <div className="player-stats">
                          KDA{' '}
                          {typeof teamBPlayer.kda === 'number' ? teamBPlayer.kda.toFixed(2) : '—'} · GD@15{' '}
                          {typeof teamBPlayer.gd15 === 'number'
                            ? `${teamBPlayer.gd15 > 0 ? '+' : ''}${teamBPlayer.gd15.toFixed(1)}`
                            : '—'}{' '}
                          · {teamBPlayer.games ?? 0}g
                        </div>
                      </>
                    ) : (
                      <div className="text-dim text-xs">No data</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="page-section card">
            <h3 className="card-title mb-4">Champion Overlap</h3>
            {championOverlap.length === 0 ? (
              <div className="text-secondary text-sm">No shared champion picks between these teams</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Champion</th>
                      <th>{teamAData.name}</th>
                      <th>{teamBData.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {championOverlap.map((row) => (
                      <tr key={row.champion}>
                        <td className="font-medium">{row.champion}</td>
                        <td className="text-secondary">
                          {row.teamAPicks} picks ·{' '}
                          {typeof row.teamAWinrate === 'number'
                            ? `${row.teamAWinrate.toFixed(1)}%`
                            : '—'}{' '}
                          WR
                        </td>
                        <td className="text-secondary">
                          {row.teamBPicks} picks ·{' '}
                          {typeof row.teamBWinrate === 'number'
                            ? `${row.teamBWinrate.toFixed(1)}%`
                            : '—'}{' '}
                          WR
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
