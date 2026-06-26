#!/usr/bin/env node
/**
 * CitoAPI Phase 0 validation:
 * - verify tier-1 endpoint payloads
 * - prototype OE ↔ Cito game linkage
 * - run basic parity checks
 * - persist bronze payloads + linkage to Supabase (when configured)
 *
 * Env: CITO_API_KEY (required)
 * Optional: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run validate:cito
 *   npm run validate:cito -- --league lck --samples 2 --no-store
 */
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import { buildLinkageCandidates, citoLeagueToOe, linkageWithOeId } from './linkage.ts'
import { loadOeGamesFromShard, uniqueOeGamesById } from './oeGames.ts'
import { buildParityRows, parityPassRate } from './parity.ts'
import { saveValidationRun, upsertLinkage, upsertRawPayload } from './store.ts'
import type {
  CitoGameSummary,
  CitoMatchSummary,
  CitoPostgamePayload,
  CitoScheduleEvent,
  EndpointProbeResult,
  LinkageCandidate,
  Phase0Report,
} from './types.ts'
import { createServiceClient, requireEnv } from '../recap/db.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

const TIER1_LEAGUES = [
  { leagueId: 'lol-lck', name: 'LCK' },
  { leagueId: 'lol-lpl', name: 'LPL' },
  { leagueId: 'lol-lec', name: 'LEC' },
  { leagueId: 'lol-lcs', name: 'LCS' },
]

const GAME_ENDPOINTS = ['postgame', 'gold', 'plates', 'objectives', 'vision', 'jungle-share'] as const

function parseArgs(argv: string[]) {
  const args = new Set(argv)
  const getNum = (flag: string, fallback: number) => {
    const idx = argv.indexOf(flag)
    if (idx === -1) return fallback
    const raw = argv[idx + 1]
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }

  const leagueIdx = argv.indexOf('--league')
  const leagueFilter = leagueIdx >= 0 ? (argv[leagueIdx + 1] ?? '').toLowerCase() : null

  return {
    samplesPerLeague: getNum('--samples', 1),
    leagueFilter,
    noStore: args.has('--no-store'),
    oeYear: argv.includes('--year') ? (argv[argv.indexOf('--year') + 1] ?? '2026') : '2026',
  }
}

function normalizeMatchId(matchId: string): string {
  return matchId.startsWith('lol-match-') ? matchId : `lol-match-${matchId}`
}

async function fetchCompletedLeagueMatches(
  client: CitoClient,
  leagueId: string,
  limit: number,
): Promise<CitoScheduleEvent[]> {
  const payload = await client.paced(() => client.get<{ data?: { events?: CitoScheduleEvent[] } }>(
    `/lol/leagues/${leagueId}/schedule`,
  ))
  const events = payload.data?.events ?? client.unwrapData<CitoScheduleEvent[]>(payload)
  const completed = (Array.isArray(events) ? events : []).filter((e) => e.state === 'completed')
  return completed.slice(-limit)
}

async function fetchMatchGames(client: CitoClient, matchId: string): Promise<CitoGameSummary[]> {
  const id = normalizeMatchId(matchId)
  const payload = await client.paced(() => client.get<CitoGameSummary[] | { data?: CitoGameSummary[] }>(
    `/lol/matches/${encodeURIComponent(id)}/games`,
  ))
  return client.unwrapData<CitoGameSummary[]>(payload)
}

