import {
  LIQUIPEDIA_API,
  LIQUIPEDIA_BASE,
  LIQUIPEDIA_USER_AGENT,
  RECENT_MATCHES_PER_LEAGUE,
  TIER1_PLAYER_PAGES,
  TIER1_TEAM_PAGES,
} from '../config.js'
import type { ScrapedPage } from '../types.js'
import { extractHrefPaths, htmlToPlainText } from '../utils/html.js'
import { decodeHtmlEntities, rateLimitedFetch, sleep } from '../utils/http.js'

interface ParseResponse {
  parse?: {
    title?: string
    text?: { '*': string }
  }
  error?: { info?: string }
}

interface QueryResponse {
  query?: {
    pages?: Record<
      string,
      { title?: string; missing?: string; fullurl?: string }
    >
  }
}

const MATCH_PATH_RE =
  /\/(?:2025|2026)_Season\/(?:Spring(?:_Split)?|Summer(?:_Split)?|Winter(?:_Split)?)\/(?:Week_\d+|Round_\d+|Playoffs|Swiss_Stage|Group_Stage|Regular_Season)\/.+/i

const TOURNAMENT_CANDIDATES: Record<string, string[]> = {
  LCK: [
    'LCK/2026_Season/Spring_Split',
    'LCK/2026_Season/Spring',
    'LCK/2025_Season/Spring_Split',
  ],
  LPL: [
    'LPL/2026_Season/Spring_Split',
    'LPL/2026_Season/Spring',
    'LPL/2025_Season/Spring_Split',
  ],
  LEC: [
    'LEC/2026_Season/Spring_Split',
    'LEC/2026_Season/Spring',
    'LEC/2025_Season/Spring_Split',
  ],
  LCS: [
    'LCS/2026_Season/Spring_Split',
    'LCS/2026_Season/Spring',
    'LCS/2025_Season/Spring_Split',
  ],
}

function pageUrl(page: string): string {
  return `${LIQUIPEDIA_BASE}/${page.replace(/ /g, '_')}`
}

function contextForPage(page: string, title: string): string {
  const clean = title.replace(/_/g, ' ')
  if (page.includes('_vs_') || page.includes('/vs_')) {
    return `Match: ${clean}`
  }
  if (TIER1_PLAYER_PAGES.some((p) => p === page)) {
    return `Player: ${clean}`
  }
  if (TIER1_TEAM_PAGES.some((p) => p === page)) {
    return `Team: ${clean}`
  }
  if (page.includes('Season')) {
    return `Tournament: ${clean}`
  }
  return `Liquipedia: ${clean}`
}

async function liquipediaPageExists(page: string): Promise<boolean> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: page,
  })
  const response = await rateLimitedFetch(`${LIQUIPEDIA_API}?${params}`, {
    headers: { 'User-Agent': LIQUIPEDIA_USER_AGENT },
  })
  if (!response.ok) return false
  const payload = (await response.json()) as QueryResponse
  const pages = payload.query?.pages ?? {}
  return Object.values(pages).some((p) => !p.missing)
}

async function resolveTournamentPages(): Promise<string[]> {
  const resolved: string[] = []
  for (const [league, candidates] of Object.entries(TOURNAMENT_CANDIDATES)) {
    let found: string | null = null
    for (const candidate of candidates) {
      if (await liquipediaPageExists(candidate)) {
        found = candidate
        break
      }
    }
    if (found) {
      console.log(`  ${league} tournament page: ${found}`)
      resolved.push(found)
    } else {
      console.warn(`  ${league}: no tournament page found among candidates`)
    }
  }
  return resolved
}

async function fetchLiquipediaPage(page: string): Promise<ScrapedPage | null> {
  const params = new URLSearchParams({
    action: 'parse',
    format: 'json',
    prop: 'text',
    page,
  })

  const response = await rateLimitedFetch(`${LIQUIPEDIA_API}?${params}`, {
    headers: { 'User-Agent': LIQUIPEDIA_USER_AGENT },
  })

  if (!response.ok) {
    console.warn(`Liquipedia HTTP ${response.status} for ${page}`)
    return null
  }

  const payload = (await response.json()) as ParseResponse
  if (payload.error?.info) {
    console.warn(`Liquipedia error for ${page}: ${payload.error.info}`)
    return null
  }

  const html = payload.parse?.text?.['*']
  if (!html) {
    console.warn(`Liquipedia empty parse for ${page}`)
    return null
  }

  const title = decodeHtmlEntities(payload.parse?.title ?? page)
  const text = htmlToPlainText(html)
  if (text.length < 80) {
    console.warn(`Liquipedia page too short, skipping: ${page}`)
    return null
  }

  return {
    source: 'liquipedia',
    sourceUrl: pageUrl(page),
    title,
    text,
    contextHeader: contextForPage(page, title),
    scrapedAt: new Date().toISOString(),
  }
}

async function discoverMatchPages(tournamentPage: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'parse',
    format: 'json',
    prop: 'text',
    page: tournamentPage,
  })

  const response = await rateLimitedFetch(`${LIQUIPEDIA_API}?${params}`, {
    headers: { 'User-Agent': LIQUIPEDIA_USER_AGENT },
  })
  if (!response.ok) return []

  const payload = (await response.json()) as ParseResponse
  const html = payload.parse?.text?.['*']
  if (!html) return []

  const paths = extractHrefPaths(html, MATCH_PATH_RE)
  return paths.slice(-RECENT_MATCHES_PER_LEAGUE)
}

export async function scrapeLiquipedia(): Promise<ScrapedPage[]> {
  const probe = await rateLimitedFetch(`${LIQUIPEDIA_API}?${new URLSearchParams({ action: 'query', format: 'json', titles: 'T1' })}`, {
    headers: { 'User-Agent': LIQUIPEDIA_USER_AGENT },
  })
  if (probe.status === 429) {
    console.warn('Liquipedia rate limited (429); skipping Liquipedia scrape this run.')
    return []
  }

  console.log('Resolving tier-1 tournament pages...')
  const tournaments = await resolveTournamentPages()

  const pageSet = new Set<string>([
    ...tournaments,
    ...TIER1_TEAM_PAGES,
    ...TIER1_PLAYER_PAGES,
  ])

  console.log('Discovering recent tier-1 match pages...')
  for (const tournament of tournaments) {
    const matches = await discoverMatchPages(tournament)
    console.log(`  ${tournament}: ${matches.length} recent match page(s)`)
    for (const match of matches) {
      pageSet.add(match)
    }
    await sleep(300)
  }

  const pages = [...pageSet]
  console.log(`Fetching ${pages.length} Liquipedia page(s)...`)

  const scraped: ScrapedPage[] = []
  for (const page of pages) {
    try {
      const result = await fetchLiquipediaPage(page)
      if (result) scraped.push(result)
    } catch (err) {
      console.warn(
        `Liquipedia fetch failed for ${page}: ${err instanceof Error ? err.message : err}`,
      )
    }
  }

  console.log(`Liquipedia scrape complete: ${scraped.length}/${pages.length} pages`)
  return scraped
}
