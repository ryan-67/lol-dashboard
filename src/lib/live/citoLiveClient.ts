/**
 * Browser-side client for live CitoAPI data.
 *
 * The Cito API key is server-side only, so the browser never calls Cito
 * directly — it calls the `cito-live` Supabase edge function which proxies an
 * allowlisted set of endpoints and injects the key.
 *
 * MOCK MODE (for offline / non-live-match testing):
 *   - append `?mock=1` to any /live URL, or
 *   - set `VITE_LIVE_MOCK=1` in .env
 * In mock mode all requests are served from `public/data/live-mock/*.json`,
 * so the entire Live Match Hub UI is testable without a live game.
 */

export type LiveResource =
  | 'live'
  | 'schedule-today'
  | 'schedule-upcoming'
  | 'match'
  | 'match-games'
  | 'match-series'
  | 'match-player-stats'
  | 'match-drafts'
  | 'game-window'
  | 'game-stats'
  | 'game-gold'

function readEnv(key: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const v = (import.meta.env as Record<string, string | undefined>)[key]
    if (v) return v.trim()
  }
  return ''
}

export function isLiveMockMode(): boolean {
  if (readEnv('VITE_LIVE_MOCK') === '1') return true
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mock') === '1') return true
    if (window.localStorage?.getItem('nucky-live-mock') === '1') return true
  }
  return false
}

function functionBase(): string {
  const raw = readEnv('VITE_SUPABASE_URL').replace(/\/$/, '')
  if (!raw) return ''
  // Be tolerant of env misconfiguration where users set VITE_SUPABASE_URL
  // to the functions base instead of the project base.
  return raw.replace(/\/functions\/v1$/i, '')
}

/** Map a resource + id to its mock fixture filename. */
function mockFileFor(resource: LiveResource, id?: string): string {
  switch (resource) {
    case 'live':
      return 'live.json'
    case 'schedule-today':
    case 'schedule-upcoming':
      return 'schedule.json'
    case 'match':
      return `match-${id}.json`
    case 'match-games':
      return `match-${id}-games.json`
    case 'match-series':
      return `match-${id}-series.json`
    case 'match-player-stats':
      return `match-${id}-player-stats.json`
    case 'match-drafts':
      return `match-${id}-drafts.json`
    case 'game-window':
      return `game-${id}-window.json`
    case 'game-stats':
      return `game-${id}-stats.json`
    case 'game-gold':
      return `game-${id}-gold.json`
    default:
      return 'live.json'
  }
}

async function fetchMock(resource: LiveResource, id?: string): Promise<unknown> {
  const file = mockFileFor(resource, id)
  const res = await fetch(`/data/live-mock/${file}`, { cache: 'no-cache' })
  if (!res.ok) return null
  return res.json()
}

/**
 * Fetch a live resource. Returns the raw Cito payload (unwrapped one level if
 * the edge fn wraps it in `{ data }`). Never throws — returns null on failure
 * so the UI can degrade gracefully.
 */
export async function fetchLiveResource(resource: LiveResource, id?: string): Promise<unknown> {
  if (isLiveMockMode()) {
    try {
      return await fetchMock(resource, id)
    } catch {
      return null
    }
  }

  const base = functionBase()
  if (!base) return null

  const url = new URL(`${base}/functions/v1/cito-live`)
  url.searchParams.set('resource', resource)
  if (id) url.searchParams.set('id', id)

  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY')

  try {
    const res = await fetch(url.toString(), {
      headers: anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {},
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: unknown } | unknown
    if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
      return (body as { data: unknown }).data
    }
    return body
  } catch {
    return null
  }
}
