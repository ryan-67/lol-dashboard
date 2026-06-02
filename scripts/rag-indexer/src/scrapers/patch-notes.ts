import {
  MIN_PATCH_MAJOR,
  MIN_PATCH_MINOR,
  PATCH_NOTES_INDEX_URL,
} from '../config.js'
import type { ScrapedPage } from '../types.js'
import { extractLoLNewsLinks, htmlToPlainText, normalizeWhitespace } from '../utils/html.js'
import { rateLimitedFetch } from '../utils/http.js'
import { normalizeSourceUrl } from '../utils/url.js'

const FALLBACK_PATCH_PATHS = [
  'league-of-legends-patch-26-11-notes',
  'league-of-legends-patch-26-10-notes',
  'league-of-legends-patch-26-9-notes',
  'league-of-legends-patch-26-8-notes',
  'league-of-legends-patch-26-7-notes',
  'league-of-legends-patch-26-6-notes',
  'league-of-legends-patch-26-5-notes',
  'league-of-legends-patch-26-4-notes',
  'patch-26-3-notes',
  'patch-26-2-notes',
  'patch-26-1-notes',
]

function toAbsolutePatchUrl(path: string): string {
  const slug = path
    .replace(/^https:\/\/www\.leagueoflegends\.com\/en-us\/news\/game-updates\//i, '')
    .replace(/^\/en-us\/news\/game-updates\//i, '')
    .replace(/\/$/, '')
  return `https://www.leagueoflegends.com/en-us/news/game-updates/${slug}/`
}

export function parsePatchVersion(text: string): { major: number; minor: number } | null {
  const slugMatch = text.match(/(?:league-of-legends-)?patch[-_](\d+)[-_](\d+)/i)
  if (slugMatch) {
    return { major: Number(slugMatch[1]), minor: Number(slugMatch[2]) }
  }
  const dotMatch = text.match(/(?:patch|Patch)\s*(\d+)\.(\d+)/i)
  if (dotMatch) {
    return { major: Number(dotMatch[1]), minor: Number(dotMatch[2]) }
  }
  return null
}

function isSpringSplitOrLater(major: number, minor: number): boolean {
  if (major > MIN_PATCH_MAJOR) return true
  if (major === MIN_PATCH_MAJOR && minor >= MIN_PATCH_MINOR) return true
  return false
}

function extractNextDataLinks(html: string): string[] {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) return []

  try {
    const data = JSON.parse(match[1]) as {
      props?: {
        pageProps?: {
          articles?: Array<{ slug?: string; title?: string; action?: { payload?: { url?: string } } }>
        }
      }
    }
    const articles = data.props?.pageProps?.articles ?? []
    const urls: string[] = []
    for (const article of articles) {
      const fromAction = article.action?.payload?.url
      if (fromAction) {
        urls.push(toAbsolutePatchUrl(fromAction))
        continue
      }
      if (article.slug) {
        urls.push(toAbsolutePatchUrl(article.slug))
      }
    }
    return urls
  } catch {
    return []
  }
}

function extractPayloadLinks(html: string): string[] {
  const urls = new Set<string>()
  const re = /"url":"(\/en-us\/news\/game-updates\/[^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    urls.add(toAbsolutePatchUrl(match[1]))
  }
  return [...urls]
}

async function discoverPatchArticleUrls(): Promise<string[]> {
  const response = await rateLimitedFetch(PATCH_NOTES_INDEX_URL, {
    headers: { 'User-Agent': 'nucky-rag-indexer/1.0 (+https://nucky.gg)' },
  })
  if (!response.ok) {
    console.warn(`Patch index HTTP ${response.status}; using fallback slugs`)
    return FALLBACK_PATCH_PATHS.map(toAbsolutePatchUrl)
  }

  const html = await response.text()
  const links = new Set<string>([
    ...extractLoLNewsLinks(html),
    ...extractNextDataLinks(html),
    ...extractPayloadLinks(html),
    ...FALLBACK_PATCH_PATHS.map(toAbsolutePatchUrl),
  ])

  const filtered = [...links].filter((url) => {
    const version = parsePatchVersion(url)
    return version ? isSpringSplitOrLater(version.major, version.minor) : false
  })

  filtered.sort((a, b) => {
    const va = parsePatchVersion(a)!
    const vb = parsePatchVersion(b)!
    return va.major - vb.major || va.minor - vb.minor
  })

  return [...new Set(filtered.map(normalizeSourceUrl))]
}

async function fetchPatchArticle(url: string): Promise<ScrapedPage | null> {
  const response = await rateLimitedFetch(url, {
    headers: { 'User-Agent': 'nucky-rag-indexer/1.0 (+https://nucky.gg)' },
  })
  if (!response.ok) {
    console.warn(`Patch article HTTP ${response.status}: ${url}`)
    return null
  }

  const html = await response.text()
  const titleMatch =
    html.match(/<meta property="og:title" content="([^"]+)"/i) ??
    html.match(/<title>([^<]+)<\/title>/i)
  const title = normalizeWhitespace(titleMatch?.[1] ?? url)

  const version = parsePatchVersion(title) ?? parsePatchVersion(url)
  if (!version || !isSpringSplitOrLater(version.major, version.minor)) {
    return null
  }

  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i)
  const text = htmlToPlainText(articleMatch?.[0] ?? html)
  if (text.length < 200) {
    console.warn(`Patch article too short, skipping: ${url}`)
    return null
  }

  const patchLabel = `${version.major}.${version.minor}`
  return {
    source: 'patch_notes',
    sourceUrl: normalizeSourceUrl(url),
    title,
    text,
    contextHeader: `Patch: ${patchLabel}`,
    scrapedAt: new Date().toISOString(),
  }
}

export async function scrapePatchNotes(): Promise<ScrapedPage[]> {
  console.log('Discovering patch notes since 2026 Spring split...')
  const urls = await discoverPatchArticleUrls()
  console.log(`Found ${urls.length} patch article URL(s)`)

  const scraped: ScrapedPage[] = []
  for (const url of urls) {
    const page = await fetchPatchArticle(url)
    if (page) scraped.push(page)
  }

  console.log(`Patch notes scrape complete: ${scraped.length}/${urls.length} articles`)
  return scraped
}
