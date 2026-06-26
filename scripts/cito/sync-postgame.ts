#!/usr/bin/env node
/**
 * Sync CitoAPI postgame gold timelines for recent tier-1 completed matches.
 *
 * Env: CITO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run sync:cito-postgame
 *   npm run sync:cito-postgame -- --league lck --max-matches 10
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import {
  buildLinkageCandidates,
  citoLeagueToOe,
  citoTeamLabel,
  linkageWithOeId,
} from './linkage.ts'
import { normalizeCitoGoldGraph } from './goldNormalize.ts'
import { loadOeGamesFromShard } from './oeGames.ts'
import {
  attachOeGameId,
  fetchExistingCitoGameIds,
  upsertGameGold,
  upsertLinkage,
  upsertRawPayload,
} from './store.ts'
import type {
  CitoGameGoldRow,
  CitoGameSummary,
  CitoPostgamePayload,
  CitoScheduleEvent,
} from './types.ts'
import { createServiceClient, requireEnv } from '../recap/db.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

const TIER1 = [
  { leagueId: 'lol-lck', name: 'LCK' },
  { leagueId: 'lol-lpl', name: 'LPL' },
  { leagueId: 'lol-lec', name: 'LEC' },
  { leagueId: 'lol-lcs', name: 'LCS' },
]

function parseArgs(argv: string[]) {
  const leagueIdx = argv.indexOf('--league')
  const maxIdx = argv.indexOf('--max-matches')
  const yearIdx = argv.indexOf('--year')
  const daysIdx = argv.indexOf('--days')
  return {
    leagueFilter: leagueIdx >= 0 ? (argv[leagueIdx + 1] ?? '').toLowerCase() : null,
    maxMatches: maxIdx >= 0 ? Math.max(1, Number(argv[maxIdx + 1]) || 15) : 15,
    oeYear: yearIdx >= 0 ? (argv[yearIdx + 1] ?? '2026') : '2026',
    lookbackDays: daysIdx >= 0 ? Math.max(7, Number(argv[daysIdx + 1]) || 60) : 60,
  }
}

function normalizeMatchId(matchId: string): string {
  return matchId.startsWith('lol-match-') ? matchId : `lol-match-${matchId}`
}

function toMatchSummary(event: CitoScheduleEvent) {
  return {
    matchId: normalizeMatchId(event.matchId),
    startTime: event.startTime,
    teams: event.teams?.map((t) => ({
      name: t.name,
      shortName: t.shortName ?? t.code,
      slug: t.slug,
      score: t.score,
    })),
    tournament: {
      league: {
        leagueId: event.leagueId,
        name: event.leagueName,
      },
    },
  }
}

function withinLookback(startTime: string | undefined, days: number): boolean {
  if (!startTime) return false
  const start = new Date(startTime)
  if (Number.isNaN(start.getTime())) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return start >= cutoff
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const client = new CitoClient({ apiKey: requireEnv('CITO_API_KEY') })
  const store = createServiceClient()

  let oeGames: ReturnType<typeof loadOeGamesFromShard> = []
  try {
    oeGames = loadOeGamesFromShard(args.oeYear)
  } catch {
    console.warn(`OE shard for ${args.oeYear} unavailable — linkage will be Cito-only`)
  }

  const leagues = TIER1.filter(
    (l) => !args.leagueFilter || l.leagueId.includes(args.leagueFilter) || l.name.toLowerCase() === args.leagueFilter,
  )

  let fetched = 0
  let skipped = 0
  let linked = 0

  for (const league of leagues) {
    console.log(`\n=== ${league.name} ===`)
    const sched = await client.paced(() =>
      client.get<{ data?: { events?: CitoScheduleEvent[] } }>(`/lol/leagues/${league.leagueId}/schedule`),
    )
    const events = (sched.data?.events ?? client.unwrapData<CitoScheduleEvent[]>(sched))
      .filter((e) => e.state === 'completed' && withinLookback(e.startTime, args.lookbackDays))
      .slice(-args.maxMatches)

    console.log(`Completed matches in window: ${events.length}`)

    for (const event of events) {
      const match = toMatchSummary(event)
      const games = await client.paced(() =>
        client.getData<CitoGameSummary[]>(
          `/lol/matches/${encodeURIComponent(match.matchId)}/games`,
        ),
      )

      const gameIds = games.map((g) => g.gameId)
      const existing = await fetchExistingCitoGameIds(store, gameIds)

      for (const game of games) {
        if (existing.has(game.gameId)) {
          skipped++
          continue
        }

        let postgame: CitoPostgamePayload
        try {
          postgame = await client.paced(() =>
            client.get<CitoPostgamePayload>(
              `/lol/games/${encodeURIComponent(game.gameId)}/postgame`,
            ),
          )
        } catch (error) {
          console.warn(`  skip ${game.gameId}:`, error instanceof Error ? error.message : error)
          continue
        }

        const timeline = normalizeCitoGoldGraph(postgame)
        if (timeline.length < 4) {
          console.warn(`  skip ${game.gameId}: insufficient gold points (${timeline.length})`)
          continue
        }

        const lastMinute = timeline[timeline.length - 1]?.minute ?? null
        const leagueCode = citoLeagueToOe(event.leagueId ?? league.leagueId) ?? league.name
        const row: CitoGameGoldRow = {
          cito_game_id: game.gameId,
          oe_game_id: null,
          cito_match_id: match.matchId,
          league: leagueCode,
          game_date: (match.startTime ?? '').slice(0, 10),
          game_number: game.gameNumber ?? null,
          blue_team: citoTeamLabel(game.blueTeam),
          red_team: citoTeamLabel(game.redTeam),
          blue_slug: game.blueTeam?.slug ?? null,
          red_slug: game.redTeam?.slug ?? null,
          gold_timeline: timeline,
          duration_minutes: lastMinute,
          fetched_at: new Date().toISOString(),
        }

        await upsertGameGold(store, row)
        await upsertRawPayload(store, '/lol/games/{gameId}/postgame', game.gameId, postgame)
        fetched++
        console.log(`  ✓ ${game.gameId} (${timeline.length} pts, ~${lastMinute}m)`)
      }

      if (oeGames.length) {
        const links = linkageWithOeId(buildLinkageCandidates(match, games, oeGames))
        if (links.length) {
          await upsertLinkage(store, links)
          for (const link of links) {
            await attachOeGameId(store, link.citoGameId, link.oeGameId)
          }
          linked += links.length
        }
      }
    }
  }

  console.log(`\nDone. Fetched ${fetched}, skipped ${skipped} (cached), linked ${linked} OE games.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
