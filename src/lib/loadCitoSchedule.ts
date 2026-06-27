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

function teamMatchesScheduleName(teamQuery: string, scheduleName: string): boolean {
  const a = resolveTeamCanonicalName(teamQuery).toLowerCase()
  const b = resolveTeamCanonicalName(scheduleName).toLowerCase()
  return a === b || scheduleName.toLowerCase().includes(a) || a.includes(scheduleName.toLowerCase())
}

/** Upcoming fixtures from CitoAPI sync (`cito_schedules` table). */
export async function fetchTeamUpcomingCitoSchedule(
  teamName: string,
  options?: { league?: string; limit?: number },
): Promise<CitoScheduleRow[]> {
  if (!isSupabaseConfigured) return []

  const limit = options?.limit ?? 3
  const now = new Date().toISOString()

  let query = supabase
    .from('cito_schedules')
    .select('match_id, league, tournament_name, team_a, team_b, scheduled_at, status, block_name')
    .in('status', ['scheduled', 'live', 'unstarted', 'tbd'])
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(80)

  if (options?.league && options.league !== 'All Tier 1') {
    query = query.eq('league', options.league)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[cito-schedule] fetch failed', error.message)
    return []
  }

  const rows = (data as CitoScheduleRow[] | null) ?? []
  return rows
    .filter(
      (row) =>
        teamMatchesScheduleName(teamName, row.team_a) ||
        teamMatchesScheduleName(teamName, row.team_b),
    )
    .slice(0, limit)
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

/** Completed Cito schedule rows for bracket / qualification tie-break hints. */
export async function fetchTournamentPlacementHints(
  tournamentDisplayName: string,
  league: string,
): Promise<Map<string, TournamentPlacementHint>> {
  const out = new Map<string, TournamentPlacementHint>()
  if (!isSupabaseConfigured) return out

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
    console.warn('[cito-schedule] tournament placement fetch failed', error.message)
    return out
  }

  const rows = ((data as CitoScheduleRow[] | null) ?? []).filter((row) =>
    tournamentNameMatches(row, tournamentDisplayName),
  )

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
