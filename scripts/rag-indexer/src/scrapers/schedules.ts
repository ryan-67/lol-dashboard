import { createClient } from '@supabase/supabase-js'
import {
  DRY_RUN,
  LIQUIPEDIA_API,
  LIQUIPEDIA_BASE,
  LIQUIPEDIA_USER_AGENT,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  requireEnv,
} from '../config.js'
import { decodeHtmlEntities, rateLimitedFetch } from '../utils/http.js'

interface ParseResponse {
  parse?: {
    title?: string
    text?: { '*': string }
  }
  error?: { info?: string }
}

export interface ScheduleRow {
  league: string
  split: string
  team_a: string
  team_b: string
  scheduled_at: string | null
  status: 'scheduled' | 'completed' | 'live' | 'tbd'
  score: string | null
  source: string
  source_url: string
  metadata: Record<string, unknown>
}

const TOURNAMENT_PAGES: Record<string, string[]> = {
  LCK: ['LCK/2026_Season/Spring_Split', 'LCK/2026_Season/Spring'],
  LPL: ['LPL/2026_Season/Spring_Split', 'LPL/2026_Season/Spring'],
  LEC: ['LEC/2026_Season/Spring_Split', 'LEC/2026_Season/Spring'],
  LCS: ['LCS/2026_Season/Spring_Split', 'LCS/2026_Season/Spring'],
}

const RIOT_API = 'https://esports-api.lolesports.com/persisted/gw'
const RIOT_API_FALLBACK = 'https://prod-relapi.ewp.gg/persisted/gw'
const RIOT_API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'

const TIER1_LEAGUE_IDS: Record<string, string> = {
  LCK: '98767991310872058',
  LPL: '98767991299243165',
  LEC: '98767991299243167',
  LCS: '98767991299243166',
}

function pageUrl(page: string): string {
  return `${LIQUIPEDIA_BASE}/${page.replace(/ /g, '_')}`
}

function inferSplitFromPage(page: string): string {
  const year = page.match(/(\d{4})_Season/)?.[1] ?? '2026'
  if (/Spring/i.test(page)) return `${year} Spring`
  if (/Summer/i.test(page)) return `${year} Summer`
  if (/Winter/i.test(page)) return `${year} Winter`
  return `${year} Spring`
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

/** Parse Liquipedia matchlist rows from tournament HTML */
function parseLiquipediaScheduleHtml(
  html: string,
  league: string,
  split: string,
  sourceUrl: string,
): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  const rowRe =
    /<tr[^>]*class="[^"]*match-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let match: RegExpExecArray | null

  while ((match = rowRe.exec(html)) !== null) {
    const rowHtml = match[1]
    const teamLinks = [...rowHtml.matchAll(/href="\/leagueoflegends\/([^"]+)"[^>]*>([^<]+)</gi)]
    if (teamLinks.length < 2) continue

    const teamA = stripTags(teamLinks[0][2])
    const teamB = stripTags(teamLinks[1][2])
    if (!teamA || !teamB || teamA === teamB) continue

    const scoreMatch = rowHtml.match(/data-score="([^"]+)"/i) ??
      rowHtml.match(/class="[^"]*score[^"]*"[^>]*>([\d\-:]+)</i)
    const score = scoreMatch ? stripTags(scoreMatch[1]) : null
    const status = score && /\d/.test(score) ? 'completed' : 'scheduled'

    const tsMatch = rowHtml.match(/data-timestamp="(\d+)"/i)
    const scheduledAt = tsMatch
      ? new Date(Number(tsMatch[1]) * 1000).toISOString()
      : null

    rows.push({
      league,
      split,
      team_a: teamA.replace(/_/g, ' '),
      team_b: teamB.replace(/_/g, ' '),
      scheduled_at: scheduledAt,
      status,
      score,
      source: 'liquipedia',
      source_url: sourceUrl,
      metadata: { parser: 'match-row' },
    })
  }

  // Fallback: vs links in bracket tables
  if (!rows.length) {
    const vsRe =
      /([A-Za-z0-9.'\s]+)\s*(?:vs\.?|—|-)\s*([A-Za-z0-9.'\s]+)/g
    const seen = new Set<string>()
    let vsMatch: RegExpExecArray | null
    while ((vsMatch = vsRe.exec(stripTags(html))) !== null) {
      const a = vsMatch[1].trim()
      const b = vsMatch[2].trim()
      if (a.length < 2 || b.length < 2 || a.length > 40 || b.length > 40) continue
      const key = [a, b].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        league,
        split,
        team_a: a,
        team_b: b,
        scheduled_at: null,
        status: 'tbd',
        score: null,
        source: 'liquipedia',
        source_url: sourceUrl,
        metadata: { parser: 'vs-fallback' },
      })
      if (rows.length >= 30) break
    }
  }

  return rows
}

async function fetchLiquipediaTournament(page: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'parse',
    format: 'json',
    prop: 'text',
    page,
  })
  const response = await rateLimitedFetch(`${LIQUIPEDIA_API}?${params}`, {
    headers: { 'User-Agent': LIQUIPEDIA_USER_AGENT },
  })
  if (!response.ok) return null
  const payload = (await response.json()) as ParseResponse
  return payload.parse?.text?.['*'] ?? null
}

