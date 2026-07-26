import { formatModelUpdatedDate } from './format'

export interface ScorecardMetrics {
  log_loss: number
  brier: number
  accuracy: number
}

export interface ScorecardSlice {
  key: string
  n: number
  model: ScorecardMetrics
  baseline: ScorecardMetrics
  beatsBaseline: boolean
}

export interface AccuracyScorecard {
  generatedAt: string
  algo: string
  holdoutRows: number
  holdoutSeries: number
  dateRange: [string, string]
  aggregate: {
    model: ScorecardMetrics
    baseline: ScorecardMetrics
    beatsBaseline: boolean
  }
  byLeague: ScorecardSlice[]
}

const FALLBACK: AccuracyScorecard = {
  generatedAt: '2026-07-17T07:02:08.535837+00:00',
  algo: 'xgboost',
  holdoutRows: 718,
  holdoutSeries: 359,
  dateRange: ['2026-02-09', '2026-07-11'],
  aggregate: {
    model: { log_loss: 0.5648, brier: 0.1907, accuracy: 0.7145 },
    baseline: { log_loss: 0.7031, brier: 0.244, accuracy: 0.6209 },
    beatsBaseline: true,
  },
  byLeague: [
    {
      key: 'LCK',
      n: 210,
      model: { log_loss: 0.4931, brier: 0.1606, accuracy: 0.7856 },
      baseline: { log_loss: 0.6609, brier: 0.2223, accuracy: 0.6545 },
      beatsBaseline: true,
    },
    {
      key: 'LEC',
      n: 134,
      model: { log_loss: 0.5266, brier: 0.1767, accuracy: 0.7263 },
      baseline: { log_loss: 0.6959, brier: 0.2466, accuracy: 0.5778 },
      beatsBaseline: true,
    },
    {
      key: 'LCS',
      n: 94,
      model: { log_loss: 0.5296, brier: 0.1796, accuracy: 0.7074 },
      baseline: { log_loss: 0.6791, brier: 0.2419, accuracy: 0.6915 },
      beatsBaseline: true,
    },
    {
      key: 'LPL',
      n: 216,
      model: { log_loss: 0.6702, brier: 0.237, accuracy: 0.6214 },
      baseline: { log_loss: 0.7431, brier: 0.2599, accuracy: 0.5873 },
      beatsBaseline: true,
    },
  ],
}

let cache: AccuracyScorecard | null = null
let cacheAt = 0
let inflight: Promise<AccuracyScorecard> | null = null

/** Re-fetch after model retrain exports land on CDN. */
const ARTIFACT_TTL_MS = 5 * 60_000

export function formatPct(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}%`
}

export function formatLL(value: number): string {
  return value.toFixed(3)
}

/** @deprecated Prefer formatModelUpdatedDate — kept as alias for landing imports. */
export function formatScorecardUpdated(
  iso: string | undefined | null,
  options?: { timeZone?: string },
): string {
  return formatModelUpdatedDate(iso, options)
}

export function invalidateAccuracyScorecardCache(): void {
  cache = null
  cacheAt = 0
}

export async function fetchAccuracyScorecard(opts?: {
  force?: boolean
}): Promise<AccuracyScorecard> {
  const stale = !cache || Date.now() - cacheAt > ARTIFACT_TTL_MS
  if (cache && !stale && !opts?.force) return cache
  if (inflight) return inflight

  inflight = fetch(`/data/accuracy_scorecard.json?t=${Date.now()}`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return cache ?? FALLBACK
      const data = (await res.json()) as AccuracyScorecard
      cache = data
      cacheAt = Date.now()
      return data
    })
    .catch(() => cache ?? FALLBACK)
    .finally(() => {
      inflight = null
    })

  return inflight
}
