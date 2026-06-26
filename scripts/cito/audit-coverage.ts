#!/usr/bin/env node
/**
 * Audit CitoAPI data coverage on 8 sample games (regular + playoff per tier-1 league, 2026).
 *
 * Usage: npx tsx scripts/cito/audit-coverage.ts
 * Output: docs/cito/coverage-audit-2026.json + console summary
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import type { CitoGameSummary, CitoScheduleEvent } from './types.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

const TIER1 = [
  { leagueId: 'lol-lck', name: 'LCK' },
  { leagueId: 'lol-lpl', name: 'LPL' },
  { leagueId: 'lol-lec', name: 'LEC' },
  { leagueId: 'lol-lcs', name: 'LCS' },
]

const GAME_ENDPOINTS = [
  'postgame',
  'gold',
  'plates',
  'distributions',
  'vision',
  'jungle-share',
  'objectives',
  'timeline',
  'player-stats',
  'stats',
  'builds',
] as const

type FillStatus = 'populated' | 'partial' | 'empty' | 'error'

interface FieldCheck {
  field: string
  status: FillStatus
  detail?: string
}

function is2026(iso?: string): boolean {
  if (!iso) return false
  const y = new Date(iso).getFullYear()
  return y === 2026
}

function isPlayoffBlock(blockName?: string): boolean {
  const b = (blockName ?? '').toLowerCase()
  return /playoff|bracket|finals|semifinal|quarter|knockout|cup|msi|worlds|first stand|road to/i.test(b)
}

function normalizeMatchId(matchId: string): string {
  return matchId.startsWith('lol-match-') ? matchId : `lol-match-${matchId}`
}

function hasContent(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if ('data' in o) return hasContent(o.data)
    if ('players' in o && Array.isArray(o.players)) return o.players.length > 0
    if ('goldGraph' in o && Array.isArray(o.goldGraph)) return o.goldGraph.length > 0
    const keys = Object.keys(o).filter((k) => !['gameId', 'source', 'lastUpdated', 'section', 'meta', 'success', 'status', 'message', 'docs', 'developer_help'].includes(k))
    return keys.some((k) => hasContent(o[k]))
  }
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  return true
}

function goldGraphQuality(points: unknown): { status: FillStatus; detail: string } {
  if (!Array.isArray(points) || !points.length) return { status: 'empty', detail: 'no points' }
  const nonZero = points.filter((p) => {
    const pt = p as { blueGold?: number; redGold?: number; goldDiff?: number }
    return (pt.blueGold ?? 0) !== 0 || (pt.redGold ?? 0) !== 0 || (pt.goldDiff ?? 0) !== 0
  })
  if (!nonZero.length) return { status: 'empty', detail: `${points.length} points, all zero` }
  return { status: 'populated', detail: `${nonZero.length}/${points.length} non-zero points` }
}

const PLAYER_STAT_FIELDS = [
  'kills',
  'deaths',
  'assists',
  'kda',
  'cs',
  'csPerMin',
  'gold',
  'goldPerMin',
  'damage',
  'damagePerMin',
  'damageShare',
  'goldShare',
  'visionScore',
  'wardsPlaced',
  'wardsDestroyed',
  'wardsKilled',
  'goldDiffAt15',
  'golddiffat15',
  'gd15',
  'csDiffAt15',
  'csdiffat15',
  'csd15',
  'xpDiffAt15',
  'xpdiffat15',
  'xpd15',
  'soloKills',
  'solo_kills',
  'turretPlates',
  'plates',
  'monsterKillsEnemyJungle',
  'campsStolen',
  'position',
  'champion',
  'role',
] as const

function analyzePlayers(players: unknown[]): FieldCheck[] {
  if (!players.length) return [{ field: 'players', status: 'empty', detail: '0 rows' }]
  const checks: FieldCheck[] = [{ field: 'players', status: 'populated', detail: `${players.length} rows` }]
  for (const field of PLAYER_STAT_FIELDS) {
    let count = 0
    for (const row of players) {
      const r = row as Record<string, unknown>
      const v = r[field] ?? (r.stats as Record<string, unknown> | undefined)?.[field]
      if (v != null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) count++
    }
    if (count === 0) checks.push({ field, status: 'empty' })
    else if (count < players.length) checks.push({ field, status: 'partial', detail: `${count}/${players.length}` })
    else checks.push({ field, status: 'populated', detail: `${count}/${players.length}` })
  }
  return checks
}

function analyzePostgame(pg: Record<string, unknown>): FieldCheck[] {
  const checks: FieldCheck[] = []
  const gg = goldGraphQuality(pg.goldGraph)
  checks.push({ field: 'postgame.goldGraph', status: gg.status, detail: gg.detail })
  for (const key of ['timeline', 'plates', 'goldDistribution', 'damageDistribution', 'vision', 'jungleShare', 'rawAdvancedStats']) {
    checks.push({
      field: `postgame.${key}`,
      status: hasContent(pg[key]) ? 'populated' : 'empty',
      detail: pg[key] == null ? 'null' : Array.isArray(pg[key]) ? `len=${(pg[key] as unknown[]).length}` : 'object',
    })
  }
  return checks
}

function pickSample<T>(arr: T[], index: number): T | null {
  if (!arr.length) return null
  return arr[Math.min(index, arr.length - 1)]!
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function pickRandom<T>(arr: T[], rand: () => number): T | null {
  if (!arr.length) return null
  return arr[Math.floor(rand() * arr.length)]!
}

const ROUND1_GAME_IDS = new Set([
  'lol-game-115548128963037540',
  'lol-game-115548128963037576',
  'lol-game-115615926677831080',
  'lol-game-115616219464607486',
  'lol-game-115548668059589377',
  'lol-game-115564793879469277',
  'lol-game-115564793879469289',
])

const CITO_RETEST_GAME_IDS = [
  'lol-game-115548128963037540',
  'lol-game-115615926677831080',
  'lol-game-115548128963037576',
]

function parseArgs(argv: string[]) {
  const round2 = argv.includes('--round2')
  const retest = argv.includes('--retest-cito')
  const seedIdx = argv.indexOf('--seed')
  const seed = seedIdx >= 0 ? Number(argv[seedIdx + 1]) || 20260626 : 20260626
  const outIdx = argv.indexOf('--out')
  const out = outIdx >= 0 ? argv[outIdx + 1] : round2 ? 'coverage-audit-2026-round2.json' : retest ? 'coverage-audit-2026-retest.json' : 'coverage-audit-2026.json'
  return { round2, retest, seed, out }
}

async function fetchSchedule(client: CitoClient, leagueId: string): Promise<CitoScheduleEvent[]> {
  const sched = await client.paced(() =>
    client.get<{ data?: { events?: CitoScheduleEvent[] } } | CitoScheduleEvent[]>(
      `/lol/leagues/${leagueId}/schedule`,
    ),
  )
  if (Array.isArray(sched)) return sched
  return sched.data?.events ?? client.unwrapData<CitoScheduleEvent[]>(sched)
}

async function fetchMatchGames(client: CitoClient, matchId: string): Promise<CitoGameSummary[]> {
  const id = normalizeMatchId(matchId)
  const payload = await client.paced(() =>
    client.get<CitoGameSummary[] | { data?: CitoGameSummary[] }>(
      `/lol/matches/${encodeURIComponent(id)}/games`,
    ),
  )
  return client.unwrapData<CitoGameSummary[]>(payload)
}

async function auditGame(
  client: CitoClient,
  sample: {
    league: string
    phase: 'regular' | 'playoff' | 'retest'
    matchId: string
    blockName?: string
    startTime?: string
    teams?: string
    gameId: string
    gameNumber?: number
  },
): Promise<{
  sample: typeof sample
  endpoints: Record<string, { status: FillStatus; checks: FieldCheck[]; error?: string }>
  matchLevel: Record<string, { status: FillStatus; checks: FieldCheck[]; error?: string }>
}> {
  const entry = {
    sample,
    endpoints: {} as Record<string, { status: FillStatus; checks: FieldCheck[]; error?: string }>,
    matchLevel: {} as Record<string, { status: FillStatus; checks: FieldCheck[]; error?: string }>,
  }

  for (const ep of GAME_ENDPOINTS) {
    const p = `/lol/games/${encodeURIComponent(sample.gameId)}/${ep}`
    try {
      const raw = await client.paced(() => client.get<unknown>(p))
      const data = client.unwrapData<unknown>(raw)
      const checks: FieldCheck[] = []

      if (ep === 'postgame' && data && typeof data === 'object') {
        checks.push(...analyzePostgame(data as Record<string, unknown>))
      } else if (ep === 'gold' && Array.isArray(data)) {
        const q = goldGraphQuality(data)
        checks.push({ field: 'gold', status: q.status, detail: q.detail })
      } else if (ep === 'player-stats' || ep === 'stats') {
        const payload = raw as Record<string, unknown>
        const players =
          (payload.players as unknown[]) ??
          (Array.isArray(data) ? data : (data as { players?: unknown[] })?.players) ??
          (Array.isArray((data as { data?: unknown[] })?.data) ? (data as { data: unknown[] }).data : [])
        if (Array.isArray(players) && players.length && typeof players[0] === 'object' && players[0] && 'players' in (players[0] as object)) {
          const nested = (players[0] as { players?: unknown[] }).players ?? []
          checks.push(...analyzePlayers(nested))
        } else {
          checks.push(...analyzePlayers(Array.isArray(players) ? players : []))
        }
      } else if (ep === 'objectives' || ep === 'timeline') {
        const arr = Array.isArray(data) ? data : []
        const status: FillStatus = arr.length ? 'populated' : 'empty'
        checks.push({ field: ep, status, detail: `events=${arr.length}` })
        if (arr.length && typeof arr[0] === 'object') {
          checks.push({ field: `${ep}[0].keys`, status: 'populated', detail: Object.keys(arr[0] as object).join(', ') })
        }
      } else if (ep === 'plates' || ep === 'vision' || ep === 'jungle-share' || ep === 'distributions') {
        const section = (raw as { data?: unknown })?.data ?? data
        checks.push({
          field: ep,
          status: hasContent(section) ? 'populated' : 'empty',
          detail: section == null ? 'null' : JSON.stringify(section).slice(0, 120),
        })
      } else if (ep === 'builds') {
        checks.push({
          field: 'builds',
          status: hasContent(data) ? 'populated' : 'empty',
          detail: Array.isArray(data) ? `len=${data.length}` : typeof data,
        })
      } else {
        checks.push({
          field: ep,
          status: hasContent(data) ? 'populated' : 'empty',
        })
      }

      const status: FillStatus = checks.some((c) => c.status === 'populated')
        ? checks.every((c) => c.status !== 'empty' && c.status !== 'error')
          ? 'populated'
          : 'partial'
        : 'empty'

      entry.endpoints[ep] = { status, checks }
    } catch (error) {
      entry.endpoints[ep] = {
        status: 'error',
        checks: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  for (const [name, pathSuffix] of [
    ['drafts', `/lol/analytics/drafts/${encodeURIComponent(sample.matchId)}`],
    ['match_player_stats', `/lol/matches/${encodeURIComponent(sample.matchId)}/player-stats`],
    ['match_timeline', `/lol/matches/${encodeURIComponent(sample.matchId)}/timeline`],
  ] as const) {
    try {
      const raw = await client.paced(() => client.get<unknown>(pathSuffix))
      const checks: FieldCheck[] = []
      if (name === 'drafts') {
        const d = raw as Record<string, unknown>
        checks.push({
          field: 'hasDraft',
          status: d.hasDraft === true || hasContent(d.bluePicks) || hasContent(d.redPicks) ? 'populated' : 'empty',
          detail: String(d.dataAvailability ?? d.message ?? ''),
        })
      } else if (name === 'match_player_stats') {
        const games = (raw as { data?: unknown[] }).data ?? []
        const allPlayers: unknown[] = []
        for (const g of games) {
          const gp = (g as { players?: unknown[] }).players ?? []
          allPlayers.push(...gp)
        }
        checks.push(...analyzePlayers(allPlayers))
      } else {
        const data = client.unwrapData<unknown>(raw)
        const arr = Array.isArray(data) ? data : []
        checks.push({ field: 'timeline', status: arr.length ? 'populated' : 'empty', detail: `events=${arr.length}` })
      }
      entry.matchLevel[name] = {
        status: checks.some((c) => c.status === 'populated') ? 'partial' : 'empty',
        checks,
      }
    } catch (error) {
      entry.matchLevel[name] = {
        status: 'error',
        checks: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return entry
}

async function resolveGameMeta(
  client: CitoClient,
  gameId: string,
): Promise<{ matchId: string; league: string; blockName?: string; startTime?: string; teams?: string; gameNumber?: number } | null> {
  try {
    const raw = await client.paced(() => client.get<unknown>(`/lol/games/${encodeURIComponent(gameId)}`))
    const g = client.unwrapData<Record<string, unknown>>(raw)
    const matchId = normalizeMatchId(String(g.matchId ?? g.match_id ?? ''))
    const league = String(g.league ?? g.leagueName ?? g.leagueId ?? 'unknown')
    const teams = Array.isArray(g.teams)
      ? (g.teams as Array<{ shortName?: string; name?: string }>).map((t) => t.shortName ?? t.name).join(' vs ')
      : undefined
    return {
      matchId,
      league,
      blockName: g.blockName as string | undefined,
      startTime: g.startTime as string | undefined,
      teams,
      gameNumber: g.gameNumber as number | undefined,
    }
  } catch {
    return null
  }
}

function writeReport(outFile: string, label: string, results: Awaited<ReturnType<typeof auditGame>>[]): string {
  const outPath = path.join(ROOT, 'docs/cito', outFile)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const report = {
    generatedAt: new Date().toISOString(),
    label,
    gameCount: results.length,
    samples: results.map((r) => r.sample),
    results,
    summary: summarize(results),
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  return outPath
}

async function main(): Promise<void> {
  const apiKey = process.env.CITO_API_KEY
  if (!apiKey) throw new Error('CITO_API_KEY missing from .env')

  const { round2, retest, seed, out } = parseArgs(process.argv.slice(2))
  const client = new CitoClient({ apiKey })
  const samples: Array<{
    league: string
    phase: 'regular' | 'playoff' | 'retest'
    matchId: string
    blockName?: string
    startTime?: string
    teams?: string
    gameId: string
    gameNumber?: number
  }> = []

  if (retest) {
    for (const gameId of CITO_RETEST_GAME_IDS) {
      const meta = await resolveGameMeta(client, gameId)
      samples.push({
        league: meta?.league ?? 'unknown',
        phase: 'retest',
        matchId: meta?.matchId ?? '',
        blockName: meta?.blockName,
        startTime: meta?.startTime,
        teams: meta?.teams,
        gameId,
        gameNumber: meta?.gameNumber,
      })
    }
  } else {
    const rand = seededRand(seed)
    const exclude = round2 ? ROUND1_GAME_IDS : new Set<string>()

    for (const league of TIER1) {
      console.log(`Fetching ${league.name} schedule…`)
      const events = (await fetchSchedule(client, league.leagueId))
        .filter((e) => e.state === 'completed' && is2026(e.startTime))
        .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))

      const regular = events.filter((e) => !isPlayoffBlock(e.blockName))
      const playoff = events.filter((e) => isPlayoffBlock(e.blockName))

      const picks: Array<{ phase: 'regular' | 'playoff'; event: CitoScheduleEvent }> = []
      if (round2) {
        const tryPick = (pool: CitoScheduleEvent[]) => {
          const shuffled = [...pool].sort(() => rand() - 0.5)
          for (const event of shuffled.slice(0, 8)) {
            return event
          }
          return pickRandom(pool, rand)
        }
        const reg = tryPick(regular)
        const po = tryPick(playoff)
        if (reg) picks.push({ phase: 'regular', event: reg })
        if (po) picks.push({ phase: 'playoff', event: po })
      } else {
        const reg = pickSample(regular, Math.floor(regular.length / 2))
        const po = pickSample(playoff, Math.floor(playoff.length / 2))
        if (reg) picks.push({ phase: 'regular', event: reg })
        if (po) picks.push({ phase: 'playoff', event: po })
      }

      for (const { phase, event } of picks) {
        const matchId = normalizeMatchId(event.matchId)
        let games = await fetchMatchGames(client, matchId)
        if (!games.length && round2) {
          const pool = phase === 'regular' ? regular : playoff
          for (const alt of [...pool].sort(() => rand() - 0.5)) {
            if (alt.matchId === event.matchId) continue
            const altGames = await fetchMatchGames(client, normalizeMatchId(alt.matchId))
            if (altGames.length) {
              games = altGames
              event.matchId = alt.matchId
              event.blockName = alt.blockName
              event.startTime = alt.startTime
              event.teams = alt.teams
              break
            }
          }
        }
        const candidates = games.filter((g) => !exclude.has(g.gameId))
        const game = round2 ? pickRandom(candidates.length ? candidates : games, rand) : games[0]
        if (!game) {
          console.warn(`  No games for ${matchId}`)
          continue
        }
        if (exclude.has(game.gameId)) {
          console.warn(`  Skipping excluded game ${game.gameId}`)
          continue
        }
        const finalMatchId = normalizeMatchId(event.matchId)
        samples.push({
          league: league.name,
          phase,
          matchId: finalMatchId,
          blockName: event.blockName,
          startTime: event.startTime,
          teams: event.teams?.map((t) => t.shortName ?? t.name).join(' vs '),
          gameId: game.gameId,
          gameNumber: game.gameNumber,
        })
      }
    }
  }

  console.log(`\nSelected ${samples.length} games for endpoint audit\n`)

  const results: Awaited<ReturnType<typeof auditGame>>[] = []
  for (const sample of samples) {
    console.log(`Auditing ${sample.league} ${sample.phase} — ${sample.gameId} (${sample.teams})`)
    results.push(await auditGame(client, sample))
  }

  const label = retest ? 'Cito retest (Ed sample IDs)' : round2 ? 'Round 2 random sample' : 'Round 1 mid-schedule sample'
  const outPath = writeReport(out, label, results)

  console.log('\n' + '='.repeat(72))
  console.log(`CITO COVERAGE SUMMARY — ${label}`)
  console.log('='.repeat(72))
  printSummary(summarize(results))
  console.log(`\nFull report: ${outPath}`)
}

function summarize(results: Array<{ endpoints: Record<string, { status: FillStatus; checks: FieldCheck[] }> }>) {
  const endpointCounts: Record<string, { populated: number; partial: number; empty: number; error: number }> = {}
  const fieldCounts: Record<string, { populated: number; partial: number; empty: number }> = {}

  for (const r of results) {
    for (const [ep, info] of Object.entries(r.endpoints)) {
      endpointCounts[ep] ??= { populated: 0, partial: 0, empty: 0, error: 0 }
      endpointCounts[ep][info.status] += 1
      for (const c of info.checks) {
        fieldCounts[c.field] ??= { populated: 0, partial: 0, empty: 0 }
        fieldCounts[c.field][c.status === 'error' ? 'empty' : c.status] += 1
      }
    }
  }

  const n = results.length
  return { n, endpointCounts, fieldCounts }
}

function printSummary(summary: ReturnType<typeof summarize>): void {
  const n = summary.n
  console.log(`\nGames audited: ${n}\n`)
  console.log('Endpoint fill rate (populated / partial / empty / error):')
  for (const [ep, c] of Object.entries(summary.endpointCounts).sort()) {
    console.log(
      `  ${ep.padEnd(16)} ${c.populated}/${n} populated  ${c.partial}/${n} partial  ${c.empty}/${n} empty  ${c.error}/${n} error`,
    )
  }

  const keyFields = [
    'postgame.goldGraph',
    'postgame.plates',
    'postgame.vision',
    'postgame.jungleShare',
    'postgame.timeline',
    'postgame.rawAdvancedStats',
    'players',
    'gd15',
    'csd15',
    'xpd15',
    'damageShare',
    'soloKills',
    'turretPlates',
    'campsStolen',
    'wardsPlaced',
    'wardsDestroyed',
    'wardsKilled',
  ]
  console.log('\nKey field fill rate across player-stats + postgame checks:')
  for (const f of keyFields) {
    const c = summary.fieldCounts[f]
    if (!c) continue
    console.log(`  ${f.padEnd(28)} ${c.populated}/${n} populated  ${c.partial}/${n} partial  ${c.empty}/${n} empty`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
