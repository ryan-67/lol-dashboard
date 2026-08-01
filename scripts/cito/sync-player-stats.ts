#!/usr/bin/env node
/**
 * Sync Cito match player-stats for recent completed tier-1 series.
 * Writes Supabase cito_player_game_stats + public/data/cito_player_stats_cache.json
 * + data/ml/cito_oe_supplement.csv for ML (no OE Drive wait).
 *
 * Env: CITO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run sync:cito-player-stats
 *   npm run sync:cito-player-stats -- --max-matches 25 --days 21
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import { normalizeCitoGoldGraph } from './goldNormalize.ts'
import {
  extractPlayersFromMatchPlayerStats,
  normalizeCitoPlayer,
  toOeLeagueCode,
  toOePlayerCsvRow,
  type CitoNormalizedPlayerRow,
} from './playerStatsNormalize.ts'
import type { CitoPostgamePayload, CitoScheduleEvent } from './types.ts'
import { createServiceClient, requireEnv } from '../recap/db.ts'
import { isAcademyOrMinor } from './academyFilter.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

const TIER1 = [
  { leagueId: 'lol-lck', name: 'LCK' },
  { leagueId: 'lol-lpl', name: 'LPL' },
  { leagueId: 'lol-lec', name: 'LEC' },
  { leagueId: 'lol-lcs', name: 'LCS' },
  { leagueId: 'lol-msi', name: 'MSI' },
  { leagueId: 'lol-worlds', name: 'Worlds' },
  { leagueId: 'lol-first-stand', name: 'First Stand' },
]

const CACHE_PATH = path.join(ROOT, 'public/data/cito_player_stats_cache.json')
const SUPPLEMENT_PATH = path.join(ROOT, 'data/ml/cito_oe_supplement.csv')

function parseArgs(argv: string[]) {
  const maxIdx = argv.indexOf('--max-matches')
  const daysIdx = argv.indexOf('--days')
  return {
    maxMatches: maxIdx >= 0 ? Math.max(1, Number(argv[maxIdx + 1]) || 30) : 30,
    lookbackDays: daysIdx >= 0 ? Math.max(7, Number(argv[daysIdx + 1]) || 21) : 21,
  }
}

function normalizeMatchId(matchId: string): string {
  return matchId.startsWith('lol-match-') ? matchId : `lol-match-${matchId}`
}

function withinLookback(startTime: string | undefined, days: number): boolean {
  if (!startTime) return false
  const start = new Date(startTime)
  if (Number.isNaN(start.getTime())) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return start >= cutoff
}

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeOeSupplementCsv(rows: CitoNormalizedPlayerRow[]): void {
  if (!rows.length) {
    console.log('No player rows — skip OE supplement CSV.')
    return
  }

  // Fill teamkills per game/team then emit player + synthetic team rows.
  const byGameTeam = new Map<string, CitoNormalizedPlayerRow[]>()
  for (const r of rows) {
    const key = `${r.citoGameId}|${r.teamName}`
    const list = byGameTeam.get(key) ?? []
    list.push(r)
    byGameTeam.set(key, list)
  }

  const oeRows: Record<string, unknown>[] = []
  for (const group of byGameTeam.values()) {
    const teamKills = group.reduce((s, p) => s + p.kills, 0)
    const teamDeaths = group.reduce((s, p) => s + p.deaths, 0)
    const teamAssists = group.reduce((s, p) => s + p.assists, 0)
    const teamGold = group.reduce((s, p) => s + p.gold, 0)
    const teamDmg = group.reduce((s, p) => s + p.damage, 0)
    const head = group[0]!
    for (const p of group) {
      const row = toOePlayerCsvRow(p)
      row.teamkills = teamKills
      oeRows.push(row)
    }
    oeRows.push({
      gameid: head.citoGameId,
      datacompleteness: 'partial',
      league: toOeLeagueCode(head.league),
      year: head.gameDate.slice(0, 4),
      split: 'Summer',
      playoffs: 0,
      date: `${head.gameDate} 12:00:00`,
      game: head.gameNumber ?? 1,
      patch: '',
      side: head.side ?? '',
      position: 'team',
      playername: '',
      teamname: head.teamName,
      champion: '',
      result: head.result,
      kills: teamKills,
      deaths: teamDeaths,
      assists: teamAssists,
      teamkills: teamKills,
      dpm: head.gameLengthMinutes ? teamDmg / head.gameLengthMinutes : null,
      damageshare: null,
      damagetochampions: teamDmg,
      earnedgoldshare: null,
      totalgold: teamGold,
      visionscore: group.reduce((s, p) => s + p.visionScore, 0),
      wardskilled: group.reduce((s, p) => s + p.wardsDestroyed, 0),
      wardsplaced: group.reduce((s, p) => s + p.wardsPlaced, 0),
      golddiffat15: group.find((p) => p.role === 'top')?.gd15 ?? group[0]?.gd15 ?? null,
      csdiffat15: null,
      xpdiffat15: null,
      golddiffat25: group.find((p) => p.gd25 != null)?.gd25 ?? null,
      'total cs': group.reduce((s, p) => s + p.cs, 0),
      gamelength: head.gameLengthMinutes != null ? Math.round(head.gameLengthMinutes * 60) : null,
      cito_source: 1,
    })
  }

  const cols = Array.from(
    oeRows.reduce((set, r) => {
      for (const k of Object.keys(r)) set.add(k)
      return set
    }, new Set<string>()),
  )
  const lines = [
    cols.join(','),
    ...oeRows.map((r) => cols.map((c) => csvEscape(r[c])).join(',')),
  ]
  mkdirSync(path.dirname(SUPPLEMENT_PATH), { recursive: true })
  writeFileSync(SUPPLEMENT_PATH, lines.join('\n'), 'utf8')
  console.log(`Wrote ${oeRows.length} OE-shaped rows → ${SUPPLEMENT_PATH}`)
}

async function upsertPlayerRows(
  store: ReturnType<typeof createServiceClient>,
  rows: CitoNormalizedPlayerRow[],
): Promise<void> {
  if (!rows.length) return
  const payload = rows.map((r) => ({
    cito_game_id: r.citoGameId,
    cito_match_id: r.citoMatchId,
    game_number: r.gameNumber,
    league: r.league,
    game_date: r.gameDate,
    player_name: r.playerName,
    team_name: r.teamName,
    team_slug: r.teamSlug,
    side: r.side,
    role: r.role,
    champion: r.champion,
    result: r.result,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    kda: r.kda,
    cs: r.cs,
    gold: r.gold,
    damage: r.damage,
    dpm: r.dpm,
    damage_share: r.damageShare,
    gold_share: r.goldShare,
    vision_score: r.visionScore,
    wards_placed: r.wardsPlaced,
    wards_destroyed: r.wardsDestroyed,
    gd15: r.gd15,
    csd15: r.csd15,
    xpd15: r.xpd15,
    gd25: r.gd25,
    game_length_minutes: r.gameLengthMinutes,
    payload: r.payload,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  // Chunk upserts
  for (let i = 0; i < payload.length; i += 100) {
    const chunk = payload.slice(i, i + 100)
    const { error } = await store.from('cito_player_game_stats').upsert(chunk, {
      onConflict: 'cito_game_id,player_name',
    })
    if (error) {
      console.warn(`cito_player_game_stats upsert failed: ${error.message}`)
      break
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const client = new CitoClient({ apiKey: requireEnv('CITO_API_KEY') })
  const store = createServiceClient()

  type MatchRef = {
    matchId: string
    league: string
    startTime: string
    teamA: string
    teamB: string
    scoreA: number | null
    scoreB: number | null
  }

  const matches: MatchRef[] = []
  for (const league of TIER1) {
    try {
      const events = await client.paced(() =>
        client.getData<CitoScheduleEvent[]>(`/lol/leagues/${league.leagueId}/results`, {
          limit: 80,
        }),
      )
      for (const ev of events ?? []) {
        if (!withinLookback(ev.startTime, args.lookbackDays)) continue
        const teams = ev.teams ?? []
        const a = teams[0]
        const b = teams[1]
        if (!a?.name || !b?.name) continue
        if (
          isAcademyOrMinor({
            teamA: a.name,
            teamB: b.name,
            league: league.name,
            tournamentName: ev.blockName,
            blockName: ev.blockName,
          })
        ) {
          continue
        }
        const state = (ev.state ?? '').toLowerCase()
        if (state && !['completed', 'finished', 'done', 'complete'].includes(state)) {
          // results endpoint is usually completed; keep if scores clinched
          const sa = typeof a.score === 'number' ? a.score : null
          const sb = typeof b.score === 'number' ? b.score : null
          if (sa == null || sb == null || Math.max(sa, sb) < 2) continue
        }
        matches.push({
          matchId: normalizeMatchId(ev.matchId),
          league: league.name,
          startTime: ev.startTime ?? '',
          teamA: a.name,
          teamB: b.name,
          scoreA: typeof a.score === 'number' ? a.score : null,
          scoreB: typeof b.score === 'number' ? b.score : null,
        })
      }
    } catch (err) {
      console.warn(`results ${league.name}:`, err instanceof Error ? err.message : err)
    }
  }

  // Dedupe + newest first
  const byId = new Map<string, MatchRef>()
  for (const m of matches) byId.set(m.matchId, m)
  const ordered = [...byId.values()]
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, args.maxMatches)

  console.log(`Syncing player-stats for ${ordered.length} completed match(es)…`)

  const allRows: CitoNormalizedPlayerRow[] = []
  let ok = 0
  let fail = 0

  for (const match of ordered) {
    try {
      const raw = await client.paced(() =>
        client.get<unknown>(
          `/lol/matches/${encodeURIComponent(match.matchId)}/player-stats`,
        ),
      )
      const games = extractPlayersFromMatchPlayerStats(raw)
      if (!games.length) {
        console.warn(`  ${match.matchId}: empty player-stats`)
        fail += 1
        continue
      }

      const winner =
        match.scoreA != null && match.scoreB != null
          ? match.scoreA > match.scoreB
            ? match.teamA
            : match.scoreB > match.scoreA
              ? match.teamB
              : null
          : null

      for (const game of games) {
        let goldTimeline: Array<{ minute: number; goldDiffBlue: number }> | null = null
        let duration = game.durationMinutes ?? null
        try {
          const postgame = await client.paced(() =>
            client.getData<CitoPostgamePayload>(
              `/lol/games/${encodeURIComponent(game.gameId)}/postgame`,
            ),
          )
          goldTimeline = normalizeCitoGoldGraph(postgame)
          if (duration == null && goldTimeline.length) {
            duration = goldTimeline[goldTimeline.length - 1]!.minute
          }
        } catch {
          // optional
        }

        const date = (match.startTime || '').slice(0, 10)
        for (const p of game.players) {
          const row = normalizeCitoPlayer(p, {
            citoGameId: game.gameId,
            citoMatchId: match.matchId,
            gameNumber: game.gameNumber,
            league: match.league,
            gameDate: date,
            winnerTeam: winner,
            goldTimeline,
            gameLengthMinutes: duration,
          })
          if (row) allRows.push(row)
        }
      }
      ok += 1
      console.log(
        `  ✓ ${match.league} ${match.teamA} vs ${match.teamB} (${games.length} games, ${games.reduce((s, g) => s + g.players.length, 0)} players)`,
      )
    } catch (err) {
      fail += 1
      console.warn(
        `  ✗ ${match.matchId}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Merge with existing cache (keep older rows outside lookback)
  let prior: CitoNormalizedPlayerRow[] = []
  if (existsSync(CACHE_PATH)) {
    try {
      const body = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as {
        rows?: CitoNormalizedPlayerRow[]
      }
      prior = body.rows ?? []
    } catch {
      prior = []
    }
  }
  const merged = new Map<string, CitoNormalizedPlayerRow>()
  for (const r of prior) merged.set(`${r.citoGameId}|${r.playerName}`, r)
  for (const r of allRows) merged.set(`${r.citoGameId}|${r.playerName}`, r)
  const cacheRows = [...merged.values()].sort((a, b) =>
    b.gameDate.localeCompare(a.gameDate),
  )

  mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  writeFileSync(
    CACHE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rowCount: cacheRows.length,
        rows: cacheRows,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.log(`Cache → ${CACHE_PATH} (${cacheRows.length} player-game rows)`)

  await upsertPlayerRows(store, allRows)
  writeOeSupplementCsv(cacheRows.filter((r) => withinLookback(`${r.gameDate}T12:00:00Z`, args.lookbackDays)))

  console.log(`Done. synced=${ok} failed=${fail} newRows=${allRows.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
