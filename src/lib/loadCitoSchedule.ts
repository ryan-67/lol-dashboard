import { supabase, isSupabaseConfigured } from './supabaseClient'
import { teamsShareEsportsSlug } from './entities/assets'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
import { isTier1PredictionRow } from './predictions/leagueFilter'
import type { TournamentPlacementHint } from './tournamentRank'

export interface CitoScheduleRow {
  match_id: string
  league: string
  tournament_name: string | null
  team_a: string
  team_b: string
  scheduled_at: string | null
  status: string
  block_name: string | null
  team_a_score?: number | null
  team_b_score?: number | null
  winner_team?: string | null
  /** Series length when present on cito_schedules (may be absent in cache). */
  best_of?: number | null
}

const INTERNATIONAL_SCHEDULE_LEAGUES = new Set([
  'MSI',
  'WLDs',
  'FST',
  'EWC',
  'Worlds',
  'First Stand',
  'Esports World Cup',
])
// Riot GW warehouse cache is the Current SoR; the Cito cache is a soft
// migration fallback filling match_ids the Riot sync has not covered yet.
const RIOT_SCHEDULE_CACHE_URL = `${import.meta.env.BASE_URL}data/riot_schedule_cache.json`
const CITO_SCHEDULE_CACHE_URL = `${import.meta.env.BASE_URL}data/cito_schedule_cache.json`

let scheduleCachePromise: Promise<CitoScheduleRow[]> | null = null

function teamMatchesScheduleName(teamQuery: string, scheduleName: string): boolean {
  if (!scheduleName?.trim()) return false
  const a = resolveTeamCanonicalName(teamQuery).toLowerCase()
  const b = resolveTeamCanonicalName(scheduleName).toLowerCase()
  return (
    a === b ||
    teamMatchesCanonical(teamQuery, scheduleName) ||
    teamsShareEsportsSlug(teamQuery, scheduleName) ||
    scheduleName.toLowerCase().includes(a) ||
    a.includes(scheduleName.toLowerCase())
  )
}

function isTbdTeamName(name: string | null | undefined): boolean {
  const v = (name ?? '').trim().toLowerCase()
  return !v || v === 'tbd' || v === 'tba' || v === '-'
}

function isInternationalScheduleRow(row: CitoScheduleRow): boolean {
  const hay = `${row.league} ${row.tournament_name ?? ''} ${row.block_name ?? ''}`.toLowerCase()
  return (
    INTERNATIONAL_SCHEDULE_LEAGUES.has(row.league) ||
    /\bmsi\b|\bworlds\b|first\s*stand|\bewc\b|esports\s*world\s*cup/.test(hay)
  )
}

function isConfirmedRow(row: CitoScheduleRow): boolean {
  return !isTbdTeamName(row.team_a) && !isTbdTeamName(row.team_b)
}

function tournamentContextKey(row: CitoScheduleRow): string {
  return `${row.league}|${row.tournament_name ?? ''}|${row.block_name ?? ''}`.toLowerCase()
}

function scheduleRowPriority(row: CitoScheduleRow): number {
  if (isConfirmedRow(row) && isInternationalScheduleRow(row)) return 0
  if (isConfirmedRow(row)) return 1
  if (row.status === 'pending results') return 2
  if (isInternationalScheduleRow(row)) return 3
  return 4
}

async function fetchScheduleCacheRows(url: string): Promise<CitoScheduleRow[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const body = (await res.json()) as { rows?: CitoScheduleRow[] }
    return body.rows ?? []
  } catch {
    return []
  }
}

async function loadScheduleCache(): Promise<CitoScheduleRow[]> {
  if (!scheduleCachePromise) {
    scheduleCachePromise = (async () => {
      const [riotRows, citoRows] = await Promise.all([
        fetchScheduleCacheRows(RIOT_SCHEDULE_CACHE_URL),
        fetchScheduleCacheRows(CITO_SCHEDULE_CACHE_URL),
      ])
      const byId = new Map<string, CitoScheduleRow>()
      for (const row of citoRows) byId.set(row.match_id, row)
      for (const row of riotRows) byId.set(row.match_id, row)
      return [...byId.values()]
    })()
  }
  return scheduleCachePromise
}

const SCHEDULE_SELECT_WITH_BEST_OF =
  'match_id, league, tournament_name, team_a, team_b, scheduled_at, status, block_name, best_of'
const SCHEDULE_SELECT_BASE =
  'match_id, league, tournament_name, team_a, team_b, scheduled_at, status, block_name'

