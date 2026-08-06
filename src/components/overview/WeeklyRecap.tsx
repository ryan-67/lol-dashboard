import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import { seriesPath } from '../../lib/seriesPath'
import type { WeeklyRecapLine, WeeklyRecapSegment } from '../../lib/weeklyRecap'
import { recapTeamTag } from '../../lib/recapTeamTag'
import { leagueFromTournamentLabel } from '../../lib/tournamentCatalog'
import { scrollEntranceStagger } from '../../theme/animations'
import EntityLink from '../entities/EntityLink'
import { LeagueLogo } from '../entities'
import type { Champion, Player } from '../../hooks/useDashboardData'
import {
  buildRecapEntityPatternsForText,
  buildRecapLinkAllowlist,
  linkifyRecapText,
  recapTeamsForLine,
  type RecapLinkAllowlist,
} from '../../lib/recapEntityLink'

interface WeeklyRecapProps {
  lines: WeeklyRecapLine[]
  windowLabel?: string
  players: Player[]
  champions: Champion[]
  title?: string
  showSeriesLink?: boolean
  /** How many series to show before View more (default: all). */
  initialVisible?: number
}

function recapTournamentLeague(score: WeeklyRecapLine['score']): string | null {
  return leagueFromTournamentLabel(score.tournamentLabel) ?? score.tournamentLeague ?? null
}

function RecapScoreRow({ line, showSeriesLink }: { line: WeeklyRecapLine; showSeriesLink: boolean }) {
  const { score } = line
  const tournamentLeague = recapTournamentLeague(score)
  return (
    <div className="overview-recap-score">
      <div className="overview-recap-score-main">
        <EntityLink type="team" name={score.winner} className="overview-recap-team">
          {score.winnerAbbr}
        </EntityLink>
        <span className="overview-recap-score-mid">{score.score}</span>
        <EntityLink type="team" name={score.loser} className="overview-recap-team">
          {score.loserAbbr}
        </EntityLink>
        {line.seriesId && showSeriesLink ? (
          <>
            <span className="overview-recap-score-divider">|</span>
            <Link to={seriesPath(line.seriesId)} className="entity-inline-link overview-recap-series-link">
              view series page
            </Link>
          </>
        ) : null}
      </div>
      {score.tournamentLabel ? (
        <span className="overview-recap-tournament">
          {tournamentLeague ? <LeagueLogo league={tournamentLeague} size={14} /> : null}
          <span>{score.tournamentLabel}</span>
        </span>
      ) : null}
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
  allowlist,
}: {
  seg: WeeklyRecapSegment
  lineId: string
  index: number
  players: Player[]
  champions: Champion[]
  teams: string[]
  allPlayers: Player[]
  allowlist: RecapLinkAllowlist
}) {
  if (seg.kind === 'team') {
    return (
      <EntityLink type="team" name={seg.canonicalName} className="overview-recap-team">
        {recapTeamTag(seg.canonicalName)}
      </EntityLink>
    )
  }

  const patterns = buildRecapEntityPatternsForText(
    seg.value,
    players,
    champions,
    teams,
    allowlist,
  )

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
  const allowlist = buildRecapLinkAllowlist(line, players)

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
          allowlist={allowlist}
        />
      ))}
    </>
  )
}

export default function WeeklyRecap({
  lines,
  windowLabel,
  players,
  champions,
  title = 'Weekly Recap',
  showSeriesLink = true,
  initialVisible,
}: WeeklyRecapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const windowKey = `${windowLabel ?? ''}|${lines.length}|${lines[0]?.id ?? ''}`

  useEffect(() => {
    setExpanded(false)
  }, [windowKey])

  const cap = initialVisible && initialVisible > 0 ? initialVisible : lines.length
  const hasMore = lines.length > cap
  const visibleLines = expanded || !hasMore ? lines : lines.slice(0, cap)
  const hiddenCount = Math.max(0, lines.length - cap)

  const handleToggleExpanded = () => {
    setExpanded((prev) => !prev)
  }

  const handleToggleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleToggleExpanded()
    }
  }

  useGSAP(() => scrollEntranceStagger(ref.current, '.overview-recap-item'), {
    scope: ref,
    dependencies: [visibleLines.length, expanded],
  })

  return (
    <section ref={ref} className="card overview-hub-card">
      <h2 className="card-title">{title}</h2>
      {windowLabel ? <p className="card-subtitle">{windowLabel}</p> : null}
      {!lines.length ? (
        <p className="text-secondary">no match results in this window for the current filter.</p>
      ) : (
        <>
          <ul className="overview-recap-list">
            {visibleLines.map((line) => (
              <li key={line.id} className="overview-recap-item">
                <time className="overview-recap-date" dateTime={line.date}>
                  {line.dateLabel}
                </time>
                <div className="overview-recap-body">
                  <RecapScoreRow line={line} showSeriesLink={showSeriesLink} />
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
          {hasMore ? (
            <button
              type="button"
              className="overview-recap-more"
              onClick={handleToggleExpanded}
              onKeyDown={handleToggleKeyDown}
              tabIndex={0}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? 'Show fewer series recaps'
                  : `Show ${hiddenCount} more series recaps in this window`
              }
            >
              {expanded ? 'Show less' : `View more (${hiddenCount} more series)`}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
