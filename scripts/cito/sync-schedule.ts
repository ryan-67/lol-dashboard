#!/usr/bin/env node
/**
 * Sync CitoAPI league schedules + completed results into Supabase cito_schedules.
 *
 * League `/schedule` often only returns upcoming slots (TBD). Completed series scores
 * and best-of come from `/leagues/{id}/results`, with `/matches/{id}/games` used to
 * repair bad match-level team labels (seen on MSI: both sides named LYON while games
 * correctly list G2 vs LYON).
 *
 * Env: CITO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run sync:cito-schedule
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, mkdirSync } from 'fs'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import type { CitoGameSummary, CitoScheduleEvent } from './types.ts'
import { createServiceClient, requireEnv } from '../recap/db.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

const SCHEDULE_LEAGUES = [
  { leagueId: 'lol-lck', name: 'LCK' },
  { leagueId: 'lol-lpl', name: 'LPL' },
  { leagueId: 'lol-lec', name: 'LEC' },
  { leagueId: 'lol-lcs', name: 'LCS' },
  { leagueId: 'lol-msi', name: 'MSI' },
  { leagueId: 'lol-worlds', name: 'Worlds' },
  { leagueId: 'lol-first-stand', name: 'First Stand' },
  // Often absent from Cito (EWC is not a Riot-broadcast league) — sync no-ops cleanly.
  { leagueId: 'lol-ewc', name: 'EWC' },
  { leagueId: 'lol-esports-world-cup', name: 'EWC' },
]

type ScheduleRow = {
  match_id: string
  league: string
  cito_league_id: string
  tournament_name: string
  team_a: string
  team_b: string
  scheduled_at: string | null
  status: string
  block_name: string | null
  team_a_score: number | null
  team_b_score: number | null
  winner_team: string | null
  best_of: number | null
  fetched_at: string
}

function normalizeMatchId(matchId: string): string {
  return matchId.startsWith('lol-match-') ? matchId : `lol-match-${matchId}`
}

function teamLabel(name?: string, short?: string, code?: string, slug?: string): string {
  const value = (name ?? short ?? code ?? slug ?? '').trim()
  return value || 'TBD'
}

function parseBestOf(strategy: unknown): number | null {
  if (typeof strategy === 'number' && Number.isFinite(strategy)) return strategy
  if (typeof strategy === 'string') {
    const m = strategy.match(/bo\s*(\d+)/i)
    if (m) return Number(m[1])
    return null
  }
  if (strategy && typeof strategy === 'object') {
    const count = (strategy as { count?: unknown }).count
    if (typeof count === 'number' && Number.isFinite(count)) return count
  }
  return null
}

function eventsFromPayload(payload: unknown): CitoScheduleEvent[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as {
    data?: { events?: CitoScheduleEvent[] } | CitoScheduleEvent[]
    events?: CitoScheduleEvent[]
  }
  if (Array.isArray(p.data)) return p.data
  if (Array.isArray(p.data?.events)) return p.data.events
  if (Array.isArray(p.events)) return p.events
  if (Array.isArray(payload)) return payload as CitoScheduleEvent[]
  return []
}

async function fetchSchedule(client: CitoClient, leagueId: string): Promise<CitoScheduleEvent[]> {
  const payload = await client.paced(() =>
    client.get(`/lol/leagues/${leagueId}/schedule`),
  )
  return eventsFromPayload(payload)
}

async function fetchResults(client: CitoClient, leagueId: string): Promise<CitoScheduleEvent[]> {
  const payload = await client.paced(() =>
    client.get(`/lol/leagues/${leagueId}/results`),
  )
  return eventsFromPayload(payload)
}

function eventToRow(
  event: CitoScheduleEvent,
  league: { leagueId: string; name: string },
  fetchedAt: string,
): ScheduleRow | null {
  const teams = event.teams ?? []
  if (!teams.length && !event.matchId) return null
  const teamA = teams[0]
    ? teamLabel(teams[0]?.name, teams[0]?.shortName, teams[0]?.code, teams[0]?.slug)
    : 'TBD'
  const teamB = teams[1]
    ? teamLabel(teams[1]?.name, teams[1]?.shortName, teams[1]?.code, teams[1]?.slug)
    : 'TBD'
  const state = (event.state ?? 'scheduled').toLowerCase()
  const scoreA = teams[0]?.score
  const scoreB = teams[1]?.score
  const outcomeA = (teams[0]?.outcome ?? '').toLowerCase()
  const outcomeB = (teams[1]?.outcome ?? '').toLowerCase()
  let winnerTeam: string | null = null
  if (outcomeA === 'win') winnerTeam = teamA
  else if (outcomeB === 'win') winnerTeam = teamB
  else if (typeof scoreA === 'number' && typeof scoreB === 'number' && scoreA !== scoreB) {
    winnerTeam = scoreA > scoreB ? teamA : teamB
  }
  return {
    match_id: normalizeMatchId(event.matchId),
    league: league.name,
    cito_league_id: league.leagueId,
    tournament_name: event.blockName ?? event.leagueName ?? league.name,
    team_a: teamA,
    team_b: teamB,
    scheduled_at: event.startTime ?? null,
    status: state,
    block_name: event.blockName ?? null,
    team_a_score: typeof scoreA === 'number' ? scoreA : null,
    team_b_score: typeof scoreB === 'number' ? scoreB : null,
    winner_team: winnerTeam,
    best_of: parseBestOf(event.strategy),
    fetched_at: fetchedAt,
  }
}

function needsGameEnrichment(row: ScheduleRow): boolean {
  const a = row.team_a.trim().toLowerCase()
  const b = row.team_b.trim().toLowerCase()
  if (a === 'tbd' || b === 'tbd' || !a || !b) return true
  if (a === b) return true
  if (row.status === 'completed') {
    if (row.team_a_score == null || row.team_b_score == null) return true
    if (row.team_a_score === 0 && row.team_b_score === 0) return true
  }
  return false
}

function inferWinnerSlug(game: CitoGameSummary): string | null {
  if (game.winnerSlug) return game.winnerSlug
  if (game.winningSide === 'blue') return game.blueTeam?.slug ?? null
  if (game.winningSide === 'red') return game.redTeam?.slug ?? null
  const blue = game.blueTeam
  const red = game.redTeam
  if (blue?.gold != null && red?.gold != null && blue.gold !== red.gold) {
    return blue.gold > red.gold ? blue.slug ?? null : red.slug ?? null
  }
  if (blue?.kills != null && red?.kills != null && blue.kills !== red.kills) {
    return blue.kills > red.kills ? blue.slug ?? null : red.slug ?? null
  }
  if (blue?.towers != null && red?.towers != null && blue.towers !== red.towers) {
    return blue.towers > red.towers ? blue.slug ?? null : red.slug ?? null
  }
  return null
}

async function enrichRowFromGames(
  client: CitoClient,
  row: ScheduleRow,
): Promise<ScheduleRow> {
  const matchId = row.match_id
  let games: CitoGameSummary[] = []
  try {
    games = await client.paced(() =>
      client.getData<CitoGameSummary[]>(`/lol/matches/${encodeURIComponent(matchId)}/games`),
    )
  } catch {
    return row
  }
  if (!games?.length) return row

  const bySlug = new Map<string, string>()
  for (const g of games) {
    for (const side of [g.blueTeam, g.redTeam]) {
      if (!side?.slug) continue
      bySlug.set(side.slug, teamLabel(side.name, side.shortName, undefined, side.slug))
    }
  }
  if (bySlug.size < 2) return row

  const scoreBySlug = new Map<string, number>()
  for (const slug of bySlug.keys()) scoreBySlug.set(slug, 0)
  for (const g of games) {
    const winner = inferWinnerSlug(g)
    if (winner && scoreBySlug.has(winner)) {
      scoreBySlug.set(winner, (scoreBySlug.get(winner) ?? 0) + 1)
    }
  }

  const slugs = [...bySlug.keys()]
  const slugA = slugs[0]!
  const slugB = slugs[1]!
  const scoreA = scoreBySlug.get(slugA) ?? 0
  const scoreB = scoreBySlug.get(slugB) ?? 0
  const teamA = bySlug.get(slugA)!
  const teamB = bySlug.get(slugB)!
  let winnerTeam: string | null = null
  if (scoreA !== scoreB) winnerTeam = scoreA > scoreB ? teamA : teamB

  // Prefer match-level best_of / completed status when present.
  let bestOf = row.best_of
  try {
    const detail = await client.paced(() =>
      client.get<{ strategy?: unknown; state?: string; gameCount?: number }>(
        `/lol/matches/${encodeURIComponent(matchId)}`,
      ),
    )
    bestOf = parseBestOf(detail.strategy) ?? bestOf
    if (typeof detail.gameCount === 'number' && detail.gameCount >= 1 && bestOf == null) {
      // gameCount is games played, not best-of — ignore for best_of.
    }
  } catch {
    // keep existing best_of
  }

  return {
    ...row,
    team_a: teamA,
    team_b: teamB,
    team_a_score: scoreA,
    team_b_score: scoreB,
    winner_team: winnerTeam,
    status: row.status === 'unstarted' || row.status === 'scheduled' ? 'completed' : row.status,
    best_of: bestOf,
  }
}

async function upsertRows(
  supabase: ReturnType<typeof createServiceClient>,
  rows: ScheduleRow[],
): Promise<number> {
  if (!rows.length) return 0
  const { error } = await supabase.from('cito_schedules').upsert(rows, { onConflict: 'match_id' })
  if (!error) return rows.length
  if (/best_of/i.test(error.message)) {
    const stripped = rows.map(({ best_of: _b, ...rest }) => rest)
    const retry = await supabase.from('cito_schedules').upsert(stripped, { onConflict: 'match_id' })
    if (retry.error) throw new Error(retry.error.message)
    return rows.length
  }
  throw new Error(error.message)
}

async function syncLeague(
  client: CitoClient,
  supabase: ReturnType<typeof createServiceClient>,
  league: { leagueId: string; name: string },
  fetchedAt: string,
): Promise<number> {
  const byId = new Map<string, ScheduleRow>()

  const scheduleEvents = await fetchSchedule(client, league.leagueId)
  for (const event of scheduleEvents) {
    const row = eventToRow(event, league, fetchedAt)
    if (row) byId.set(row.match_id, row)
  }

  let resultsEvents: CitoScheduleEvent[] = []
  try {
    resultsEvents = await fetchResults(client, league.leagueId)
  } catch (err) {
    console.warn(
      `  ${league.name}: results fetch failed (${err instanceof Error ? err.message : err})`,
    )
  }
  for (const event of resultsEvents) {
    const row = eventToRow(event, league, fetchedAt)
    if (!row) continue
    // Results overwrite schedule placeholders for the same match_id.
    byId.set(row.match_id, { ...(byId.get(row.match_id) ?? row), ...row })
  }

  let enriched = 0
  for (const [id, row] of byId) {
    if (!needsGameEnrichment(row)) continue
    if (row.status !== 'completed' && row.status !== 'inprogress' && row.status !== 'live') {
      // Only spend API calls on finished/live series with bad labels.
      if (!(row.team_a === 'TBD' || row.team_b === 'TBD')) continue
    }
    const fixed = await enrichRowFromGames(client, row)
    if (fixed.team_a !== row.team_a || fixed.team_b !== row.team_b || fixed.team_a_score !== row.team_a_score) {
      enriched += 1
    }
    byId.set(id, fixed)
  }

  const rows = [...byId.values()]
  if (!rows.length) {
    console.log(`  ${league.name}: no schedule/results events`)
    return 0
  }
  await upsertRows(supabase, rows)
  console.log(
    `  ${league.name}: upserted ${rows.length} events` +
      (enriched ? ` (enriched ${enriched} from match games)` : ''),
  )
  return rows.length
}

async function main() {
  requireEnv('CITO_API_KEY')
  requireEnv('SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const client = new CitoClient({ apiKey: requireEnv('CITO_API_KEY') })
  const supabase = createServiceClient()
  const fetchedAt = new Date().toISOString()
  let total = 0

  for (const league of SCHEDULE_LEAGUES) {
    try {
      total += await syncLeague(client, supabase, league, fetchedAt)
    } catch (err) {
      console.warn(`  ${league.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`Done — ${total} schedule rows synced.`)

  const cachePath = path.join(ROOT, 'public', 'data', 'cito_schedule_cache.json')
  mkdirSync(path.dirname(cachePath), { recursive: true })
  const { data: upcoming } = await supabase
    .from('cito_schedules')
    .select('match_id, league, tournament_name, team_a, team_b, scheduled_at, status, block_name')
    .in('status', ['scheduled', 'live', 'unstarted', 'tbd'])
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(500)
  writeFileSync(
    cachePath,
    JSON.stringify({ generated_at: new Date().toISOString(), rows: upcoming ?? [] }, null, 0),
  )
  console.log(`  Wrote schedule cache ${cachePath} (${(upcoming ?? []).length} rows)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