async function fetchUpcomingSchedulePool(now: string): Promise<CitoScheduleRow[]> {
  const byId = new Map<string, CitoScheduleRow>()

  if (isSupabaseConfigured) {
    let data: CitoScheduleRow[] | null = null
    let errorMsg: string | null = null

    const withBestOf = await supabase
      .from('cito_schedules')
      .select(SCHEDULE_SELECT_WITH_BEST_OF)
      .in('status', ['scheduled', 'live', 'unstarted', 'tbd'])
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(300)

    if (withBestOf.error && /best_of/i.test(withBestOf.error.message)) {
      const fallback = await supabase
        .from('cito_schedules')
        .select(SCHEDULE_SELECT_BASE)
        .in('status', ['scheduled', 'live', 'unstarted', 'tbd'])
        .gte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(300)
      data = (fallback.data as CitoScheduleRow[] | null) ?? null
      errorMsg = fallback.error?.message ?? null
    } else {
      data = (withBestOf.data as CitoScheduleRow[] | null) ?? null
      errorMsg = withBestOf.error?.message ?? null
    }

    if (errorMsg) {
      console.warn('[cito-schedule] fetch failed', errorMsg)
    } else {
      for (const row of data ?? []) {
        byId.set(row.match_id, row)
      }
    }
  }

  for (const row of await loadScheduleCache()) {
    if (row.scheduled_at && row.scheduled_at >= now) {
      byId.set(row.match_id, row)
    }
  }

  return [...byId.values()].sort((a, b) =>
    (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''),
  )
}

/**
 * Upcoming series for the Predictions board.
 * Merges Cito/lolesports sync with external caches (Leaguepedia EWC, etc.).
 * Confirmed matchups preferred; future international TBD bracket slots kept so
 * EWC finals remain visible before teams are locked.
 */
export async function fetchUpcomingCitoScheduleBoard(options?: {
  limit?: number
}): Promise<CitoScheduleRow[]> {
  const limit = options?.limit ?? 120
  const now = new Date().toISOString()
  const byId = new Map<string, CitoScheduleRow>()

  for (const row of await fetchUpcomingSchedulePool(now)) {
    byId.set(row.match_id, row)
  }

  try {
    const { fetchExternalScheduleRows } = await import('./loadExternalSchedule')
    for (const row of await fetchExternalScheduleRows()) {
      if (!row.scheduled_at || row.scheduled_at < now) continue
      // Prefer Cito row when both exist; external fills Riot-blind events (EWC).
      if (!byId.has(row.match_id)) byId.set(row.match_id, row)
    }
  } catch {
    /* external cache optional */
  }

  const merged = [...byId.values()].sort((a, b) =>
    (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''),
  )

  return merged
    .filter((row) => {
      const status = row.status.toLowerCase()
      if (!['scheduled', 'live', 'unstarted', 'tbd'].includes(status)) return false
      // Predictions board is tier-1 only (LCK/LPL/LEC/LCS + intl). Cito's lol-lck
      // feed often nests Challengers / Academy under league=LCK — drop those here
      // so the limit isn't wasted on academy rows before the UI filter runs.
      if (!isTier1PredictionRow(row)) return false
      if (isConfirmedRow(row)) return true
      // Keep upcoming international TBD slots (EWC GF / 3rd) visible under All Tier-1.
      return isInternationalScheduleRow(row) && status === 'tbd'
    })
    .slice(0, limit)
}

function pendingBracketRows(
  allRows: CitoScheduleRow[],
  teamRows: CitoScheduleRow[],
): CitoScheduleRow[] {
  const intlConfirmed = teamRows.filter(
    (r) => isInternationalScheduleRow(r) && isConfirmedRow(r),
  )
  if (!intlConfirmed.length) return []

  const ref = intlConfirmed.sort((a, b) =>
    (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''),
  )[0]!
  const ctx = tournamentContextKey(ref)
  const refDate = ref.scheduled_at ?? ''

  const pending: CitoScheduleRow[] = []
  for (const row of allRows) {
    if (tournamentContextKey(row) !== ctx) continue
    if (!isTbdTeamName(row.team_a) || !isTbdTeamName(row.team_b)) continue
    if ((row.scheduled_at ?? '') <= refDate) continue
    if (pending.some((p) => p.match_id === row.match_id)) continue
    pending.push({ ...row, status: 'pending results' })
    if (pending.length >= 2) break
  }
  return pending
}