async function scrapeLiquipediaSchedules(): Promise<ScheduleRow[]> {
  const all: ScheduleRow[] = []

  for (const [league, candidates] of Object.entries(TOURNAMENT_PAGES)) {
    let html: string | null = null
    let usedPage = ''
    for (const page of candidates) {
      html = await fetchLiquipediaTournament(page)
      if (html && html.length > 500) {
        usedPage = page
        break
      }
    }
    if (!html || !usedPage) {
      console.warn(`  ${league}: no tournament schedule page found`)
      continue
    }
    const split = inferSplitFromPage(usedPage)
    const rows = parseLiquipediaScheduleHtml(html, league, split, pageUrl(usedPage))
    console.log(`  ${league}: ${rows.length} schedule row(s) from ${usedPage}`)
    all.push(...rows)
  }

  return all
}

async function fetchRiotScheduleForLeague(
  baseUrl: string,
  league: string,
  leagueId: string,
): Promise<ScheduleRow[]> {
  const url = `${baseUrl}/getSchedule?hl=en-US&leagueId=${leagueId}`
  const response = await fetch(url, {
    headers: {
      'x-api-key': RIOT_API_KEY,
      Accept: 'application/json',
    },
  })
  if (!response.ok) return []

  const payload = (await response.json()) as {
    data?: { schedule?: { events?: RiotScheduleEvent[] } }
  }
  const events = payload.data?.schedule?.events ?? []
  const rows: ScheduleRow[] = []

  for (const ev of events) {
    const teams = ev.match?.teams ?? []
    if (teams.length < 2) continue
    const teamA = teams[0].name ?? teams[0].code ?? 'TBD'
    const teamB = teams[1].name ?? teams[1].code ?? 'TBD'
    const winsA = teams[0].result?.gameWins
    const winsB = teams[1].result?.gameWins
    const score = winsA != null && winsB != null ? `${winsA}-${winsB}` : null
    const state = (ev.state ?? '').toLowerCase()
    const status: ScheduleRow['status'] =
      state === 'completed' ? 'completed' : state === 'inprogress' ? 'live' : 'scheduled'

    rows.push({
      league,
      split: inferSplitFromBlock(ev.blockName ?? ''),
      team_a: teamA,
      team_b: teamB,
      scheduled_at: ev.startTime ? new Date(ev.startTime).toISOString() : null,
      status,
      score,
      source: 'riot_esports',
      source_url: `https://lolesports.com/schedule?leagues=${league.toLowerCase()}`,
      metadata: { block: ev.blockName, match_id: ev.match?.id },
    })
  }

  return rows
}

interface RiotScheduleEvent {
  startTime: string
  state: string
  blockName?: string
  league?: { slug?: string; name?: string }
  match?: {
    id?: string
    teams?: Array<{ name?: string; code?: string; result?: { outcome?: string; gameWins?: number } }>
  }
}

async function scrapeRiotSchedules(): Promise<ScheduleRow[]> {
  try {
    const rows: ScheduleRow[] = []
    for (const [league, leagueId] of Object.entries(TIER1_LEAGUE_IDS)) {
      let leagueRows = await fetchRiotScheduleForLeague(RIOT_API, league, leagueId)
      if (!leagueRows.length) {
        leagueRows = await fetchRiotScheduleForLeague(RIOT_API_FALLBACK, league, leagueId)
      }
      rows.push(...leagueRows)
    }

    console.log(`Riot esports API: ${rows.length} tier-1 schedule row(s)`)
    return rows.slice(0, 120)
  } catch (err) {
    console.warn(`Riot schedule fetch failed: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

function inferSplitFromBlock(block: string): string {
  const year = block.match(/(\d{4})/)?.[1] ?? '2026'
  if (/spring/i.test(block)) return `${year} Spring`
  if (/summer/i.test(block)) return `${year} Summer`
  if (/winter/i.test(block)) return `${year} Winter`
  return `${year} Spring`
}

function dedupeSchedules(rows: ScheduleRow[]): ScheduleRow[] {
  const map = new Map<string, ScheduleRow>()
  for (const row of rows) {
    const key = [
      row.league,
      row.split,
      row.team_a.toLowerCase(),
      row.team_b.toLowerCase(),
      row.scheduled_at ?? 'tbd',
    ].join('|')
    const existing = map.get(key)
    if (!existing || row.source === 'riot_esports') {
      map.set(key, row)
    }
  }
  return [...map.values()]
}

export async function scrapeAndUpsertSchedules(): Promise<number> {
  console.log('Scraping tier-1 schedules (Liquipedia + Riot)...')
  const [liquipedia, riot] = await Promise.all([
    scrapeLiquipediaSchedules(),
    scrapeRiotSchedules(),
  ])
  const rows = dedupeSchedules([...riot, ...liquipedia])
  console.log(`Schedule scrape total: ${rows.length} unique row(s)`)

  if (!rows.length) return 0
  if (DRY_RUN) {
    console.log(`[dry-run] Would upsert ${rows.length} esports_schedules row(s)`)
    return rows.length
  }

  const url = requireEnv('SUPABASE_URL', SUPABASE_URL)
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY)
  const supabase = createClient(url, key)

  const { error } = await supabase.from('esports_schedules').upsert(rows, {
    onConflict: 'league,split,team_a,team_b,scheduled_at,source_url',
  })
  if (error) {
    throw new Error(`esports_schedules upsert failed: ${error.message}`)
  }

  return rows.length
}
