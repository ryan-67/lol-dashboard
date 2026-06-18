import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDashboard } from '../context/DashboardContext'
import Select from '../components/ui/Select'
import AnimatedCounter from '../components/ui/AnimatedCounter'
import {
  PlayerMatchupGrid,
  TeamRadarComparison,
  HighestPriorityChamps,
} from '../components/matchups'
import { TeamLogo } from '../components/entities'

export default function Matchups() {
  const { data, loading, filteredTeams, filteredPlayers, filteredChampions } = useDashboard()
  const [searchParams] = useSearchParams()
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')

  useEffect(() => {
    const a = searchParams.get('teamA')
    const b = searchParams.get('teamB')
    if (a) setTeamA(a)
    if (b) setTeamB(b)
  }, [searchParams])

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

  const swap = () => {
    setTeamA(teamB)
    setTeamB(teamA)
  }

  if (loading && !data) {
    return (
      <div className="card h-32 flex items-center justify-center text-secondary">
        Loading matchup data...
      </div>
    )
  }

  return (
    <div className="page-section">
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
            <option key={`${t.name}|${t.league}`} value={t.name}>
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
            <option key={`${t.name}|${t.league}`} value={t.name}>
              {t.name} ({t.league})
            </option>
          ))}
        </Select>
      </div>

      {!teamAData || !teamBData ? (
        <div className="empty-state">Select two teams to compare</div>
      ) : (
        <>
          <div className="page-section card">
            <div className="matchup-summary">
              <div className="stat-tile text-center">
                <div className="stat-value entity-inline-row justify-center">
                  <TeamLogo name={teamAData.name} size={28} />
                  <span>{teamAData.name}</span>
                </div>
                <div className="text-secondary text-sm">{teamAData.league}</div>
                <div className="mt-2 text-2xl font-medium text-accent">
                  <AnimatedCounter value={teamAData.winrate} suffix="%" />
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
                <div className="stat-value entity-inline-row justify-center">
                  <TeamLogo name={teamBData.name} size={28} />
                  <span>{teamBData.name}</span>
                </div>
                <div className="text-secondary text-sm">{teamBData.league}</div>
                <div className="mt-2 text-2xl font-medium text-accent">
                  <AnimatedCounter value={teamBData.winrate} suffix="%" />
                </div>
                <div className="stat-label mt-1">Win Rate</div>
                <div className="text-secondary text-xs mt-2">
                  {teamBData.wins}W - {teamBData.losses}L
                </div>
              </div>
            </div>
          </div>

          <TeamRadarComparison teamA={teamAData} teamB={teamBData} cohort={filteredTeams} />

          <PlayerMatchupGrid players={filteredPlayers} teamA={teamA} teamB={teamB} />

          <HighestPriorityChamps
            teamChampions={data?.teamChampions ?? []}
            teams={filteredTeams}
            champions={filteredChampions}
            teamAName={teamAData.name}
            teamBName={teamBData.name}
          />
        </>
      )}
    </div>
  )
}
