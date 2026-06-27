import { supabase, isSupabaseConfigured } from './supabaseClient'
import { resolveTeamCanonicalName } from './entities/slugs'

export interface CitoScheduleRow {
  match_id: string
  league: string
  tournament_name: string | null
  team_a: string
  team_b: string
  scheduled_at: string | null
  status: string
  block_name: string | null
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
