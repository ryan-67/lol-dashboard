import {
  KALSHI_API_BASE,
  KALSHI_API_KEY,
  KALSHI_EXCLUDE_RE,
  KALSHI_LOL_SERIES,
  KALSHI_TIER1_RE,
} from '../config.js'
import type { ScrapedPage } from '../types.js'
import { rateLimitedFetch } from '../utils/http.js'
import { normalizeSourceUrl } from '../utils/url.js'

interface KalshiMarket {
  ticker: string
  event_ticker: string
  title: string
  subtitle?: string
  yes_sub_title?: string
  yes_bid_dollars?: string
  yes_ask_dollars?: string
  no_bid_dollars?: string
  no_ask_dollars?: string
  last_price_dollars?: string
  volume_fp?: string
  open_interest_fp?: string
  close_time?: string
  status?: string
}

interface KalshiMarketsResponse {
  markets?: KalshiMarket[]
  cursor?: string
}

function kalshiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (KALSHI_API_KEY) {
    headers['KALSHI-ACCESS-KEY'] = KALSHI_API_KEY
  }
  return headers
}

function isTier1Market(market: KalshiMarket): boolean {
  const blob = `${market.title} ${market.subtitle ?? ''} ${market.yes_sub_title ?? ''}`
  if (KALSHI_EXCLUDE_RE.test(blob)) return false
  return KALSHI_TIER1_RE.test(blob)
}

function formatCents(value?: string): string {
  if (!value) return 'n/a'
  const num = Number(value)
  if (Number.isNaN(num)) return value
  return `${Math.round(num * 100)}¢`
}

function groupMarketsByEvent(markets: KalshiMarket[]): Map<string, KalshiMarket[]> {
  const map = new Map<string, KalshiMarket[]>()
  for (const market of markets) {
    const key = market.event_ticker || market.ticker
    const list = map.get(key) ?? []
    list.push(market)
    map.set(key, list)
  }
  return map
}

function formatEventOdds(eventTicker: string, markets: KalshiMarket[]): string {
  const lines = markets.map((m) => {
    const label = m.yes_sub_title || m.subtitle || m.title
    return [
      `- ${label}`,
      `  yes bid/ask: ${formatCents(m.yes_bid_dollars)} / ${formatCents(m.yes_ask_dollars)}`,
      `  last: ${formatCents(m.last_price_dollars)}`,
      m.volume_fp ? `  volume: ${m.volume_fp}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  })
  const headline = markets[0]?.title.replace(/\?$/, '') ?? eventTicker
  const close = markets[0]?.close_time
    ? `\nMarket close (UTC): ${markets[0].close_time}`
    : ''
  return `Kalshi market lines\n${headline}\n\n${lines.join('\n\n')}${close}`
}

async function fetchMarketsForSeries(series: string): Promise<KalshiMarket[]> {
  const collected: KalshiMarket[] = []
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({
      series_ticker: series,
      status: 'open',
      limit: '200',
    })
    if (cursor) params.set('cursor', cursor)

    const response = await rateLimitedFetch(
      `${KALSHI_API_BASE}/markets?${params}`,
      { headers: kalshiHeaders() },
    )
    if (!response.ok) {
      console.warn(`Kalshi HTTP ${response.status} for series ${series}`)
      break
    }

    const payload = (await response.json()) as KalshiMarketsResponse
    collected.push(...(payload.markets ?? []))
    cursor = payload.cursor || undefined
  } while (cursor)

  return collected
}

export async function scrapeKalshiOdds(): Promise<ScrapedPage[]> {
  console.log('Fetching Kalshi LoL market odds...')
  const allMarkets: KalshiMarket[] = []

  for (const series of KALSHI_LOL_SERIES) {
    const markets = await fetchMarketsForSeries(series)
    console.log(`  ${series}: ${markets.length} open market(s)`)
    allMarkets.push(...markets)
  }

  const tier1 = allMarkets.filter(isTier1Market)
  console.log(`  tier-1 filtered: ${tier1.length}/${allMarkets.length} market(s)`)

  const grouped = groupMarketsByEvent(tier1)
  const scrapedAt = new Date().toISOString()
  const pages: ScrapedPage[] = []

  for (const [eventTicker, markets] of grouped) {
    const title = markets[0]?.title ?? eventTicker
    const sourceUrl = normalizeSourceUrl(
      `https://kalshi.com/markets/${eventTicker.toLowerCase()}`,
    )
    pages.push({
      source: 'kalshi',
      sourceUrl,
      title,
      text: formatEventOdds(eventTicker, markets),
      contextHeader: `Kalshi odds: ${title.replace(/\?$/, '')}`,
      scrapedAt,
    })
  }

  console.log(`Kalshi scrape complete: ${pages.length} event page(s)`)
  return pages
}
