/**
 * Check whether tier-1 Cito completed series advanced since last watermark.
 * Primary cron trigger for Refresh Dashboard Data (v3 — Cito SoR for recent scores).
 *
 * Usage:
 *   npx tsx scripts/cito/check-cito-updates.ts
 *   npx tsx scripts/cito/check-cito-updates.ts --format github
 *   npx tsx scripts/cito/check-cito-updates.ts --force
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (preferred)
 *      CITO_API_KEY optional fallback when schedules table empty
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
  // Stable short hash — length + head/tail of sorted keys.
  const joined = keys.join(';')
  let h = 0
  for (let i = 0; i < joined.length; i++) h = (Math.imul(31, h) + joined.charCodeAt(i)) | 0
  return `${keys.length}:${(h >>> 0).toString(16)}:${keys[0] ?? ''}:${keys[keys.length - 1] ?? ''}`
}

async function main() {
  const format = process.argv.includes('--format')
    ? process.argv[process.argv.indexOf('--format') + 1] ?? 'text'
    : 'text'
  const force = process.argv.includes('--force')

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

  if (error) {
    console.error('[check-cito] fetch failed', error.message)
    // Fail open — run sync so freshness does not stall.
    if (format === 'github') {
      console.log('true')
    } else {
      console.log('changed=true (fetch error)')
    }
    process.exit(0)
  }

  const rows = (data ?? []) as CompletedRow[]
  const completed = rows.filter(isCompleted).filter(isTier1)
  const fp = fingerprint(completed)
  const latest = completed[0] ?? null

  let storedFp: string | null = null
  const { data: stateRows, error: stateErr } = await db
    .from('cito_sync_state')
    .select('completed_fingerprint, last_checked_at')
    .eq('id', 'default')
    .maybeSingle()

  if (stateErr) {
    console.warn(
      '[check-cito] cito_sync_state unavailable — treating as changed.',
      stateErr.message,
    )
    console.warn('Apply supabase/migrations/20260801120000_cito_sync_and_drafts.sql')
  } else {
    storedFp = (stateRows?.completed_fingerprint as string | null) ?? null
  }

  await db.from('cito_sync_state').upsert(
    {
      id: 'default',
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  const changed = force || !storedFp || storedFp !== fp

  if (format === 'github') {
    console.log(changed ? 'true' : 'false')
  } else {
    console.log(
      JSON.stringify(
        {
          changed,
          fingerprint: fp,
          stored: storedFp,
          completedCount: completed.length,
          latest: latest
            ? {
                matchId: latest.match_id,
                at: latest.scheduled_at,
                score: `${latest.team_a_score}-${latest.team_b_score}`,
                a: latest.team_a,
                b: latest.team_b,
              }
            : null,
        },
        null,
        2,
      ),
    )
  }
}

main().catch((err) => {
  console.error(err)
  // Fail open for cron.
  if (process.argv.includes('--format') && process.argv.includes('github')) {
    console.log('true')
    process.exit(0)
  }
  process.exit(1)
})
