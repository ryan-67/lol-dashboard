/** OE vs model lag stamp written by scripts/ml/write_ml_freshness.py in CI. */

export interface MlFreshness {
  generatedAt: string
  retrainOutcome: string
  oeDataThrough: string | null
  modelExportedAt: string | null
  modelHoldoutEnd: string | null
  oeAheadOfModelDays: number | null
  note?: string
}

let cache: MlFreshness | null = null
let cacheAt = 0
let inflight: Promise<MlFreshness | null> | null = null

const ARTIFACT_TTL_MS = 5 * 60_000

export async function fetchMlFreshness(opts?: { force?: boolean }): Promise<MlFreshness | null> {
  const stale = !cache || Date.now() - cacheAt > ARTIFACT_TTL_MS
  if (cache && !stale && !opts?.force) return cache
  if (inflight) return inflight

  inflight = fetch('/data/ml_freshness.json', { cache: opts?.force ? 'reload' : 'default' })
    .then(async (res) => {
      if (!res.ok) return null
      const data = (await res.json()) as MlFreshness
      cache = data
      cacheAt = Date.now()
      return data
    })
    .catch(() => null)
    .finally(() => {
      inflight = null
    })

  return inflight
}
