/**
 * Poll Cito live / near-live matches for draft-complete games.
 * Upserts cito_match_drafts + writes public/data/cito_live_drafts.json for Board/Predictions.
 *
 * V3-4: post-draft packets need locked picks/bans before nucky can score draft-aware %.
 *
 * Env: CITO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run sync:cito-live-drafts
 *   npx tsx scripts/cito/sync-live-drafts.ts --hours 8 --max 30
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, writeFileSync } from 'fs'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import { createServiceClient, requireEnv } from '../recap/db.ts'
import { isTier1LeagueRow } from './academyFilter.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

type ScheduleRow = {
  match_id: string
  league: string
  tournament_name: string | null
  block_name: string | null
  team_a: string
  team_b: string
  scheduled_at: string | null
  status: string
}

type DraftPick = { championName: string; role: string | null }

type PublicDraftRow = {
  matchId: string
  gameId: string | null
  gameNumber: number | null
  league: string
  teamA: string
  teamB: string
  blueTeam: string | null
  redTeam: string | null
  bluePicks: DraftPick[]
  redPicks: DraftPick[]
  blueBans: string[]
  redBans: string[]
  draftComplete: boolean
  status: string
  scheduledAt: string | null
  fetchedAt: string
}

function argNum(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag)
  if (idx < 0) return fallback
  const n = Number(process.argv[idx + 1])
  return Number.isFinite(n) ? n : fallback
}

function champName(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['championName', 'champion', 'name']) {
      if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim()
    }
  }
  return null
}

function parsePicks(raw: unknown): DraftPick[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((p) => {
      const name = champName(p)
      if (!name) return null
      const role =
        p && typeof p === 'object'
          ? ((p as Record<string, unknown>).role as string | null) ??
            ((p as Record<string, unknown>).position as string | null) ??
            null
          : null
      return { championName: name, role: typeof role === 'string' ? role : null }
    })
    .filter((p): p is DraftPick => Boolean(p))
}

function parseBans(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(champName).filter((n): n is string => Boolean(n))
}

function isDraftComplete(bluePicks: DraftPick[], redPicks: DraftPick[], hasDraftFlag: boolean): boolean {
  if (hasDraftFlag && bluePicks.length >= 5 && redPicks.length >= 5) return true
  // Some payloads omit dataAvailability.hasDraft but still ship full picks.
  return bluePicks.length >= 5 && redPicks.length >= 5
}

function unwrap(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (p.data && typeof p.data === 'object') return p.data as Record<string, unknown>
  return p
}

async function main() {
  const hours = argNum('--hours', 8)
  const max = argNum('--max', 30)

  const apiKey = requireEnv('CITO_API_KEY')
  requireEnv('SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const db = createServiceClient()
  const client = new CitoClient({ apiKey })

  const now = Date.now()
  const from = new Date(now - hours * 3600_000).toISOString()
  const to = new Date(now + hours * 3600_000).toISOString()

  const { data: schedule, error } = await db
    .from('cito_schedules')
    .select(
      'match_id, league, tournament_name, block_name, team_a, team_b, scheduled_at, status',
    )
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .order('scheduled_at', { ascending: true })
    .limit(200)

  if (error) throw new Error(error.message)

  const candidates = ((schedule ?? []) as ScheduleRow[])
    .filter((row) =>
      isTier1LeagueRow({
        teamA: row.team_a,
        teamB: row.team_b,
        league: row.league,
        tournamentName: row.tournament_name,
        blockName: row.block_name,
      }),
    )
    .filter((row) => {
      const s = (row.status ?? '').toLowerCase()
      return (
        s.includes('live') ||
        s.includes('progress') ||
        s.includes('unstarted') ||
        s === 'scheduled' ||
        s === 'in_progress' ||
        s === 'inprogress'
      )
    })
    .slice(0, max)

  console.log(`[live-drafts] probing ${candidates.length} matches (±${hours}h)`)

  const publicRows: PublicDraftRow[] = []
  let completeCount = 0

  for (const row of candidates) {
    const matchId = row.match_id.startsWith('lol-match-')
      ? row.match_id
      : `lol-match-${row.match_id}`
    try {
      const raw = await client.paced(() =>
        client.get<unknown>(`/lol/analytics/drafts/${encodeURIComponent(matchId)}`),
      )
      const data = unwrap(raw)
      if (!data) continue

      const availability = data.dataAvailability
      const hasDraftFlag = Boolean(
        availability &&
          typeof availability === 'object' &&
          (availability as Record<string, unknown>).hasDraft,
      )
      const bluePicks = parsePicks(data.bluePicks)
      const redPicks = parsePicks(data.redPicks)
      const blueBans = parseBans(data.blueBans)
      const redBans = parseBans(data.redBans)
      const draftComplete = isDraftComplete(bluePicks, redPicks, hasDraftFlag)
      if (!draftComplete && !hasDraftFlag && bluePicks.length === 0 && redPicks.length === 0) {
        continue
      }

      const fetchedAt = new Date().toISOString()
      const blueTeam =
        typeof data.blueTeam === 'string' ? data.blueTeam : row.team_a
      const redTeam = typeof data.redTeam === 'string' ? data.redTeam : row.team_b
      const gameId = typeof data.gameId === 'string' ? data.gameId : null
      const gameNumber =
        typeof data.gameNumber === 'number' ? data.gameNumber : null

      const { error: upsertErr } = await db.from('cito_match_drafts').upsert(
        {
          match_id: matchId,
          game_id: gameId,
          game_number: gameNumber,
          league: row.league,
          team_a: row.team_a,
          team_b: row.team_b,
          blue_team: blueTeam,
          red_team: redTeam,
          blue_picks: bluePicks,
          red_picks: redPicks,
          blue_bans: blueBans,
          red_bans: redBans,
          draft_complete: draftComplete,
          status: row.status,
          scheduled_at: row.scheduled_at,
          payload: data,
          fetched_at: fetchedAt,
          updated_at: fetchedAt,
        },
        { onConflict: 'match_id' },
      )
      if (upsertErr) {
        console.warn(`[live-drafts] upsert failed ${matchId}`, upsertErr.message)
        continue
      }

      if (draftComplete) {
        completeCount += 1
        publicRows.push({
          matchId,
          gameId,
          gameNumber,
          league: row.league,
          teamA: row.team_a,
          teamB: row.team_b,
          blueTeam,
          redTeam,
          bluePicks,
          redPicks,
          blueBans,
          redBans,
          draftComplete: true,
          status: row.status,
          scheduledAt: row.scheduled_at,
          fetchedAt,
        })
        console.log(
          `[live-drafts] DRAFT COMPLETE ${matchId} ${row.team_a} vs ${row.team_b} g${gameNumber ?? '?'}`,
        )
      } else {
        console.log(`[live-drafts] partial ${matchId} picks ${bluePicks.length}/${redPicks.length}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 404 = no draft yet — expected for scheduled games.
      if (!/404/.test(msg)) console.warn(`[live-drafts] ${matchId}`, msg)
    }
  }

  // Merge with recent complete drafts still relevant (last 12h).
  const recentSince = new Date(now - 12 * 3600_000).toISOString()
  const { data: recent } = await db
    .from('cito_match_drafts')
    .select(
      'match_id, game_id, game_number, league, team_a, team_b, blue_team, red_team, blue_picks, red_picks, blue_bans, red_bans, draft_complete, status, scheduled_at, fetched_at',
    )
    .eq('draft_complete', true)
    .gte('fetched_at', recentSince)
    .order('fetched_at', { ascending: false })
    .limit(40)

  const byId = new Map<string, PublicDraftRow>()
  for (const r of publicRows) byId.set(r.matchId, r)
  for (const r of recent ?? []) {
    const id = String(r.match_id)
    if (byId.has(id)) continue
    byId.set(id, {
      matchId: id,
      gameId: (r.game_id as string | null) ?? null,
      gameNumber: (r.game_number as number | null) ?? null,
      league: String(r.league ?? ''),
      teamA: String(r.team_a ?? ''),
      teamB: String(r.team_b ?? ''),
      blueTeam: (r.blue_team as string | null) ?? null,
      redTeam: (r.red_team as string | null) ?? null,
      bluePicks: (r.blue_picks as DraftPick[]) ?? [],
      redPicks: (r.red_picks as DraftPick[]) ?? [],
      blueBans: (r.blue_bans as string[]) ?? [],
      redBans: (r.red_bans as string[]) ?? [],
      draftComplete: true,
      status: String(r.status ?? ''),
      scheduledAt: (r.scheduled_at as string | null) ?? null,
      fetchedAt: String(r.fetched_at ?? new Date().toISOString()),
    })
  }

  const out = {
    generatedAt: new Date().toISOString(),
    drafts: [...byId.values()],
  }
  const outDir = path.join(ROOT, 'public', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'cito_live_drafts.json')
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
  console.log(
    `[live-drafts] wrote ${out.drafts.length} draft-complete rows (${completeCount} new this run) → ${outPath}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
