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
  return (name ?? short ?? code ?? '').trim()
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

  const client = new CitoClient(process.env.CITO_API_KEY!)
  const supabase = createServiceClient()
  const fetchedAt = new Date().toISOString()
  let total = 0

  for (const league of SCHEDULE_LEAGUES) {
    try {
      const events = await fetchSchedule(client, league.leagueId)
      const rows = events
        .map((event) => {
          const teams = event.teams ?? []
          if (teams.length < 2) return null
          const teamA = teamLabel(teams[0]?.name, teams[0]?.shortName, teams[0]?.code)
          const teamB = teamLabel(teams[1]?.name, teams[1]?.shortName, teams[1]?.code)
          if (!teamA || !teamB) return null
          const state = (event.state ?? 'scheduled').toLowerCase()
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
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
