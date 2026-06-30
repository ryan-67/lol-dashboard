import { fetchLiveResource, isLiveMockMode } from './citoLiveClient'
import { fetchScheduleCache } from './loadScheduleCache'
import {
  adaptDraft,
  adaptGames,
  adaptLiveOverlay,
  adaptMatchDetail,
  adaptPlayerStats,
  adaptScheduleEvent,
  extractLiveList,
  extractScheduleList,
  type LiveOverlay,
} from './liveAdapters'
import { isTrackedLeague } from './leagues'
import type {
  LiveGameSummary,
  LiveMatchRoom,
  LiveMatchSummary,
} from './types'

function applyOverlay(summary: LiveMatchSummary, overlay: LiveOverlay): LiveMatchSummary {
  return {
    ...summary,
    state: 'live',
    currentGameId: overlay.currentGameId ?? summary.currentGameId,
    statsAvailable: overlay.statsAvailable || summary.statsAvailable,
    team1: { ...summary.team1, score: overlay.blueScore ?? summary.team1.score },
    team2: { ...summary.team2, score: overlay.redScore ?? summary.team2.score },
  }
}

/**
 * Fetch all live + confirmed upcoming matches for the hub.
 * Returns tracked-league matches only (tier-1 + international), sorted with
 * live matches first then upcoming by start time.
 */
export async function fetchLiveHub(): Promise<LiveMatchSummary[]> {
  const [todayRaw, upcomingRaw, liveRaw, cacheRows] = await Promise.all([
    fetchLiveResource('schedule-today'),
    fetchLiveResource('schedule-upcoming'),
    fetchLiveResource('live'),
    isLiveMockMode() ? Promise.resolve([] as LiveMatchSummary[]) : fetchScheduleCache(),
  ])

  const byId = new Map<string, LiveMatchSummary>()

  // 1) Static CitoAPI schedule cache (always available — primary upcoming source).
  for (const summary of cacheRows) {
    if (!isTrackedLeague(summary.leagueSlug, summary.league)) continue
    byId.set(summary.matchId, summary)
  }

  // 2) Live edge-function schedule (richer: logos, bestOf) overrides the cache.
  for (const raw of [...extractScheduleList(todayRaw), ...extractScheduleList(upcomingRaw)]) {
    const summary = adaptScheduleEvent(raw)
    if (!summary) continue
    if (!isTrackedLeague(summary.leagueSlug, summary.league)) continue
    byId.set(summary.matchId, summary)
  }

  // Overlay live in-game state.
  const overlays = new Map<string, LiveOverlay>()
  for (const raw of extractLiveList(liveRaw)) {
    const overlay = adaptLiveOverlay(raw)
    if (overlay) overlays.set(overlay.matchId, overlay)
  }
  for (const [matchId, overlay] of overlays) {
    const existing = byId.get(matchId)
    if (existing) {
      byId.set(matchId, applyOverlay(existing, overlay))
    } else {
      // Live match not present in schedule window — fetch detail to enrich.
      const detailRaw = await fetchLiveResource('match', matchId)
      const detail = adaptMatchDetail(detailRaw)
      if (detail?.team1 && detail.team2) {
        const summary: LiveMatchSummary = {
          matchId,
          league: detail.league ?? 'LoL',
          leagueSlug: detail.leagueSlug ?? null,
          tournamentName: detail.tournamentName ?? null,
          blockName: null,
          bestOf: detail.bestOf ?? null,
          startTime: detail.startTime ?? null,
          state: 'live',
          team1: detail.team1,
          team2: detail.team2,
          currentGameId: overlay.currentGameId,
          currentGameNumber: detail.currentGameNumber ?? null,
          statsAvailable: overlay.statsAvailable,
        }
        byId.set(matchId, applyOverlay(summary, overlay))
      }
    }
  }

  const now = Date.now()
  const skipTimeWindow = isLiveMockMode()
  // Show every confirmed upcoming match (sourced from CitoAPI / lolesports),
  // not just the next few hours — only drop matches whose start is in the past.
  const rows = [...byId.values()].filter((m) => {
    if (m.state === 'live') return true
    if (m.state === 'completed') return false
    if (skipTimeWindow) return true
    if (!m.startTime) return true
    const t = Date.parse(m.startTime)
    if (Number.isNaN(t)) return true
    return t >= now - 3 * 3600_000
  })

  rows.sort((a, b) => {
    if (a.state !== b.state) return a.state === 'live' ? -1 : 1
    return (a.startTime ?? '').localeCompare(b.startTime ?? '')
  })

  return rows
}

