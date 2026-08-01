/**
 * Persist Cito completed-series fingerprint after a successful sync-current job.
 *
 * Usage: npx tsx scripts/cito/save-cito-sync-state.ts
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { createServiceClient, requireEnv } from '../recap/db.ts'
import { isTier1LeagueRow } from './academyFilter.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

type CompletedRow = {
  match_id: string
  scheduled_at: string | null
  status: string
  team_a: string
  team_b: string
  league: string
  tournament_name: string | null
  block_name: string | null
  team_a_score: number | null
  team_b_score: number | null
}

const COMPLETED = new Set(['completed', 'finished', 'done', 'complete'])

function isCompleted(row: CompletedRow): boolean {
  const status = (row.status ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  if (COMPLETED.has(status)) return true
  if (typeof row.team_a_score === 'number' && typeof row.team_b_score === 'number') {
    return Math.max(row.team_a_score, row.team_b_score) >= 2
  }
  return false
}

function isTier1(row: CompletedRow): boolean {
  return isTier1LeagueRow({
    teamA: row.team_a,
    teamB: row.team_b,
    league: row.league,
    tournamentName: row.tournament_name,
    blockName: row.block_name,
  })
}

function fingerprint(rows: CompletedRow[]): string {
  const keys = rows
    .filter(isCompleted)
    .filter(isTier1)
    .map((r) => `${r.match_id}|${r.scheduled_at ?? ''}|${r.team_a_score ?? ''}-${r.team_b_score ?? ''}`)
    .sort()
  const joined = keys.join(';')
  let h = 0
  for (let i = 0; i < joined.length; i++) h = (Math.imul(31, h) + joined.charCodeAt(i)) | 0
  return `${keys.length}:${(h >>> 0).toString(16)}:${keys[0] ?? ''}:${keys[keys.length - 1] ?? ''}`
}

async function main() {
  requireEnv('SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const db = createServiceClient()

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 21)

  const { data, error } = await db
    .from('cito_schedules')
    .select(
      'match_id, scheduled_at, status, team_a, team_b, league, tournament_name, block_name, team_a_score, team_b_score',
    )
    .gte('scheduled_at', since.toISOString())
    .order('scheduled_at', { ascending: false })
    .limit(400)

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as CompletedRow[]
  const completed = rows.filter(isCompleted).filter(isTier1)
  const fp = fingerprint(completed)
  const latest = completed[0] ?? null
  const now = new Date().toISOString()

  const { error: upsertErr } = await db.from('cito_sync_state').upsert(
    {
      id: 'default',
      last_completed_at: latest?.scheduled_at ?? null,
      last_completed_match_id: latest?.match_id ?? null,
      completed_fingerprint: fp,
      last_checked_at: now,
      last_synced_at: now,
      updated_at: now,
    },
    { onConflict: 'id' },
  )
  if (upsertErr) throw new Error(upsertErr.message)
  console.log('[save-cito-sync] fingerprint', fp, 'completed', completed.length)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
