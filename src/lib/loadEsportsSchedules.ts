import { supabase, isSupabaseConfigured } from './supabaseClient'
import { resolveTeamCanonicalName } from './entities/slugs'

export interface EsportsScheduleRow {
  id: string
  league: string
  split: string
  team_a: string
  team_b: string
  scheduled_at: string | null
  status: 'scheduled' | 'completed' | 'live' | 'tbd'
  score: string | null
  source: string
  source_url: string
}

function teamMatchesScheduleName(teamQuery: string, scheduleName: string): boolean {
  const a = resolveTeamCanonicalName(teamQuery).toLowerCase()
  const b = resolveTeamCanonicalName(scheduleName).toLowerCase()
  return a === b || scheduleName.toLowerCase().includes(a) || a.includes(scheduleName.toLowerCase())
}

export async function fetchTeamUpcomingSchedule(
  teamName: string,
  options?: { league?: string; limit?: number },
): Promise<EsportsScheduleRow[]> {
  if (!isSupabaseConfigured) return []

  const limit = options?.limit ?? 12
  const now = new Date().toISOString()

  let query = supabase
    .from('esports_schedules')
    .select('id, league, split, team_a, team_b, scheduled_at, status, score, source, source_url')
    .in('status', ['scheduled', 'live', 'tbd'])
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(100)

  if (options?.league && options.league !== 'All Tier 1') {
    query = query.eq('league', options.league)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[schedules] fetch failed', error.message)
    return []
  }

  const rows = (data as EsportsScheduleRow[] | null) ?? []
  return rows
    .filter((row) => teamMatchesScheduleName(teamName, row.team_a) || teamMatchesScheduleName(teamName, row.team_b))
    .slice(0, limit)
}
