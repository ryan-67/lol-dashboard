import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { WeeklyRecapLine, WeeklyRecapSegment } from '../../lib/weeklyRecap'
import { recapTeamTag } from '../../lib/recapTeamTag'
import { scrollEntranceStagger } from '../../theme/animations'
import EntityLink from '../entities/EntityLink'
import type { Champion, Player } from '../../hooks/useDashboardData'
import { buildRecapEntityPatternsForText, linkifyRecapText, recapTeamsForLine } from '../../lib/recapEntityLink'

interface WeeklyRecapProps {
  lines: WeeklyRecapLine[]
  windowLabel: string
  leagueLabel: string
  players: Player[]
  champions: Champion[]
  title?: string
}

function RecapScoreRow({ line }: { line: WeeklyRecapLine }) {
  const { score } = line
  return (
    <div className="overview-recap-score">
      <EntityLink type="team" name={score.winner} className="overview-recap-team">
        {score.winnerAbbr}
      </EntityLink>
      <span className="overview-recap-score-mid">{score.score}</span>
      <EntityLink type="team" name={score.loser} className="overview-recap-team">
        {score.loserAbbr}
      </EntityLink>
    </div>
  )
}

function RecapSegmentBody({
  seg,
  lineId,
  index,
  players,
  champions,
  teams,
  allPlayers,
}: {
  seg: WeeklyRecapSegment
  lineId: string
  index: number
  players: Player[]
  champions: Champion[]
  teams: string[]
  allPlayers: Player[]
}) {
  if (seg.kind === 'team') {
    return (
      <EntityLink type="team" name={seg.canonicalName} className="overview-recap-team">
        {recapTeamTag(seg.canonicalName)}
      </EntityLink>
    )
  }

  const patterns = buildRecapEntityPatternsForText(seg.value, players, champions, teams)

  return (
    <span key={`${lineId}-t-${index}`}>
      {linkifyRecapText(seg.value, patterns, allPlayers, `${lineId}-t-${index}`)}
    </span>
  )
}

function RecapSummaryBody({
  line,
  players,
  champions,
  allPlayers,
}: {
  line: WeeklyRecapLine
  players: Player[]
  champions: Champion[]
  allPlayers: Player[]
}) {
  const lineTeams = recapTeamsForLine(line)

  return (
    <>
      {line.segments.map((seg, i) => (
        <RecapSegmentBody
          key={`${line.id}-seg-${i}`}
          seg={seg}
          lineId={line.id}
          index={i}
          players={players}
          champions={champions}
          teams={lineTeams}
          allPlayers={allPlayers}
        />
      ))}
    </>
  )
}

export default function WeeklyRecap({
  lines,
  windowLabel,
  leagueLabel,
  players,
  champions,
  title = 'Weekly Recap',
}: WeeklyRecapProps) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(() => scrollEntranceStagger(ref.current, '.overview-recap-item'), {
    scope: ref,
    dependencies: [lines.length],
  })

  return (
    <section ref={ref} className="card overview-hub-card">
      <h2 className="card-title">{title}</h2>
      <p className="card-subtitle">
        {windowLabel} · Series summaries from {leagueLabel}
      </p>
      {!lines.length ? (
        <p className="text-secondary">no match results in this window for the current filter.</p>
      ) : (
        <ul className="overview-recap-list">
          {lines.map((line) => (
            <li key={line.id} className="overview-recap-item">
              <time className="overview-recap-date" dateTime={line.date}>
                {line.dateLabel}
              </time>
              <div className="overview-recap-body">
                <RecapScoreRow line={line} />
                <div className="overview-recap-summary">
                  <RecapSummaryBody
                    line={line}
                    players={players}
                    champions={champions}
                    allPlayers={players}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
