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
let inflight: Promise<MlFreshness | null> | null = null

export async function fetchMlFreshness(opts?: { force?: boolean }): Promise<MlFreshness | null> {
  if (cache && !opts?.force) return cache
  if (inflight) return inflight

  inflight = fetch(`/data/ml_freshness.json?t=${Date.now()}`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return null
      const data = (await res.json()) as MlFreshness
      cache = data
      return data
    })
    .catch(() => null)
    .finally(() => {
      inflight = null
    })

  return inflight
}
