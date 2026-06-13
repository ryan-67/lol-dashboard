import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { WeeklyRecapLine, WeeklyRecapSegment } from '../../lib/weeklyRecap'
import { scrollEntranceStagger } from '../../theme/animations'
import EntityLink from '../entities/EntityLink'
import type { Champion, Player } from '../../hooks/useDashboardData'
import { buildRecapEntityPatterns, linkifyRecapText } from '../../lib/recapEntityLink'

interface WeeklyRecapProps {
  lines: WeeklyRecapLine[]
  windowLabel: string
  leagueLabel: string
  players: Player[]
  champions: Champion[]
  teams: string[]
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
  patterns,
  allPlayers,
}: {
  seg: WeeklyRecapSegment
  lineId: string
  index: number
  patterns: ReturnType<typeof buildRecapEntityPatterns>
  allPlayers: Player[]
}) {
  if (seg.kind === 'team') {
    return (
      <EntityLink
        type="team"
        name={seg.canonicalName}
        className="overview-recap-team"
      >
        {seg.label}
      </EntityLink>
    )
  }

  return (
    <span key={`${lineId}-t-${index}`}>
      {linkifyRecapText(seg.value, patterns, allPlayers, `${lineId}-t-${index}`)}
    </span>
  )
}

function RecapSummaryBody({
  line,
  patterns,
  allPlayers,
}: {
  line: WeeklyRecapLine
  patterns: ReturnType<typeof buildRecapEntityPatterns>
  allPlayers: Player[]
}) {
  return (
    <>
      {line.segments.map((seg, i) => (
        <RecapSegmentBody
          key={`${line.id}-seg-${i}`}
          seg={seg}
          lineId={line.id}
          index={i}
          patterns={patterns}
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
  teams,
}: WeeklyRecapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const entityPatterns = useMemo(
    () => buildRecapEntityPatterns(players, champions, teams),
    [players, champions, teams],
  )

  useGSAP(() => scrollEntranceStagger(ref.current, '.overview-recap-item'), {
    scope: ref,
    dependencies: [lines.length],
  })

  return (
    <section ref={ref} className="card overview-hub-card">
      <h2 className="card-title">Weekly Recap</h2>
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
                    patterns={entityPatterns}
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
