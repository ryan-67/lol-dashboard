import type { CitoScheduleRow } from './loadCitoSchedule'

const EXTERNAL_CACHE_URL = `${import.meta.env.BASE_URL}data/external_schedule_cache.json`

let cachePromise: Promise<CitoScheduleRow[]> | null = null

/**
 * Non-Riot / non-Cito schedules (EWC, etc.) from Leaguepedia Cargo sync cache.
 * See `npm run sync:external-schedule`.
 */
export async function fetchExternalScheduleRows(): Promise<CitoScheduleRow[]> {
  if (!cachePromise) {
    cachePromise = fetch(EXTERNAL_CACHE_URL, { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) return []
        const body = (await res.json()) as { rows?: CitoScheduleRow[] }
        return body.rows ?? []
      })
      .catch(() => [])
  }
  return cachePromise
}

/** Clear module cache so the Predictions board can pick up a refreshed artifact. */
export function invalidateExternalScheduleCache(): void {
  cachePromise = null
}
