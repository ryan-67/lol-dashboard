import { supabase, isSupabaseConfigured } from './supabaseClient'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
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
}

const INTERNATIONAL_SCHEDULE_LEAGUES = new Set(['MSI', 'WLDs', 'FST', 'Worlds', 'First Stand'])

function teamMatchesScheduleName(teamQuery: string, scheduleName: string): boolean {
  const a = resolveTeamCanonicalName(teamQuery).toLowerCase()
  const b = resolveTeamCanonicalName(scheduleName).toLowerCase()
  return a === b || scheduleName.toLowerCase().includes(a) || a.includes(scheduleName.toLowerCase())
}

function isTbdTeamName(name: string | null | undefined): boolean {
  const v = (name ?? '').trim().toLowerCase()
  return !v || v === 'tbd' || v === 'tba' || v === '-'
}

function isInternationalScheduleRow(row: CitoScheduleRow): boolean {
  const hay = `${row.league} ${row.tournament_name ?? ''} ${row.block_name ?? ''}`.toLowerCase()
  return (
    INTERNATIONAL_SCHEDULE_LEAGUES.has(row.league) ||
    /\bmsi\b|\bworlds\b|first\s*stand/.test(hay)
  )
}

function tournamentContextKey(row: CitoScheduleRow): string {
  return `${row.league}|${row.tournament_name ?? ''}|${row.block_name ?? ''}`.toLowerCase()
}

function scheduleRowPriority(row: CitoScheduleRow): number {
  const confirmed = !isTbdTeamName(row.team_a) && !isTbdTeamName(row.team_b)
  if (confirmed && isInternationalScheduleRow(row)) return 0
  if (confirmed) return 1
  if (isInternationalScheduleRow(row)) return 2
  return 3
}

function pendingBracketRows(
  _teamName: string,
  allRows: CitoScheduleRow[],
  teamRows: CitoScheduleRow[],
): CitoScheduleRow[] {
  const intlConfirmed = teamRows.filter(
    (r) =>
      isInternationalScheduleRow(r) &&
      !isTbdTeamName(r.team_a) &&
      !isTbdTeamName(r.team_b),
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

/** Upcoming fixtures from CitoAPI sync (`cito_schedules` table). */
export async function fetchTeamUpcomingCitoSchedule(
  teamName: string,
  options?: { league?: string; limit?: number },
): Promise<CitoScheduleRow[]> {
  if (!isSupabaseConfigured) return []

  const limit = options?.limit ?? 6
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('cito_schedules')
    .select('match_id, league, tournament_name, team_a, team_b, scheduled_at, status, block_name')
    .in('status', ['scheduled', 'live', 'unstarted', 'tbd'])
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(200)

  if (error) {
    console.warn('[cito-schedule] fetch failed', error.message)
    return []
  }

  const rows = (data as CitoScheduleRow[] | null) ?? []
  const teamRows = rows.filter(
    (row) =>
      teamMatchesScheduleName(teamName, row.team_a) ||
      teamMatchesScheduleName(teamName, row.team_b),
  )
  const pending = pendingBracketRows(teamName, rows, teamRows)

  const seen = new Set<string>()
  const merged = [...teamRows, ...pending]
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

  return merged.slice(0, limit)
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
