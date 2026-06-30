import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchMatchRoom } from '../lib/live/loadLive'
import { isLiveMockMode } from '../lib/live/citoLiveClient'
import type { LiveMatchRoom } from '../lib/live/types'
import {
  LiveDraft,
  LiveGameStatsBar,
  LiveScoreboard,
  LiveStatusBadge,
  LiveTeamLogo,
} from '../components/live'
import { LeagueLogo } from '../components/entities'

const POLL_INTERVAL_MS = 10_000

export default function LiveMatchRoom() {
  const { matchId } = useParams<{ matchId: string }>()
  const [room, setRoom] = useState<LiveMatchRoom | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const mountedRef = useRef(true)
  const mockMode = isLiveMockMode()

  useEffect(() => {
    mountedRef.current = true
    if (!matchId) return
    let timer: ReturnType<typeof setInterval> | null = null

    async function load() {
      const result = await fetchMatchRoom(matchId!)
      if (!mountedRef.current) return
      if (!result) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setRoom(result)
      setLoading(false)
    }

    void load()
    timer = setInterval(load, POLL_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      if (timer) clearInterval(timer)
    }
  }, [matchId])

  if (loading && !room) {
    return (
      <div className="page-section">
        <Link to="/live" className="entity-back-link">← Live Match Hub</Link>
        <div className="empty-state" style={{ marginTop: 24 }}>Loading match…</div>
      </div>
    )
  }

  if (notFound || !room) {
    return (
      <div className="page-section">
        <Link to="/live" className="entity-back-link">← Live Match Hub</Link>
        <div className="empty-state" style={{ marginTop: 24 }}>
          This match isn’t available right now. It may not have started yet.
        </div>
      </div>
    )
  }

  const { summary, currentGame, players, draft, games, notice } = room
  const gameLabel = currentGame?.gameNumber ? `Game ${currentGame.gameNumber}` : 'Game —'

  return (
    <div className="page-section live-room">
      <Link to="/live" className="entity-back-link">← Live Match Hub</Link>

      {mockMode ? (
        <div className="live-mock-note">Demo mode — sample live match data.</div>
      ) : null}

      <header className="live-room-header">
        <div className="live-room-league">
          <LeagueLogo league={summary.league} />
          <span>{summary.league}</span>
          {summary.bestOf ? <span className="live-row-bo">Bo{summary.bestOf}</span> : null}
        </div>

        <div className="live-room-scoreline">
          <div className="live-room-team">
            <LiveTeamLogo name={summary.team1.name} logoUrl={summary.team1.logoUrl} size={48} />
            <span className="live-room-team-name">{summary.team1.name}</span>
          </div>
          <div className="live-room-score">
            <span className="live-room-score-num">{summary.team1.score ?? 0}</span>
            <span className="live-room-score-sep">–</span>
            <span className="live-room-score-num">{summary.team2.score ?? 0}</span>
          </div>
          <div className="live-room-team live-room-team-right">
            <span className="live-room-team-name">{summary.team2.name}</span>
            <LiveTeamLogo name={summary.team2.name} logoUrl={summary.team2.logoUrl} size={48} />
          </div>
        </div>

        <div className="live-room-meta">
          <LiveStatusBadge state={summary.state} startTime={summary.startTime} />
          <span className="live-room-game-label">{gameLabel}</span>
        </div>
      </header>

      <section className="live-room-section">
        <LiveGameStatsBar summary={summary} game={currentGame} />
      </section>

      {notice ? <div className="live-room-notice">{notice}</div> : null}

      <section className="live-room-section">
        <h2 className="card-title live-room-section-title">Scoreboard — {gameLabel}</h2>
        <p className="card-subtitle">Tap a player’s name to reveal detailed live stats.</p>
        <LiveScoreboard
          players={players}
          blueLabel={currentGame?.blue?.name ?? summary.team1.name}
          redLabel={currentGame?.red?.name ?? summary.team2.name}
        />
      </section>

      <section className="live-room-section">
        <h2 className="card-title live-room-section-title">Draft</h2>
        <LiveDraft
          draft={draft}
          blueLabel={currentGame?.blue?.name ?? summary.team1.name}
          redLabel={currentGame?.red?.name ?? summary.team2.name}
        />
      </section>

      {games.length ? (
        <section className="live-room-section">
          <h2 className="card-title live-room-section-title">Games</h2>
          <ul className="live-games-list">
            {games.map((g) => {
              const blueWon = g.winnerSlug && g.blue && g.winnerSlug === g.blue.slug
              const redWon = g.winnerSlug && g.red && g.winnerSlug === g.red.slug
              const isCurrent = currentGame?.gameId === g.gameId
              return (
                <li key={g.gameId} className={`live-games-row${isCurrent ? ' is-current' : ''}`}>
                  <span className="live-games-num">Game {g.gameNumber ?? '—'}</span>
                  <span className={`live-games-team${blueWon ? ' won' : ''}`}>
                    {g.blue?.name ?? 'Blue'} <em>{g.blue?.kills ?? 0}</em>
                  </span>
                  <span className="live-games-sep">vs</span>
                  <span className={`live-games-team${redWon ? ' won' : ''}`}>
                    <em>{g.red?.kills ?? 0}</em> {g.red?.name ?? 'Red'}
                  </span>
                  <span className="live-games-status">
                    {g.winnerSlug ? 'Final' : isCurrent ? 'In progress' : 'Upcoming'}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="live-room-section">
        <div className="live-discussion-teaser">
          <span className="live-discussion-teaser-title">Discussion</span>
          <span className="live-discussion-teaser-note">
            Live discussion threads, reactions and player ratings are coming soon. Sign in to join
            the conversation when they launch.
          </span>
        </div>
      </section>
    </div>
  )
}
