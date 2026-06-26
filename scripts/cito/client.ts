const BASE_URL = 'https://api.citoapi.com/api/v1'

export class CitoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body?: string,
  ) {
    super(message)
    this.name = 'CitoApiError'
  }
}

export interface CitoClientOptions {
  apiKey: string
  timeoutMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class CitoClient {
  private readonly apiKey: string
  private readonly timeoutMs: number

  constructor(options: CitoClientOptions) {
    this.apiKey = options.apiKey
    this.timeoutMs = options.timeoutMs ?? 120_000
  }

  async get<T = unknown>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'x-api-key': this.apiKey,
        },
        signal: controller.signal,
      })

      const text = await response.text()
      if (!response.ok) {
        throw new CitoApiError(
          `CitoAPI ${response.status} for ${path}`,
          response.status,
          path,
          text.slice(0, 500),
        )
      }

      if (!text.trim()) return {} as T

      try {
        return JSON.parse(text) as T
      } catch {
        throw new CitoApiError(`Non-JSON response for ${path}`, response.status, path, text.slice(0, 200))
      }
    } catch (error) {
      if (error instanceof CitoApiError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CitoApiError(`CitoAPI timeout for ${path}`, 408, path)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /** Some Cito endpoints return `{ data: T }`, others return `T[]` or a bare object. */
  unwrapData<T>(payload: unknown): T {
    if (payload == null) return payload as T
    if (Array.isArray(payload)) return payload as T
    if (typeof payload === 'object' && payload !== null && 'data' in payload) {
      return (payload as { data: T }).data
    }
    return payload as T
  }

  async getData<T = unknown>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const payload = await this.get(path, query)
    return this.unwrapData<T>(payload)
  }

  /** Gentle pacing — Cito responses can take 20–90s each. */
  async paced<T>(fn: () => Promise<T>, gapMs = 250): Promise<T> {
    const result = await fn()
    await sleep(gapMs)
    return result
  }
}
