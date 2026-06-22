import type { WeeklyRecapLine } from './weeklyRecap'
import { formatRecapDate, normalizeRecapSegmentLabels } from './weeklyRecap'
import { recapTeamTag } from './recapTeamTag'
import { resolveTeamCanonicalName } from './entities/slugs'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import { TIER1_LEAGUES } from './mergeSlices'

const TABLE = 'weekly_recap_lines'

interface RecapRow {
  series_id: string
  series_date: string
  segments: WeeklyRecapLine['segments']
  league: string
  winner: string
  score: string
  team_a: string
  team_b: string
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rowToLine(row: RecapRow): WeeklyRecapLine {
  const winner = resolveTeamCanonicalName(row.winner)
  const teamA = resolveTeamCanonicalName(row.team_a)
  const teamB = resolveTeamCanonicalName(row.team_b)
  const loser = winner === teamA ? teamB : teamA
  const [domWins = '0', vicWins = '0'] = row.score.split('-')

  return {
    id: row.series_id,
    date: row.series_date,
    dateLabel: formatRecapDate(row.series_date),
    segments: normalizeRecapSegmentLabels(row.segments),
    score: {
      winner,
      loser,
      winnerAbbr: recapTeamTag(winner),
      loserAbbr: recapTeamTag(loser),
      score: `${domWins}-${vicWins}`,
    },
  }
}

/** Cached AI recap lines from Supabase; empty if unavailable. */
export async function fetchCachedWeeklyRecapLines(
  windowStart: Date,
  windowEnd: Date,
  selectedLeagues: string[],
  limit = 8,
): Promise<WeeklyRecapLine[]> {
  if (!isSupabaseConfigured) return []

  const leagues =
    !selectedLeagues.length ||
    selectedLeagues.includes('All Tier 1') ||
    (selectedLeagues.length === TIER1_LEAGUES.length &&
      TIER1_LEAGUES.every((l) => selectedLeagues.includes(l)))
      ? null
      : selectedLeagues.filter((l) => l !== 'All Tier 1')

  const start = isoDate(windowStart)
  const end = isoDate(windowEnd)

  let query = supabase
    .from(TABLE)
    .select('series_id, series_date, segments, league, winner, score, team_a, team_b')
    .gte('series_date', start)
    .lte('series_date', end)
    .order('series_date', { ascending: false })
    .limit(Math.max(limit, 24))

  if (leagues?.length) {
    query = query.in('league', leagues)
  }

  const { data, error } = await query

  if (error) {
    console.warn('[weekly-recap] fetch failed:', error.message)
    return []
  }

  return ((data ?? []) as RecapRow[]).map(rowToLine).slice(0, limit)
}
