import type { WeeklyRecapLine } from './weeklyRecap'
import { formatRecapDate } from './weeklyRecap'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import { leagueLabelToLeagues } from '../hooks/useDashboardData'

const TABLE = 'weekly_recap_lines'

interface RecapRow {
  series_id: string
  series_date: string
  segments: WeeklyRecapLine['segments']
  league: string
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rowToLine(row: RecapRow): WeeklyRecapLine {
  return {
    id: row.series_id,
    date: row.series_date,
    dateLabel: formatRecapDate(row.series_date),
    segments: row.segments,
  }
}

/** Cached AI recap lines from Supabase; empty if unavailable. */
export async function fetchCachedWeeklyRecapLines(
  windowStart: Date,
  windowEnd: Date,
  leagueLabel: string,
): Promise<WeeklyRecapLine[]> {
  if (!isSupabaseConfigured) return []

  const leagues = leagueLabelToLeagues(leagueLabel)
  const start = isoDate(windowStart)
  const end = isoDate(windowEnd)

  const { data, error } = await supabase
    .from(TABLE)
    .select('series_id, series_date, segments, league')
    .gte('series_date', start)
    .lte('series_date', end)
    .order('series_date', { ascending: false })
    .limit(24)

  if (error) {
    console.warn('[weekly-recap] fetch failed:', error.message)
    return []
  }

  const rows = (data ?? []) as RecapRow[]
  const filtered =
    leagueLabel === 'All Tier 1'
      ? rows
      : rows.filter((r) => leagues.includes(r.league as (typeof leagues)[number]))

  return filtered.map(rowToLine).slice(0, 8)
}
