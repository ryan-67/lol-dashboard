import type { SupabaseClient } from '@supabase/supabase-js'
import type { CitoGameGoldRow, LinkageCandidate, Phase0Report } from './types.ts'

const RAW_TABLE = 'cito_raw_payloads'
const LINKAGE_TABLE = 'cito_game_linkage'
const RUNS_TABLE = 'cito_validation_runs'
const GOLD_TABLE = 'cito_game_gold'

export async function upsertRawPayload(
  client: SupabaseClient,
  endpoint: string,
  resourceKey: string,
  payload: unknown,
): Promise<void> {
  const { error } = await client.from(RAW_TABLE).upsert(
    {
      endpoint,
      resource_key: resourceKey,
      payload,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint,resource_key' },
  )

  if (error) throw new Error(`cito_raw_payloads upsert failed: ${error.message}`)
}

export async function upsertLinkage(client: SupabaseClient, rows: LinkageCandidate[]): Promise<number> {
  const valid = rows.filter((r) => r.oeGameId)
  if (!valid.length) return 0

  const payload = valid.map((row) => ({
    oe_game_id: row.oeGameId,
    cito_game_id: row.citoGameId,
    cito_match_id: row.citoMatchId,
    league: row.league,
    game_date: row.gameDate,
    team_a: row.teamA,
    team_b: row.teamB,
    game_number: row.gameNumber,
    match_method: row.matchMethod,
    confidence: row.confidence,
    notes: row.notes ?? null,
    linked_at: new Date().toISOString(),
  }))

  const { error } = await client.from(LINKAGE_TABLE).upsert(payload, { onConflict: 'oe_game_id' })
  if (error) throw new Error(`cito_game_linkage upsert failed: ${error.message}`)
  return payload.length
}

export async function saveValidationRun(client: SupabaseClient, report: Phase0Report): Promise<void> {
  const { error } = await client.from(RUNS_TABLE).insert({
    phase: report.phase,
    finished_at: report.generatedAt,
    report,
    passed: report.summary.readyForPhase1,
  })
  if (error) throw new Error(`cito_validation_runs insert failed: ${error.message}`)
}

export async function fetchExistingCitoGameIds(client: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const { data, error } = await client.from(GOLD_TABLE).select('cito_game_id').in('cito_game_id', ids)
  if (error) throw new Error(`cito_game_gold fetch failed: ${error.message}`)
  return new Set((data ?? []).map((r) => r.cito_game_id as string))
}

export async function upsertGameGold(client: SupabaseClient, row: CitoGameGoldRow): Promise<void> {
  const { error } = await client.from(GOLD_TABLE).upsert(
    {
      cito_game_id: row.cito_game_id,
      oe_game_id: row.oe_game_id,
      cito_match_id: row.cito_match_id,
      league: row.league,
      game_date: row.game_date,
      game_number: row.game_number,
      blue_team: row.blue_team,
      red_team: row.red_team,
      blue_slug: row.blue_slug,
      red_slug: row.red_slug,
      gold_timeline: row.gold_timeline,
      duration_minutes: row.duration_minutes,
      fetched_at: row.fetched_at,
    },
    { onConflict: 'cito_game_id' },
  )
  if (error) throw new Error(`cito_game_gold upsert failed: ${error.message}`)
}

export async function attachOeGameId(
  client: SupabaseClient,
  citoGameId: string,
  oeGameId: string,
): Promise<void> {
  const { error } = await client
    .from(GOLD_TABLE)
    .update({ oe_game_id: oeGameId })
    .eq('cito_game_id', citoGameId)
  if (error) throw new Error(`cito_game_gold oe link failed: ${error.message}`)
}