async function probeGameEndpoints(
  client: CitoClient,
  gameId: string,
): Promise<{ probes: EndpointProbeResult[]; postgame?: CitoPostgamePayload }> {
  const probes: EndpointProbeResult[] = []
  let postgame: CitoPostgamePayload | undefined

  for (const endpoint of GAME_ENDPOINTS) {
    const path = `/lol/games/${encodeURIComponent(gameId)}/${endpoint}`
    try {
      const payload = await client.paced(() => client.get<unknown>(path))
      const data = client.unwrapData<unknown>(payload)
      const keys =
        data && typeof data === 'object' && !Array.isArray(data)
          ? Object.keys(data as Record<string, unknown>)
          : Array.isArray(data)
            ? ['array']
            : []

      let pointCount: number | undefined
      if (endpoint === 'postgame' && data && typeof data === 'object') {
        postgame = data as CitoPostgamePayload
        pointCount = postgame.goldGraph?.length
      }
      if (endpoint === 'gold' && Array.isArray(data)) pointCount = data.length

      const emptyArray = Array.isArray(data) && data.length === 0
      const emptyObject =
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        'data' in (data as Record<string, unknown>) &&
        (data as { data?: unknown }).data == null

      probes.push({
        endpoint: path,
        status: emptyArray || emptyObject ? 'empty' : 'ok',
        httpStatus: 200,
        payloadKeys: keys,
        pointCount,
      })
    } catch (error) {
      probes.push({
        endpoint: path,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { probes, postgame }
}

function toMatchSummary(event: CitoScheduleEvent): CitoMatchSummary {
  return {
    matchId: normalizeMatchId(event.matchId),
    state: event.state,
    startTime: event.startTime,
    teams: event.teams?.map((t) => ({
      name: t.name,
      shortName: t.shortName ?? t.code,
      slug: t.slug,
      score: t.score,
      outcome: t.outcome,
    })),
    tournament: {
      league: {
        leagueId: event.leagueId,
        slug: citoLeagueToOe(event.leagueId ?? '')?.toLowerCase(),
        name: event.leagueName,
      },
    },
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const apiKey = requireEnv('CITO_API_KEY')
  const client = new CitoClient({ apiKey, timeoutMs: 120_000 })

  let supabaseConfigured = false
  let storeClient: ReturnType<typeof createServiceClient> | null = null
  if (!args.noStore && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    storeClient = createServiceClient()
    supabaseConfigured = true
  }

  console.log('CitoAPI Phase 0 validation')
  console.log(`Samples/league: ${args.samplesPerLeague} | OE year: ${args.oeYear}`)

  const ping = await client.get<{ success?: boolean; status?: string }>('/lol/schedule/today')
  console.log(`API ping: ${ping.success === false ? ping.status ?? 'unknown' : 'ok'}`)

  const oeGames = loadOeGamesFromShard(args.oeYear)
  const oeById = uniqueOeGamesById(oeGames)
  console.log(`Loaded ${oeById.size} unique OE games from ${args.oeYear} shard`)

  const allLinkage: LinkageCandidate[] = []
  const citoGamesById = new Map<string, CitoGameSummary>()
  const postgameById = new Map<string, CitoPostgamePayload>()
  const leagueReports: Phase0Report['leagues'] = []

  const leagues = TIER1_LEAGUES.filter(
    (l) => !args.leagueFilter || l.leagueId.includes(args.leagueFilter) || l.name.toLowerCase() === args.leagueFilter,
  )

  for (const league of leagues) {
    console.log(`\n=== ${league.name} (${league.leagueId}) ===`)
    const endpointProbes: EndpointProbeResult[] = []
    let linkageAttempts = 0
    let linkageMatched = 0

    const events = await fetchCompletedLeagueMatches(client, league.leagueId, Math.max(args.samplesPerLeague, 1))
    console.log(`Completed matches sampled: ${events.length}`)

    for (const event of events.slice(-args.samplesPerLeague)) {
      const match = toMatchSummary(event)
      const games = await fetchMatchGames(client, match.matchId)
      console.log(`  ${match.matchId} → ${games.length} games (${match.teams?.map((t) => t.shortName ?? t.name).join(' vs ')})`)

      if (storeClient) {
        try {
          await upsertRawPayload(storeClient, '/lol/matches/{matchId}/games', match.matchId, games)
        } catch {
          /* handled at end */
        }
      }

      for (const game of games) citoGamesById.set(game.gameId, game)

      const links = buildLinkageCandidates(match, games, oeGames)
      linkageAttempts += links.length
      linkageMatched += linkageWithOeId(links).length
      allLinkage.push(...links)

      const firstGame = games[0]
      if (firstGame) {
        const { probes, postgame } = await probeGameEndpoints(client, firstGame.gameId)
        endpointProbes.push(...probes)
        if (postgame) postgameById.set(firstGame.gameId, postgame)

        if (storeClient && postgame) {
          try {
            await upsertRawPayload(storeClient, '/lol/games/{gameId}/postgame', firstGame.gameId, postgame)
          } catch {
            /* handled at end */
          }
        }
      }
    }

    leagueReports.push({
      leagueId: league.leagueId,
      name: league.name,
      completedMatchesSampled: events.slice(-args.samplesPerLeague).length,
      endpointProbes,
      linkageAttempts,
      linkageMatched,
    })
  }

  const linked = linkageWithOeId(allLinkage)
  const parity = buildParityRows(linked, oeGames, oeById, citoGamesById, postgameById)

  const endpointChecks = leagueReports.flatMap((l) => l.endpointProbes)
  const endpointSuccessRate =
    endpointChecks.length > 0
      ? endpointChecks.filter((p) => p.status === 'ok').length / endpointChecks.length
      : 0

  const linkageRate =
    allLinkage.length > 0 ? linked.length / allLinkage.length : 0

  const parityRate = parityPassRate(parity)

  const blockers: string[] = []
  if (endpointSuccessRate < 0.5) blockers.push('Low endpoint success rate (<50%)')
  if (linkageRate < 0.3) blockers.push('Low OE linkage rate (<30%) — likely OE CSV lag for recent matches')
  if (parityRate < 0.4 && parity.length > 0) blockers.push('Parity checks weak — verify metric mapping before Phase 1 UI')

  const report: Phase0Report = {
    generatedAt: new Date().toISOString(),
    phase: '0',
    apiKeyConfigured: true,
    supabaseConfigured,
    leagues: leagueReports,
    linkage: allLinkage,
    parity,
    summary: {
      endpointSuccessRate,
      linkageRate,
      parityPassRate: parityRate,
      readyForPhase1: blockers.length <= 1,
      blockers,
    },
  }

  const outDir = path.join(ROOT, 'docs', 'cito')
  mkdirSync(outDir, { recursive: true })
  const reportPath = path.join(outDir, 'phase0-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  if (storeClient) {
    try {
      const linkedCount = await upsertLinkage(storeClient, linked)
      await saveValidationRun(storeClient, report)
      console.log(`\nStored ${linkedCount} linkage rows + validation run in Supabase`)
    } catch (error) {
      console.warn(
        '\nSupabase store skipped:',
        error instanceof Error ? error.message : error,
        '\nApply supabase/migrations/cito_phase0.sql then re-run without --no-store.',
      )
    }
  }

  console.log('\n=== Phase 0 Summary ===')
  console.log(`Endpoint success rate: ${(endpointSuccessRate * 100).toFixed(1)}%`)
  console.log(`OE linkage rate: ${(linkageRate * 100).toFixed(1)}% (${linked.length}/${allLinkage.length})`)
  console.log(`Parity pass rate: ${(parityRate * 100).toFixed(1)}%`)
  console.log(`Ready for Phase 1: ${report.summary.readyForPhase1 ? 'YES' : 'NOT YET'}`)
  if (blockers.length) console.log(`Blockers: ${blockers.join('; ')}`)
  console.log(`Report: ${reportPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
