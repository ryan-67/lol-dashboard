import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import type { Player, Team } from '../../src/hooks/useDashboardData.ts'
import { mergeSlices, type OEStore, type OEStoreMeta } from '../../src/lib/mergeSlices.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

config({ path: path.join(ROOT, '.env') })

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

export function createServiceClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: ws,
    },
  })
}

export function currentYear(): string {
  return process.env.RECAP_YEAR?.trim() || String(new Date().getFullYear())
}

export function loadTier1DataFromShards(year: string): { players: Player[]; teams: Team[] } {
  const shardPath = path.join(ROOT, 'public', 'data', `oe_slices_${year}.json`)
  if (!existsSync(shardPath)) {
    throw new Error(`Missing shard ${shardPath}. Run ingest first.`)
  }
  const payload = JSON.parse(readFileSync(shardPath, 'utf8')) as {
    slices: OEStore['slices']
  }
  const meta: OEStoreMeta = {
    source: "Oracle's Elixir",
    generated_at: new Date().toISOString(),
    leagues: ['LCK', 'LPL', 'LEC', 'LCS'],
    splits: [...new Set(Object.keys(payload.slices).map((k) => k.split('|')[0]!))],
    schema_version: '2.1',
  }
  const store: OEStore = { meta, slices: payload.slices }
  const merged = mergeSlices(store, 'All Tier 1', 'ALL', year)
  return { players: merged.players, teams: merged.teams }
}

export async function fetchExistingRecapMeta(
  client: SupabaseClient,
  ids: string[],
): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map()
  const { data, error } = await client
    .from('weekly_recap_lines')
    .select('series_id, model')
    .in('series_id', ids)
  if (error) throw new Error(`Failed to check existing recaps: ${error.message}`)
  return new Map((data ?? []).map((r) => [r.series_id as string, (r.model as string | null) ?? null]))
}

/** @deprecated use fetchExistingRecapMeta */
export async function fetchExistingSeriesIds(client: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const meta = await fetchExistingRecapMeta(client, ids)
  return new Set(meta.keys())
}

export async function loadTier1DataFromSupabase(
  client: SupabaseClient,
  year: string,
): Promise<{ players: Player[]; teams: Team[] }> {
  const tier1 = ['LCK', 'LPL', 'LEC', 'LCS']
  const { data: keys, error: keysErr } = await client
    .from('oe_slices')
    .select('split, league')
    .like('split', `${year}%`)
    .in('league', tier1)

  if (keysErr) throw new Error(`Failed to list oe_slices: ${keysErr.message}`)

  const slices: OEStore['slices'] = {}
  for (const row of keys ?? []) {
    const split = String(row.split ?? '')
    const league = String(row.league ?? '')
    if (!split || !league) continue

    const { data: sliceRow, error: sliceErr } = await client
      .from('oe_slices')
      .select('data')
      .eq('split', split)
      .eq('league', league)
      .maybeSingle()

    if (sliceErr) throw new Error(`Failed to load oe_slices ${split}|${league}: ${sliceErr.message}`)
    if (!sliceRow?.data) continue
    slices[`${split}|${league}`] = sliceRow.data as OEStore['slices'][string]
    console.log(`  loaded ${split}|${league}`)
  }

  if (!Object.keys(slices).length) {
    throw new Error(`No oe_slices rows for ${year} tier-1 leagues`)
  }

  const meta: OEStoreMeta = {
    source: "Oracle's Elixir",
    generated_at: new Date().toISOString(),
    leagues: tier1,
    splits: [...new Set(Object.keys(slices).map((k) => k.split('|')[0]!))],
    schema_version: '2.1',
  }
  const store: OEStore = { meta, slices }
  const merged = mergeSlices(store, 'All Tier 1', 'ALL', year)
  return { players: merged.players, teams: merged.teams }
}

export async function loadTier1Data(
  client: SupabaseClient | null,
  year: string,
): Promise<{ players: Player[]; teams: Team[] }> {
  if (process.env.RECAP_FROM_SUPABASE === '1') {
    if (!client) throw new Error('RECAP_FROM_SUPABASE requires Supabase client')
    console.log('Loading oe_slices from Supabase (one row at a time)...')
    return loadTier1DataFromSupabase(client, year)
  }
  try {
    return loadTier1DataFromShards(year)
  } catch (shardErr) {
    if (!client) throw shardErr
    console.log('Local shards unavailable — loading oe_slices from Supabase...')
    return loadTier1DataFromSupabase(client, year)
  }
}

export interface RecapRow {
  series_id: string
  league: string
  series_date: string
  team_a: string
  team_b: string
  winner: string
  score: string
  segments: unknown
  plain_text: string
  facts_json: unknown
  rag_context: string | null
  model: string
}

export async function upsertRecapRow(client: SupabaseClient, row: RecapRow): Promise<void> {
  const { error } = await client.from('weekly_recap_lines').upsert(row, { onConflict: 'series_id' })
  if (error) throw new Error(`Failed to upsert recap ${row.series_id}: ${error.message}`)
}
