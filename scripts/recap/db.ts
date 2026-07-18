import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import type { Player, Team } from '../../src/hooks/useDashboardData.ts'
import { mergeSlices, type OEStore, type OEStoreMeta } from '../../src/lib/mergeSlices.ts'
import { resolveTeamCanonicalName } from '../../src/lib/entities/slugs.ts'

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
  const dataDir = path.join(ROOT, 'public', 'data')
  const candidates = [
    path.join(dataDir, `oe_slices_${year}.json`),
    ...Array.from({ length: 9 }, (_, i) =>
      path.join(dataDir, `oe_slices_${year}_p${String(i + 1).padStart(2, '0')}.json`),
    ),
  ].filter((p) => existsSync(p))

  if (!candidates.length) {
    throw new Error(`Missing shard(s) for ${year} under ${dataDir}. Run ingest first.`)
  }

  const slices: OEStore['slices'] = {}
  for (const shardPath of candidates) {
    const payload = JSON.parse(readFileSync(shardPath, 'utf8')) as {
      slices: OEStore['slices']
    }
    Object.assign(slices, payload.slices ?? {})
  }

  const meta: OEStoreMeta = {
    source: "Oracle's Elixir",
    generated_at: new Date().toISOString(),
    leagues: ['LCK', 'LPL', 'LEC', 'LCS'],
    splits: [...new Set(Object.keys(slices).map((k) => k.split('|')[0]!))],
    schema_version: '2.1',
  }
  const store: OEStore = { meta, slices }
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

/** Cached score strings so we can regenerate when Cito corrects an OE mid-series score. */
export async function fetchExistingRecapScores(
  client: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const { data, error } = await client
    .from('weekly_recap_lines')
    .select('series_id, score')
    .in('series_id', ids)
  if (error) throw new Error(`Failed to check existing recap scores: ${error.message}`)
  return new Map(
    (data ?? [])
      .filter((r) => r.series_id && r.score)
      .map((r) => [r.series_id as string, String(r.score)]),
  )
}

/** Cached plain_text for detecting stale elimination language. */
export async function fetchExistingRecapPlainText(
  client: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const { data, error } = await client
    .from('weekly_recap_lines')
    .select('series_id, plain_text')
    .in('series_id', ids)
  if (error) throw new Error(`Failed to check existing recap text: ${error.message}`)
  return new Map(
    (data ?? [])
      .filter((r) => r.series_id && r.plain_text)
      .map((r) => [r.series_id as string, String(r.plain_text)]),
  )
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

/**
 * Remove stale recap rows for the same series date + matchup under a different series_id
 * (e.g. old "Team Liquid Alienware" ids after canonical rename).
 */
export async function deleteConflictingRecapRows(
  client: SupabaseClient,
  row: Pick<RecapRow, 'series_id' | 'series_date' | 'team_a' | 'team_b'>,
): Promise<number> {
  const { data, error } = await client
    .from('weekly_recap_lines')
    .select('series_id, team_a, team_b')
    .eq('series_date', row.series_date)

  if (error) {
    console.warn(`  warn: could not list recaps for ${row.series_date}: ${error.message}`)
    return 0
  }

  const target = [resolveTeamCanonicalName(row.team_a), resolveTeamCanonicalName(row.team_b)]
    .map((t) => t.toLowerCase())
    .sort()

  const orphanIds = (data ?? [])
    .filter((r) => {
      if (r.series_id === row.series_id) return false
      const other = [
        resolveTeamCanonicalName(String(r.team_a ?? '')),
        resolveTeamCanonicalName(String(r.team_b ?? '')),
      ]
        .map((t) => t.toLowerCase())
        .sort()
      return other[0] === target[0] && other[1] === target[1]
    })
    .map((r) => r.series_id as string)

  if (!orphanIds.length) return 0

  const { error: delErr } = await client.from('weekly_recap_lines').delete().in('series_id', orphanIds)
  if (delErr) {
    console.warn(`  warn: failed to delete orphan recaps: ${delErr.message}`)
    return 0
  }
  return orphanIds.length
}

/**
 * Delete cached recap rows that are mid-series leftovers (provisional 2-x), not finished Bo3s.
 * Prefer international / playoff context; also drop any 2-x whose matchup now has a Cito 3-x.
 */
export async function deleteProvisionalScoreRecaps(
  client: SupabaseClient,
  options?: {
    sinceDate?: string
    seriesIds?: string[]
    /** Completed Cito series with a 3-x score — used to purge stale 2-x blurbs for the same matchup. */
    citoResults?: Array<{
      teamA: string
      teamB: string
      scoreA: number | null
      scoreB: number | null
      status: string
    }>
  },
): Promise<number> {
  let query = client
    .from('weekly_recap_lines')
    .select('series_id, score, series_date, team_a, team_b, league, plain_text')

  if (options?.sinceDate) {
    query = query.gte('series_date', options.sinceDate)
  }
  if (options?.seriesIds?.length) {
    query = query.in('series_id', options.seriesIds)
  }

  const { data, error } = await query
  if (error) {
    console.warn(`  warn: could not list provisional recaps: ${error.message}`)
    return 0
  }

  const concludedBo5Keys = new Set(
    (options?.citoResults ?? [])
      .filter((r) => {
        const max = Math.max(r.scoreA ?? 0, r.scoreB ?? 0)
        return max >= 3 && /completed|finished|done/i.test(r.status)
      })
      .map((r) =>
        [resolveTeamCanonicalName(r.teamA), resolveTeamCanonicalName(r.teamB)]
          .map((t) => t.toLowerCase())
          .sort()
          .join('|'),
      ),
  )

  const provisionalIds = (data ?? [])
    .filter((row) => {
      const score = String(row.score ?? '')
      const m = score.match(/(\d+)\s*-\s*(\d+)/)
      if (!m) return false
      const max = Math.max(Number(m[1]), Number(m[2]))
      const min = Math.min(Number(m[1]), Number(m[2]))
      if (!(max === 2 && min <= 1)) return false

      const league = String(row.league ?? '')
      const text = String(row.plain_text ?? '')
      const hay = `${league} ${text}`.toLowerCase()
      const international = /\b(msi|worlds|wlds|first\s*stand|fst)\b/.test(hay)
      const key = [
        resolveTeamCanonicalName(String(row.team_a ?? '')),
        resolveTeamCanonicalName(String(row.team_b ?? '')),
      ]
        .map((t) => t.toLowerCase())
        .sort()
        .join('|')
      return international || concludedBo5Keys.has(key)
    })
    .map((row) => String(row.series_id))

  if (!provisionalIds.length) return 0

  const { error: delErr } = await client
    .from('weekly_recap_lines')
    .delete()
    .in('series_id', provisionalIds)
  if (delErr) {
    console.warn(`  warn: failed to delete provisional recaps: ${delErr.message}`)
    return 0
  }
  console.log(`  removed ${provisionalIds.length} provisional 2-x recap row(s): ${provisionalIds.join(', ')}`)
  return provisionalIds.length
}