function pickCurrentGame(
  games: LiveGameSummary[],
  preferredGameId: string | null,
): LiveGameSummary | null {
  if (!games.length) return null
  if (preferredGameId) {
    const match = games.find((g) => g.gameId === preferredGameId)
    if (match) return match
  }
  // Prefer the last game that has any recorded activity, else highest number.
  const withActivity = games.filter(
    (g) => (g.blue?.kills ?? 0) > 0 || (g.red?.kills ?? 0) > 0 || (g.blue?.gold ?? 0) > 0,
  )
  const pool = withActivity.length ? withActivity : games
  return pool.reduce((acc, g) => ((g.gameNumber ?? 0) >= (acc.gameNumber ?? 0) ? g : acc), pool[0])
}

function seriesScore(
  games: LiveGameSummary[],
  team1Slug: string,
  team2Slug: string,
): { a: number; b: number } {
  let a = 0
  let b = 0
  for (const g of games) {
    if (!g.winnerSlug) continue
    if (g.winnerSlug === team1Slug) a += 1
    else if (g.winnerSlug === team2Slug) b += 1
  }
  return { a, b }
}

/** Assemble a full live match room for `/live/:matchId`. */
export async function fetchMatchRoom(matchId: string): Promise<LiveMatchRoom | null> {
  const [detailRaw, gamesRaw, draftRaw, liveRaw] = await Promise.all([
    fetchLiveResource('match', matchId),
    fetchLiveResource('match-games', matchId),
    fetchLiveResource('match-drafts', matchId),
    fetchLiveResource('live'),
  ])

  const detail = adaptMatchDetail(detailRaw)
  if (!detail || !detail.team1 || !detail.team2) return null

  const games = adaptGames(gamesRaw)

  const overlay = extractLiveList(liveRaw)
    .map(adaptLiveOverlay)
    .find((o): o is LiveOverlay => o?.matchId === matchId)

  const currentGame = pickCurrentGame(games, overlay?.currentGameId ?? null)
  const { a: scoreA, b: scoreB } = seriesScore(games, detail.team1.slug, detail.team2.slug)

  const summary: LiveMatchSummary = {
    matchId,
    league: detail.league ?? 'LoL',
    leagueSlug: detail.leagueSlug ?? null,
    tournamentName: detail.tournamentName ?? null,
    blockName: null,
    bestOf: detail.bestOf ?? null,
    startTime: detail.startTime ?? null,
    state: overlay ? 'live' : (detail.state ?? 'upcoming'),
    team1: { ...detail.team1, score: detail.team1.score ?? scoreA },
    team2: { ...detail.team2, score: detail.team2.score ?? scoreB },
    currentGameId: currentGame?.gameId ?? null,
    currentGameNumber: currentGame?.gameNumber ?? null,
    statsAvailable: overlay?.statsAvailable ?? false,
  }

  // Live player stats for the current game (best-effort).
  let players: LiveMatchRoom['players'] = []
  let notice: string | null = null
  if (currentGame?.gameId) {
    const statsRaw = await fetchLiveResource('game-stats', currentGame.gameId)
    players = adaptPlayerStats(statsRaw)
    if (!players.length) {
      notice =
        summary.state === 'live'
          ? 'Live player stats will appear here once the game feed is published.'
          : 'Player stats will appear here when the next game begins.'
    }
  } else if (summary.state !== 'completed') {
    notice = 'Draft and live stats will appear here once the game begins.'
  }

  const draft = adaptDraft(draftRaw)

  return {
    summary,
    games,
    currentGame,
    players,
    draft,
    statsAvailable: players.length > 0,
    notice,
    updatedAt: new Date().toISOString(),
  }
}
