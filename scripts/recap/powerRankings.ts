/**
 * Global power rankings for recap matchup context (fraud gating, favorite/underdog).
 * Prefers CitoAPI official rankings when CITO_API_KEY is set.
 */

import { resolveTeamCanonicalName } from '../../src/lib/entities/slugs.ts'

const CITO_BASE = 'https://api.citoapi.com/api/v1'
const TIMEOUT_MS = 20_000

/** Canonical team name (lowercase) → global rank (1 = best). */
export type PowerRankMap = Map<string, number>

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

function unwrapData(payload: unknown): unknown {
  if (payload == null) return null
  if (Array.isArray(payload)) return payload
  const obj = asObject(payload)
  if (obj && 'data' in obj) return obj.data
  return payload
}

async function citoGet(apiKey: string, path: string): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${CITO_BASE}${path}`, {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const text = await res.text()
    if (!text.trim()) return null
    return JSON.parse(text) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function ingestRankingRows(map: PowerRankMap, data: unknown): void {
  const rows = unwrapData(data)
  if (!Array.isArray(rows)) return
  for (const row of rows) {
    const r = asObject(row)
    if (!r) continue
    const team = String(
      r.teamName ?? r.team ?? r.name ?? r.team_name ?? r.code ?? '',
    ).trim()
    const rankRaw = r.rank ?? r.position ?? r.standing ?? r.globalRank ?? r.global_rank
    const rank = typeof rankRaw === 'number' ? rankRaw : Number(rankRaw)
    if (!team || !Number.isFinite(rank) || rank <= 0) continue
    const key = resolveTeamCanonicalName(team).toLowerCase()
    const existing = map.get(key)
    if (existing == null || rank < existing) map.set(key, rank)
  }
}

/** Fetch global team power rankings from Cito (best-effort). */
export async function fetchGlobalPowerRanks(apiKey: string): Promise<PowerRankMap> {
  const map: PowerRankMap = new Map()
  if (!apiKey.trim()) return map

  for (const path of ['/lol/rankings/teams', '/lol/rankings']) {
    const data = await citoGet(apiKey, path)
    if (data != null) ingestRankingRows(map, data)
  }

  if (map.size) {
    console.log(`Loaded ${map.size} teams from Cito global power rankings`)
  } else {
    console.warn('Cito power rankings unavailable — fraud gating will use split WR fallback')
  }
  return map
}

export function powerRankFor(map: PowerRankMap | undefined, team: string): number | null {
  if (!map?.size) return null
  return map.get(resolveTeamCanonicalName(team).toLowerCase()) ?? null
}
