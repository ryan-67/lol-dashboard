import { isSupabaseConfigured, supabase } from './supabaseClient'
import type { CitoGameGoldRecord } from './citoGoldMatch'
import { teamMatchesCanonical } from './entities/slugs'
import { resolveTeamCanonicalName } from './entities/slugs'

const TABLE = 'cito_game_gold'

interface DbRow {
  cito_game_id: string
  oe_game_id: string | null
  game_date: string
  game_number: number | null
  blue_team: string | null
  red_team: string | null
  blue_slug: string | null
  red_slug: string | null
  gold_timeline: Array<{ minute: number; goldDiffBlue: number }>
}

function rowToRecord(row: DbRow): CitoGameGoldRecord {
  return {
    citoGameId: row.cito_game_id,
    oeGameId: row.oe_game_id,
    gameDate: row.game_date,
    gameNumber: row.game_number,
    blueTeam: row.blue_team,
    redTeam: row.red_team,
    blueSlug: row.blue_slug,
    redSlug: row.red_slug,
    goldTimelineBlue: row.gold_timeline ?? [],
  }
}

/** Load Cito gold timelines for a team's recent opponents/dates. */
export async function fetchCitoGoldForTeam(
  teamSlugOrName: string,
  dates: string[],
  oeGameIds: string[],
): Promise<CitoGameGoldRecord[]> {
  if (!isSupabaseConfigured) return []

  const canonical = resolveTeamCanonicalName(teamSlugOrName)
  const uniqueDates = [...new Set(dates.filter(Boolean))].sort()
  const uniqueOeIds = [...new Set(oeGameIds.filter(Boolean))]

  const out = new Map<string, CitoGameGoldRecord>()

  if (uniqueOeIds.length) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(
        'cito_game_id, oe_game_id, game_date, game_number, blue_team, red_team, blue_slug, red_slug, gold_timeline',
      )
      .in('oe_game_id', uniqueOeIds)

    if (error) {
      console.warn('[cito-gold] oe_game_id fetch failed:', error.message)
    } else {
      for (const row of (data ?? []) as DbRow[]) {
        out.set(row.cito_game_id, rowToRecord(row))
      }
    }
  }

  if (uniqueDates.length) {
    const minDate = uniqueDates[0]!
    const maxDate = uniqueDates[uniqueDates.length - 1]!
    const { data, error } = await supabase
      .from(TABLE)
      .select(
        'cito_game_id, oe_game_id, game_date, game_number, blue_team, red_team, blue_slug, red_slug, gold_timeline',
      )
      .gte('game_date', minDate)
      .lte('game_date', maxDate)

    if (error) {
      console.warn('[cito-gold] date range fetch failed:', error.message)
    } else {
      for (const row of (data ?? []) as DbRow[]) {
        if (out.has(row.cito_game_id)) continue
        const touchesTeam =
          teamMatchesCanonical(row.blue_team ?? '', canonical) ||
          teamMatchesCanonical(row.red_team ?? '', canonical) ||
          teamMatchesCanonical(row.blue_team ?? '', teamSlugOrName) ||
          teamMatchesCanonical(row.red_team ?? '', teamSlugOrName)
        if (touchesTeam) out.set(row.cito_game_id, rowToRecord(row))
      }
    }
  }

  return [...out.values()]
}
