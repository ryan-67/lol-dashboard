#!/usr/bin/env node
/**
 * Sync non-Riot tournament schedules (EWC, etc.) from Leaguepedia Cargo API
 * into public/data/external_schedule_cache.json for the Predictions board.
 *
 * EWC is not on lolesports/Cito feeds — Leaguepedia MatchSchedule is the
 * structured source. Be polite: 1 page at a time, User-Agent, backoff.
 *
 * Usage: npm run sync:external-schedule
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'public/data/external_schedule_cache.json')
const UA = 'nucky.gg-schedule-sync/1.0 (contact: geonbu@nucky.gg; +https://nucky.gg)'

type ExtRow = {
  match_id: string
  league: string
  tournament_name: string
  team_a: string
  team_b: string
  scheduled_at: string | null
  status: string
  block_name: string | null
  best_of: number | null
}

const TOURNAMENTS: Array<{
  overviewPages: string[]
  league: string
  tournamentName: string
}> = [
  {
    overviewPages: [
      'Esports World Cup/2026',
      'Esports World Cup 2026',
      'EWC/2026',
    ],
    league: 'EWC',
    tournamentName: 'Esports World Cup 2026',
  },
]

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function cargoQuery(params: Record<string, string>): Promise<unknown[]> {
  const url = new URL('https://lol.fandom.com/api.php')
  url.searchParams.set('action', 'cargoquery')
  url.searchParams.set('format', 'json')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  if (res.status === 429) {
    console.warn('[external-schedule] rate limited — keeping previous cache')
    return []
  }
  if (!res.ok) {
    console.warn('[external-schedule] cargo HTTP', res.status)
    return []
  }
  const body = (await res.json()) as {
    cargoquery?: Array<{ title?: Record<string, string> }>
    error?: { info?: string }
  }
  if (body.error) {
    console.warn('[external-schedule] cargo error', body.error.info)
    return []
  }
  return (body.cargoquery ?? []).map((r) => r.title ?? {})
}

function parseBestOf(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) return n
  const m = String(raw).match(/bo\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

function normalizeTeam(name: string | undefined): string {
  const v = (name ?? '').replace(/_/g, ' ').trim()
  if (!v || /^tbd$/i.test(v) || /^tba$/i.test(v)) return 'TBD'
  const aliases: Record<string, string> = {
    GEN: 'Gen.G',
    'Gen.G Esports': 'Gen.G',
    DK: 'Dplus Kia',
    'Dplus KIA': 'Dplus Kia',
    'Dplus Kia': 'Dplus Kia',
    KC: 'Karmine Corp',
    HLE: 'Hanwha Life Esports',
    BLG: 'Bilibili Gaming',
  }
  return aliases[v] ?? v
}

function toIso(cargoDt: string | undefined): string | null {
  if (!cargoDt?.trim()) return null
  // Cargo DateTime_UTC is usually "YYYY-MM-DD HH:MM:SS"
  const normalized = cargoDt.trim().replace(' ', 'T')
  const d = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function fetchOverview(overviewPage: string, league: string, tournamentName: string) {
  const year = new Date().getFullYear()
  const since = `${year - 1}-01-01 00:00:00`
  const rows = (await cargoQuery({
    tables: 'MatchSchedule',
    fields: 'Team1,Team2,DateTime_UTC,BestOf,OverviewPage,MatchId,Tab,IsFlexibleStart',
    where: `OverviewPage="${overviewPage.replace(/"/g, '')}" AND DateTime_UTC >= "${since}"`,
    order_by: 'DateTime_UTC',
    limit: '100',
  })) as Array<Record<string, string>>

  const out: ExtRow[] = []
  for (const r of rows) {
    const teamA = normalizeTeam(r.Team1)
    const teamB = normalizeTeam(r.Team2)
    const scheduled = toIso(r.DateTime_UTC)
    const matchId =
      (r.MatchId && `lp-${r.MatchId}`) ||
      `lp-${league}-${scheduled ?? 'na'}-${teamA}-${teamB}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    const confirmed = teamA !== 'TBD' && teamB !== 'TBD'
    out.push({
      match_id: matchId,
      league,
      tournament_name: tournamentName,
      team_a: teamA,
      team_b: teamB,
      scheduled_at: scheduled,
      status: confirmed ? 'unstarted' : 'tbd',
      block_name: r.Tab?.trim() || null,
      best_of: parseBestOf(r.BestOf),
    })
  }
  return out
}

function readPrevious(): ExtRow[] {
  try {
    const prev = JSON.parse(readFileSync(OUT, 'utf8')) as { rows?: ExtRow[] }
    return prev.rows ?? []
  } catch {
    return []
  }
}

async function main() {
  const byId = new Map<string, ExtRow>()
  for (const row of readPrevious()) byId.set(row.match_id, row)

  let fetched = 0
  for (const t of TOURNAMENTS) {
    for (const page of t.overviewPages) {
      console.log('[external-schedule] cargo', page)
      const rows = await fetchOverview(page, t.league, t.tournamentName)
      fetched += rows.length
      for (const row of rows) byId.set(row.match_id, row)
      await sleep(1200)
      if (rows.length) break
    }
  }

  const rows = [...byId.values()].sort((a, b) =>
    (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''),
  )
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: 'leaguepedia-cargo',
        generatedAt: new Date().toISOString(),
        fetched,
        rows,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`[external-schedule] wrote ${rows.length} rows (${fetched} from cargo) → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