function assembleTeamSchedule(
  teamName: string,
  allRows: CitoScheduleRow[],
  confirmedLimit: number,
): CitoScheduleRow[] {
  const teamRows = allRows.filter(
    (row) =>
      teamMatchesScheduleName(teamName, row.team_a) ||
      teamMatchesScheduleName(teamName, row.team_b),
  )
  const intlConfirmed = teamRows.filter((r) => isInternationalScheduleRow(r) && isConfirmedRow(r))
  const regionalConfirmed = teamRows.filter((r) => !isInternationalScheduleRow(r) && isConfirmedRow(r))
  const confirmed = (intlConfirmed.length ? intlConfirmed : regionalConfirmed)
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
    .slice(0, confirmedLimit)

  const pending = intlConfirmed.length
    ? pendingBracketRows(allRows, teamRows)
    : []

  const seen = new Set<string>()
  return [...confirmed, ...pending]
    .sort((a, b) => {
      const byPriority = scheduleRowPriority(a) - scheduleRowPriority(b)
      if (byPriority !== 0) return byPriority
      return (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')
    })
    .filter((row) => {
      if (seen.has(row.match_id)) return false
      seen.add(row.match_id)
      return true
    })
}

/** Upcoming fixtures from CitoAPI sync (`cito_schedules` table) with static cache fallback. */
export async function fetchTeamUpcomingCitoSchedule(
  teamName: string,
  options?: { league?: string; limit?: number },
): Promise<CitoScheduleRow[]> {
  void options?.league
  const confirmedLimit = options?.limit ?? 3
  const now = new Date().toISOString()
  const allRows = await fetchUpcomingSchedulePool(now)
  return assembleTeamSchedule(teamName, allRows, confirmedLimit)
}

const QUALIFYING_BLOCK_RE =
  /qualif|decider|final|msi|worlds|grand\s*final|knockout|playoffs?/i

function tournamentNameMatches(row: CitoScheduleRow, tournamentDisplayName: string): boolean {
  const hay = `${row.tournament_name ?? ''} ${row.block_name ?? ''} ${row.league}`.toLowerCase()
  const tokens = tournamentDisplayName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
  return tokens.length > 0 && tokens.every((t) => hay.includes(t) || tournamentDisplayName.toLowerCase().includes(t))
}

/** Completed Cito schedule rows for a tournament (standings + placement). */
export async function fetchTournamentCompletedSchedule(
  tournamentDisplayName: string,
  league: string,
): Promise<CitoScheduleRow[]> {
  if (!isSupabaseConfigured) return []

  let query = supabase
    .from('cito_schedules')
    .select(
      'match_id, league, tournament_name, team_a, team_b, scheduled_at, status, block_name, team_a_score, team_b_score, winner_team',
    )
    .in('status', ['completed', 'finished', 'done'])
    .order('scheduled_at', { ascending: true })
    .limit(200)

  if (league && league !== 'All Tier 1') {
    query = query.eq('league', league)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[cito-schedule] tournament completed fetch failed', error.message)
    return []
  }

  return ((data as CitoScheduleRow[] | null) ?? []).filter((row) =>
    tournamentNameMatches(row, tournamentDisplayName),
  )
}

/** Completed Cito schedule rows for bracket / qualification tie-break hints. */
export async function fetchTournamentPlacementHints(
  tournamentDisplayName: string,
  league: string,
): Promise<Map<string, TournamentPlacementHint>> {
  const out = new Map<string, TournamentPlacementHint>()
  const rows = await fetchTournamentCompletedSchedule(tournamentDisplayName, league)
  if (!rows.length) return out

  const lastByTeam = new Map<string, { win: boolean; date: string; block: string }>()
  let rankCounter = 1

  for (const row of rows) {
    const block = row.block_name ?? row.tournament_name ?? ''
    const winner =
      row.winner_team?.trim() ||
      (typeof row.team_a_score === 'number' &&
      typeof row.team_b_score === 'number' &&
      row.team_a_score !== row.team_b_score
        ? row.team_a_score > row.team_b_score
          ? row.team_a
          : row.team_b
        : null)

    if (!winner) continue
    const loser = teamMatchesCanonical(winner, row.team_a) ? row.team_b : row.team_a
    const date = row.scheduled_at ?? ''
    const qualified = QUALIFYING_BLOCK_RE.test(block)

    for (const team of [winner, loser]) {
      const canon = resolveTeamCanonicalName(team)
      const isWin = teamMatchesCanonical(winner, team)
      lastByTeam.set(canon, { win: isWin, date, block })
      if (isWin && qualified && !out.has(canon)) {
        out.set(canon, { rank: rankCounter, qualified: true })
        rankCounter += 1
      }
    }
  }

  const finalRow = rows[rows.length - 1]
  if (finalRow) {
    const finalWinner =
      finalRow.winner_team?.trim() ||
      (typeof finalRow.team_a_score === 'number' &&
      typeof finalRow.team_b_score === 'number' &&
      finalRow.team_a_score !== finalRow.team_b_score
        ? finalRow.team_a_score > finalRow.team_b_score
          ? finalRow.team_a
          : finalRow.team_b
        : null)
    if (finalWinner) {
      const canon = resolveTeamCanonicalName(finalWinner)
      if (!out.has(canon)) out.set(canon, { rank: 1, qualified: true })
    }
  }

  for (const [team, last] of lastByTeam) {
    if (out.has(team)) continue
    out.set(team, {
      rank: last.win ? 50 : 100,
      qualified: last.win && QUALIFYING_BLOCK_RE.test(last.block),
    })
  }

  return out
}
