import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchLiveHub } from '../lib/live/loadLive'
import { matchesLeagueFilter } from '../lib/live/leagues'
import { isLiveMockMode } from '../lib/live/citoLiveClient'
import type { LeagueFilter, LiveMatchSummary } from '../lib/live/types'
import { LeagueFilterTabs, LiveMatchList } from '../components/live'

const POLL_INTERVAL_MS = 15_000

export default function Live() {
  const [matches, setMatches] = useState<LiveMatchSummary[]>([])
  const [filter, setFilter] = useState<LeagueFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const mockMode = isLiveMockMode()
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    let timer: ReturnType<typeof setInterval> | null = null

    async function load() {
      const rows = await fetchLiveHub()
      if (!mountedRef.current) return
      setMatches(rows)
      setLoading(false)
      setLoadedOnce(true)
    }

    void load()
    timer = setInterval(load, POLL_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      if (timer) clearInterval(timer)
    }
  }, [])

  const counts = useMemo(() => {
    const c: Partial<Record<LeagueFilter, number>> = {}
    for (const f of ['ALL', 'LCK', 'LPL', 'LEC', 'LCS'] as LeagueFilter[]) {
      c[f] = matches.filter(
        (m) => m.state === 'live' && matchesLeagueFilter(f, m.leagueSlug, m.league),
      ).length
    }
    return c
  }, [matches])

  const filtered = useMemo(
    () => matches.filter((m) => matchesLeagueFilter(filter, m.leagueSlug, m.league)),
    [matches, filter],
  )

  const liveCount = matches.filter((m) => m.state === 'live').length

  return (
    <div className="page-section live-hub">
      <div className="live-hub-head">
        <div>
          <h1 className="page-title live-hub-title">
            Live Match Hub
            {liveCount > 0 ? (
              <span className="live-hub-live-count">
                <span className="live-badge-dot" />
                {liveCount} live
              </span>
            ) : null}
          </h1>
          <p className="entity-filter-notice">
            Live games and confirmed upcoming matches across tier-1 leagues and international events.
          </p>
        </div>
      </div>

      {mockMode ? (
        <div className="live-mock-note">
          Demo mode — showing sample match data so the hub is viewable outside a live game.
        </div>
      ) : null}

      <LeagueFilterTabs active={filter} counts={counts} onChange={setFilter} />

      {loading && !loadedOnce ? (
        <div className="empty-state">Loading matches…</div>
      ) : (
        <LiveMatchList matches={filtered} />
      )}
    </div>
  )
}
