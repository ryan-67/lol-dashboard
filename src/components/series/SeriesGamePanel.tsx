import type { EnrichedSeriesGame, ResolvedSeries, SeriesGameRosterPlayer } from '../../lib/seriesAnalytics'
import { buildGameRoster, formatKdaLine } from '../../lib/seriesAnalytics'
import type { Player } from '../../hooks/useDashboardData'
import { recapTeamTag } from '../../lib/recapTeamTag'
import ChampionIcon from '../entities/ChampionIcon'
import { TeamLogo } from '../entities'
import { teamMatchesCanonical } from '../../lib/entities/slugs'

interface SeriesGamePanelProps {
  series: ResolvedSeries
  game: EnrichedSeriesGame
  players: Player[]
}

function findTeamDraft(game: EnrichedSeriesGame, team: string) {
  const teams = game.catalog?.teams ?? {}
  if (teams[team]) return teams[team]
  const hit = Object.entries(teams).find(([name]) => teamMatchesCanonical(name, team))
  return hit?.[1] ?? { bans: [], picks: [] }
}

function RosterTable({
  title,
  roster,
}: {
  title: string
  roster: SeriesGameRosterPlayer[]
}) {
  return (
    <div className="series-game-roster">
      <h3 className="card-title">{title}</h3>
      <table className="entity-table entity-table-compact">
        <thead>
          <tr>
            <th>Player</th>
            <th>Champ</th>
            <th>K/D/A</th>
            <th>CS</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((p) => (
            <tr key={`${p.team}-${p.name}`}>
              <td>{p.name}</td>
              <td>
                <ChampionIcon name={p.champion} size={20} />
              </td>
              <td>{formatKdaLine(p.kills, p.deaths, p.assists)}</td>
              <td>{p.totalCs ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SeriesGamePanel({ series, game, players }: SeriesGamePanelProps) {
  const roster = buildGameRoster(players, game)
  const rosterA = roster.filter((p) => p.team === series.teamA || teamMatchesCanonical(p.team, series.teamA))
  const rosterB = roster.filter((p) => p.team === series.teamB || teamMatchesCanonical(p.team, series.teamB))
  const draftA = findTeamDraft(game, series.teamA)
  const draftB = findTeamDraft(game, series.teamB)

  return (
    <div className="series-game-panel">
      <header className="series-game-header">
        <div>
          <TeamLogo name={series.teamA} size={24} />
          <span>{recapTeamTag(series.teamA)}</span>
          <span className="series-game-score">
            {game.winner === series.teamA ? 'WIN' : 'LOSS'}
          </span>
        </div>
        <div className="series-game-meta">
          <span>Game {game.gameNumber}</span>
          <span>{game.durationLabel}</span>
          {game.patch ? <span>Patch {game.patch}</span> : null}
        </div>
        <div>
          <span className="series-game-score">
            {game.winner === series.teamB ? 'WIN' : 'LOSS'}
          </span>
          <span>{recapTeamTag(series.teamB)}</span>
          <TeamLogo name={series.teamB} size={24} />
        </div>
      </header>

      <div className="overview-grid overview-grid-2">
        <section className="card">
          <h3 className="card-title">Draft — {recapTeamTag(series.teamA)}</h3>
          <p className="card-subtitle">Bans</p>
          <div className="series-draft-icons">
            {(draftA.bans ?? []).map((c) => (
              <ChampionIcon key={c} name={c} size={22} />
            ))}
          </div>
          <p className="card-subtitle mt-2">Picks</p>
          <div className="series-draft-icons">
            {(draftA.picks ?? []).map((c) => (
              <ChampionIcon key={c} name={c} size={28} />
            ))}
          </div>
        </section>
        <section className="card">
          <h3 className="card-title">Draft — {recapTeamTag(series.teamB)}</h3>
          <p className="card-subtitle">Bans</p>
          <div className="series-draft-icons">
            {(draftB.bans ?? []).map((c) => (
              <ChampionIcon key={c} name={c} size={22} />
            ))}
          </div>
          <p className="card-subtitle mt-2">Picks</p>
          <div className="series-draft-icons">
            {(draftB.picks ?? []).map((c) => (
              <ChampionIcon key={c} name={c} size={28} />
            ))}
          </div>
        </section>
      </div>

      <div className="overview-grid overview-grid-2">
        <RosterTable title={recapTeamTag(series.teamA)} roster={rosterA} />
        <RosterTable title={recapTeamTag(series.teamB)} roster={rosterB} />
      </div>
    </div>
  )
}
