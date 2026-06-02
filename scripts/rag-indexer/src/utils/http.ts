import { REQUEST_DELAY_MS, FETCH_RETRIES } from '../config.js'

let lastRequestAt = 0

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, init)
      if (response.status === 429) {
        return response
      }
      if (response.status >= 500) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response
    } catch (err) {
      lastError = err
      if (attempt < FETCH_RETRIES) {
        await sleep(1500 * attempt)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function rateLimitedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < REQUEST_DELAY_MS) {
    await sleep(REQUEST_DELAY_MS - elapsed)
  }
  lastRequestAt = Date.now()
  return fetchWithRetry(url, init)
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
