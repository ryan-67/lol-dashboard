import type { LiveMatchSummary, LiveState } from './types'

/**
 * Static schedule cache built from CitoAPI (`scripts/cito/sync-schedule.ts` →
 * `public/data/cito_schedule_cache.json`). This is the always-available source
 * for confirmed upcoming matches in the Live hub: it works even when the
 * `cito-live` edge function is not deployed, and is cross-checkable against the
 * official Riot (lolesports.com) schedule by the sync job.
 */

const CACHE_URL = `${import.meta.env.BASE_URL}data/cito_schedule_cache.json`

interface ScheduleCacheRow {
  match_id: string
  league: string
  tournament_name?: string | null
  team_a: string
  team_b: string
  scheduled_at?: string | null
  status?: string | null
  block_name?: string | null
  team_a_score?: number | null
  team_b_score?: number | null
}

interface ScheduleCache {
  generated_at?: string
  rows?: ScheduleCacheRow[]
}

let cachePromise: Promise<LiveMatchSummary[]> | null = null

function stateFromStatus(status: string | null | undefined): LiveState {
  const s = (status ?? '').toLowerCase()
  if (s === 'live' || s === 'inprogress' || s === 'in_progress') return 'live'
  if (s === 'completed' || s === 'resolved' || s === 'finished') return 'completed'
  return 'upcoming'
}

function rowToSummary(row: ScheduleCacheRow): LiveMatchSummary | null {
  if (!row.match_id) return null
  return {
    matchId: row.match_id,
    league: row.league || 'LoL',
    leagueSlug: null,
    tournamentName: row.tournament_name ?? row.block_name ?? null,
    blockName: row.block_name ?? null,
    bestOf: null,
    startTime: row.scheduled_at ?? null,
    state: stateFromStatus(row.status),
    team1: {
      slug: '',
      name: row.team_a || 'TBD',
      code: null,
      logoUrl: null,
      score: row.team_a_score ?? null,
    },
    team2: {
      slug: '',
      name: row.team_b || 'TBD',
      code: null,
      logoUrl: null,
      score: row.team_b_score ?? null,
    },
    currentGameId: null,
    currentGameNumber: null,
    statsAvailable: false,
  }
}

/** Load confirmed schedule rows from the static CitoAPI schedule cache. */
export async function fetchScheduleCache(): Promise<LiveMatchSummary[]> {
  if (!cachePromise) {
    cachePromise = fetch(CACHE_URL, { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) return []
        const body = (await res.json()) as ScheduleCache
        return (body.rows ?? [])
          .map(rowToSummary)
          .filter((s): s is LiveMatchSummary => s != null)
      })
      .catch(() => [])
  }
  return cachePromise
}
