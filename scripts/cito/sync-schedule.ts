#!/usr/bin/env node
/**
 * Sync CitoAPI league schedules into Supabase cito_schedules.
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
import type { CitoScheduleEvent } from './types.ts'
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
]

function normalizeMatchId(matchId: string): string {
  return matchId.startsWith('lol-match-') ? matchId : `lol-match-${matchId}`
}

function teamLabel(name?: string, short?: string, code?: string): string {
  const value = (name ?? short ?? code ?? '').trim()
  return value || 'TBD'
}

async function fetchSchedule(client: CitoClient, leagueId: string): Promise<CitoScheduleEvent[]> {
  const payload = await client.paced(() =>
    client.get<{ data?: { events?: CitoScheduleEvent[] } } | CitoScheduleEvent[]>(
      `/lol/leagues/${leagueId}/schedule`,
    ),
  )
  const events = (payload as { data?: { events?: CitoScheduleEvent[] } }).data?.events
  if (events?.length) return events
  return client.unwrapData<CitoScheduleEvent[]>(payload)
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
      const events = await fetchSchedule(client, league.leagueId)
      const rows = events
        .map((event) => {
          const teams = event.teams ?? []
          const teamA = teams[0] ? teamLabel(teams[0]?.name, teams[0]?.shortName, teams[0]?.code) : 'TBD'
          const teamB = teams[1] ? teamLabel(teams[1]?.name, teams[1]?.shortName, teams[1]?.code) : 'TBD'
          if (teams.length < 1) return null
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
            fetched_at: fetchedAt,
          }
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))

      if (!rows.length) {
        console.log(`  ${league.name}: no schedule events`)
        continue
      }

      const { error } = await supabase.from('cito_schedules').upsert(rows, { onConflict: 'match_id' })
      if (error) throw new Error(error.message)
      total += rows.length
      console.log(`  ${league.name}: upserted ${rows.length} events`)
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
