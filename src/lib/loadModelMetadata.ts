/** Canonical pipeline stamp from export_artifacts.py → public/data/model_metadata.json */

export interface ModelMetadata {
  exported_at: string
  algo?: string
  date_range?: [string, string]
  trained_rows?: number
  trained_series?: number
  ship_gate_passed?: boolean | null
}

let cache: ModelMetadata | null = null
let cacheAt = 0
let inflight: Promise<ModelMetadata | null> | null = null

const ARTIFACT_TTL_MS = 5 * 60_000

export async function fetchModelMetadata(opts?: {
  force?: boolean
}): Promise<ModelMetadata | null> {
  const stale = !cache || Date.now() - cacheAt > ARTIFACT_TTL_MS
  if (cache && !stale && !opts?.force) return cache
  if (inflight) return inflight

  inflight = fetch('/data/model_metadata.json', { cache: opts?.force ? 'reload' : 'default' })
    .then(async (res) => {
      if (!res.ok) return cache
      const data = (await res.json()) as ModelMetadata
      if (!data?.exported_at) return cache
      cache = data
      cacheAt = Date.now()
      return data
    })
    .catch(() => cache)
    .finally(() => {
      inflight = null
    })

  return inflight
}
