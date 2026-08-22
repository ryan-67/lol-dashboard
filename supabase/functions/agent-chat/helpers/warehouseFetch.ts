import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { WarehouseSeriesRow } from "./warehouseFacts.ts";

const SELECT =
  "league, tournament_name, block_name, team_a, team_b, scheduled_at, status, team_a_score, team_b_score, winner_team, best_of";

/** Full domestic season — newest-480 all-league rows drop early LCK and yield leftover 3-3. */
export function seasonWarehouseOpts(
  league: string | undefined,
  year: number,
): { league?: string; sinceIso: string; untilIso: string; limit: number } {
  return {
    league: league && league !== "All Tier 1" ? league : undefined,
    sinceIso: `${year}-01-01T00:00:00.000Z`,
    untilIso: `${year}-12-31T23:59:59.999Z`,
    limit: 800,
  };
}

export async function fetchWarehouseRows(
  service: SupabaseClient,
  opts: { league?: string; sinceIso?: string; untilIso?: string; limit?: number } = {},
): Promise<WarehouseSeriesRow[]> {
  const since = opts.sinceIso ??
    new Date(Date.now() - 220 * 24 * 60 * 60 * 1000).toISOString();
  const limit = opts.limit ?? 480;
  let query = service
    .from("cito_schedules")
    .select(SELECT)
    .gte("scheduled_at", since)
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (opts.league && opts.league !== "All Tier 1") {
    query = query.eq("league", opts.league);
  }
  if (opts.untilIso) {
    query = query.lte("scheduled_at", opts.untilIso);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data as WarehouseSeriesRow[];
}
