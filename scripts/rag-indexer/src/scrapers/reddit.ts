import {
  POST_MATCH_TITLE_RE,
  REDDIT_LOOKBACK_DAYS,
  REDDIT_MAX_COMMENTS_PER_THREAD,
  REDDIT_MAX_THREADS,
  REDDIT_MIN_COMMENT_SCORE,
  REDDIT_SUBREDDIT,
  REDDIT_USER_AGENT,
} from '../config.js'
import type { ScrapedPage } from '../types.js'
import { normalizeWhitespace } from '../utils/html.js'
import { rateLimitedFetch, sleep } from '../utils/http.js'
import { normalizeSourceUrl } from '../utils/url.js'

interface RedditListing {
  data?: {
    children?: Array<{ kind: string; data: RedditPost | RedditComment }>
  }
}

interface RedditPost {
  id: string
  title: string
  score: number
  created_utc: number
  permalink: string
  link_flair_text?: string
  selftext?: string
}

interface RedditComment {
  id: string
  body?: string
  score: number
  parent_id?: string
  author?: string
}

interface PullPushSubmission {
  id: string
  title: string
  score: number
  created_utc: number
  permalink: string
}

interface PullPushComment {
  id: string
  body?: string
  score: number
  parent_id?: string
  author?: string
}

function redditUrl(path: string): string {
  return `https://www.reddit.com${path.startsWith('/') ? path : `/${path}`}`
}

function isRecent(createdUtc: number): boolean {
  const cutoff = Date.now() / 1000 - REDDIT_LOOKBACK_DAYS * 86400
  return createdUtc >= cutoff
}

function isPostMatchThread(post: RedditPost): boolean {
  if (POST_MATCH_TITLE_RE.test(post.title)) return true
  if (post.link_flair_text && POST_MATCH_TITLE_RE.test(post.link_flair_text)) return true
  return false
}

async function fetchRedditListing(url: string): Promise<RedditListing | null> {
  const response = await rateLimitedFetch(url, {
    headers: { 'User-Agent': REDDIT_USER_AGENT },
  })
  if (response.status === 403 || response.status === 429) {
    return null
  }
  if (!response.ok) {
    console.warn(`Reddit HTTP ${response.status}: ${url}`)
    return null
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) {
    return null
  }
  return (await response.json()) as RedditListing
}

async function discoverPostMatchThreads(): Promise<RedditPost[]> {
  const urls = [
    `https://www.reddit.com/r/${REDDIT_SUBREDDIT}/new.json?limit=100`,
    `https://www.reddit.com/r/${REDDIT_SUBREDDIT}/search.json?q=Post-Match+Discussion&restrict_sr=1&sort=new&limit=50`,
  ]

  const posts = new Map<string, RedditPost>()
  for (const url of urls) {
    const listing = await fetchRedditListing(url)
    if (!listing) continue
    for (const child of listing.data?.children ?? []) {
      if (child.kind !== 't3') continue
      const post = child.data as RedditPost
      if (!isPostMatchThread(post) || !isRecent(post.created_utc)) continue
      posts.set(post.id, post)
    }
    await sleep(1500)
  }
  return [...posts.values()]
    .sort((a, b) => b.created_utc - a.created_utc)
    .slice(0, REDDIT_MAX_THREADS)
}

async function fetchTopLevelComments(postId: string): Promise<RedditComment[]> {
  const url = `https://www.reddit.com/r/${REDDIT_SUBREDDIT}/comments/${postId}.json?sort=top&limit=200&depth=1`
  const response = await rateLimitedFetch(url, {
    headers: { 'User-Agent': REDDIT_USER_AGENT },
  })
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) {
    return []
  }

  const payload = (await response.json()) as RedditListing[]
  const commentListing = payload[1]
  const parentPrefix = `t3_${postId}`

  return (commentListing?.data?.children ?? [])
    .filter((c) => c.kind === 't1')
    .map((c) => c.data as RedditComment)
    .filter(
      (c) =>
        c.parent_id === parentPrefix &&
        typeof c.body === 'string' &&
        c.body !== '[deleted]' &&
        c.body !== '[removed]' &&
        c.score >= REDDIT_MIN_COMMENT_SCORE,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, REDDIT_MAX_COMMENTS_PER_THREAD)
}

