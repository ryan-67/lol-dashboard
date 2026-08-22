import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { WarehouseSeriesRow } from "./warehouseFacts.ts";

const SELECT =
  "league, tournament_name, block_name, team_a, team_b, scheduled_at, status, team_a_score, team_b_score, winner_team, best_of";

export async function fetchWarehouseRows(
  service: SupabaseClient,
  opts: { league?: string; sinceIso?: string; untilIso?: string; limit?: number } = {},
): Promise<WarehouseSeriesRow[]> {
  const since = opts.sinceIso ??
    new Date(Date.now() - 220 * 24 * 60 * 60 * 1000).toISOString();
  const limit = opts.limit ?? 240;
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
