import type { EnrichedSeriesGame, ResolvedSeries } from '../../lib/seriesAnalytics'
import { recapTeamTag } from '../../lib/recapTeamTag'
import ChampionIcon from '../entities/ChampionIcon'
import { TeamLogo } from '../entities'

interface SeriesDraftSummaryProps {
  series: ResolvedSeries
}

function DraftIcons({ champs, size = 22 }: { champs: string[]; size?: number }) {
  if (!champs.length) return <span className="text-secondary text-xs">—</span>
  return (
    <div className="series-draft-icons">
      {champs.map((c) => (
        <ChampionIcon key={c} name={c} size={size} />
      ))}
    </div>
  )
}

import { teamMatchesCanonical } from '../../lib/entities/slugs'

function teamDraft(game: EnrichedSeriesGame, team: string) {
  const teams = game.catalog?.teams ?? {}
  if (teams[team]) return teams[team]
  const hit = Object.entries(teams).find(([name]) => teamMatchesCanonical(name, team))
  return hit?.[1] ?? { bans: [], picks: [], won: game.winner === team }
}

export default function SeriesDraftSummary({ series }: SeriesDraftSummaryProps) {
  return (
    <div className="series-draft-summary">
      <div className="series-draft-header">
        <span className="series-draft-team-col">{recapTeamTag(series.teamA)}</span>
        <span className="series-draft-center-col">BO{series.games.length >= 5 ? 5 : 3}</span>
        <span className="series-draft-team-col">{recapTeamTag(series.teamB)}</span>
      </div>

      {series.games.map((game) => {
        const draftA = teamDraft(game, series.teamA)
        const draftB = teamDraft(game, series.teamB)
        const aWon = game.winner === series.teamA
        const bWon = game.winner === series.teamB

        return (
          <div key={game.id} className="series-draft-row">
            <div className={`series-draft-side series-draft-side-a${aWon ? ' win' : ' loss'}`}>
              <span className={`series-draft-result${aWon ? ' win' : ' loss'}`}>
                {aWon ? 'WIN' : 'LOSS'}
              </span>
              <TeamLogo name={series.teamA} size={18} />
              <div className="series-draft-picks">
                <DraftIcons champs={draftA.bans ?? []} size={18} />
                <DraftIcons champs={draftA.picks ?? []} size={24} />
              </div>
            </div>

            <div className="series-draft-mid">
              <span className="series-draft-duration">{game.durationLabel}</span>
              {typeof game.players[0]?.gd15 === 'number' ? (
                <span className="series-draft-gd text-accent">
                  {game.winner === series.teamA ? '+' : '−'}
                  {Math.abs(
                    game.players.find((p) => p.team === game.winner)?.gd15 ?? 0,
                  ).toLocaleString()}
                  @15
                </span>
              ) : null}
            </div>

            <div className={`series-draft-side series-draft-side-b${bWon ? ' win' : ' loss'}`}>
              <div className="series-draft-picks">
                <DraftIcons champs={draftB.bans ?? []} size={18} />
                <DraftIcons champs={draftB.picks ?? []} size={24} />
              </div>
              <TeamLogo name={series.teamB} size={18} />
              <span className={`series-draft-result${bWon ? ' win' : ' loss'}`}>
                {bWon ? 'WIN' : 'LOSS'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