async function discoverViaPullPush(): Promise<RedditPost[]> {
  const cutoff = Math.floor(Date.now() / 1000 - REDDIT_LOOKBACK_DAYS * 86400)
  const urls = [
    `https://api.pullpush.io/reddit/search/submission/?subreddit=${REDDIT_SUBREDDIT}&q=Post-Match+Discussion&size=100&sort=desc`,
    `https://api.pullpush.io/reddit/search/submission/?subreddit=${REDDIT_SUBREDDIT}&after=${cutoff}&size=100&sort=desc`,
  ]

  const posts = new Map<string, RedditPost>()
  for (const url of urls) {
    const response = await rateLimitedFetch(url)
    if (!response.ok) continue
    const payload = (await response.json()) as { data?: PullPushSubmission[] }
    for (const s of payload.data ?? []) {
      if (!POST_MATCH_TITLE_RE.test(s.title)) continue
      if (s.created_utc < cutoff) continue
      posts.set(s.id, {
        id: s.id,
        title: s.title,
        score: s.score,
        created_utc: s.created_utc,
        permalink: s.permalink,
      })
    }
    await sleep(800)
  }

  return [...posts.values()]
    .sort((a, b) => b.created_utc - a.created_utc)
    .slice(0, REDDIT_MAX_THREADS)
}

async function fetchCommentsViaPullPush(postId: string): Promise<RedditComment[]> {
  const url = `https://api.pullpush.io/reddit/search/comment/?link_id=${postId}&size=500&sort=desc`
  const response = await rateLimitedFetch(url)
  if (!response.ok) return []

  const payload = (await response.json()) as { data?: PullPushComment[] }
  const parentPrefix = `t3_${postId}`

  return (payload.data ?? [])
    .filter(
      (c) =>
        c.parent_id === parentPrefix &&
        typeof c.body === 'string' &&
        c.body !== '[deleted]' &&
        c.body !== '[removed]' &&
        c.score >= REDDIT_MIN_COMMENT_SCORE,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, REDDIT_MAX_COMMENTS_PER_THREAD)
}

function formatThreadPage(post: RedditPost, comments: RedditComment[]): string {
  const header = [
    `Thread score: ${post.score}`,
    post.selftext ? normalizeWhitespace(post.selftext) : null,
  ]
    .filter(Boolean)
    .join('\n')

  const body = comments
    .map(
      (c, idx) =>
        `Comment ${idx + 1} (score ${c.score}${c.author ? `, u/${c.author}` : ''}):\n${normalizeWhitespace(c.body ?? '')}`,
    )
    .join('\n\n')

  return `${header}\n\n${body}`.trim()
}

export async function scrapeRedditPostMatch(): Promise<ScrapedPage[]> {
  console.log('Fetching r/lolesports post-match threads...')

  let posts = await discoverPostMatchThreads()
  let usePullPush = false

  if (!posts.length) {
    console.warn('Reddit JSON unavailable or empty; falling back to PullPush archive.')
    posts = await discoverViaPullPush()
    usePullPush = true
  }

  console.log(`  found ${posts.length} post-match thread(s)`)

  const scraped: ScrapedPage[] = []
  for (const post of posts) {
    const comments = usePullPush
      ? await fetchCommentsViaPullPush(post.id)
      : await fetchTopLevelComments(post.id)

    if (!comments.length) {
      console.warn(`  skipping ${post.id}: no comments above score ${REDDIT_MIN_COMMENT_SCORE}`)
      continue
    }

    const sourceUrl = normalizeSourceUrl(redditUrl(post.permalink))
    scraped.push({
      source: 'reddit',
      sourceUrl,
      title: post.title,
      text: formatThreadPage(post, comments),
      contextHeader: `Reddit post-match: ${post.title}`,
      scrapedAt: new Date().toISOString(),
    })
    await sleep(1200)
  }

  console.log(`Reddit scrape complete: ${scraped.length} thread page(s)`)
  return scraped
}
