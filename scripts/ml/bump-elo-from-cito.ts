#!/usr/bin/env node
/**
 * Apply completed Cito series onto region_strength.json without waiting for OE retrain.
 *
 * Series-grain Elo update mirrors scripts/ml/region_elo.py (_update_pair, K tiers,
 * margin multiplier). Team Power Score = 0.8*teamElo + 0.2*regionMean.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional — falls back to schedule cache)
 * Optional: CITO_ELO_LOOKBACK_DAYS (default 21), CITO_ELO_DRY_RUN=1
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { resolveTeamCanonicalName } from '../../src/lib/entities/slugs.ts'
import { isValidSeriesScore } from '../../src/lib/seriesGrouping.ts'

const ELO_SCALE = 400
const BASE_RATING = 1500
const TEAM_WEIGHT = 0.8
const LEAGUE_WEIGHT = 0.2

const K_BY_TIER: Record<string, number> = {
  domestic_regular: 28,
  domestic_playoffs: 36,
  international_group: 32,
  international_playoffs: 48,
}

const INTL = new Set(['MSI', 'WORLDS', 'WLDS', 'FST', 'FIRST STAND', 'EWC'])

type StrengthTeam = {
  homeRegion: string
  rating: number
  teamEloOnly?: number
  regionRating?: number
  ratingDeviation?: number
  daysSinceLastSeries?: number | null
}

type StrengthBundle = {
  generatedAt: string
  /** ISO date (YYYY-MM-DD) of last series included in OE/Riot walk-forward. */
  eloAsOf?: string
  eloScale: number
  baseRating: number
  teamWeight: number
  leagueWeight: number
  methodology: string
  regions: Record<string, number>
  teams: Record<string, StrengthTeam>
  statBaselines?: unknown
  citoEloBump?: {
    appliedAt: string
    seriesApplied: number
    lookbackDays: number
    matchIds: string[]
  } | null
}

type CitoRow = {
  match_id: string
  league: string
  tournament_name: string | null
  block_name: string | null
  team_a: string
  team_b: string
  scheduled_at: string | null
  status: string
  score_a: number | null
  score_b: number | null
  best_of: number | null
}

const ROOT = resolve(process.cwd())
const PUBLIC_PATH = resolve(ROOT, 'public/data/region_strength.json')
const ARTIFACT_PATH = resolve(ROOT, 'data/ml/artifacts/region_strength.json')
const DEPLOY_PATH = resolve(ROOT, 'supabase/functions/agent-chat/ml/region_strength.json')
const STATE_PATH = resolve(ROOT, 'data/ml/artifacts/cito_elo_bump_state.json')

const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / ELO_SCALE))

const updatePair = (eloA: number, eloB: number, aWon: boolean, k: number): [number, number] => {
  const expA = expected(eloA, eloB)
  const delta = k * ((aWon ? 1 : 0) - expA)
  return [eloA + delta, eloB - delta]
}

const marginMultiplier = (winsFor: number, winsAgainst: number) => {
  const margin = Math.abs(winsFor - winsAgainst)
  return Math.min(1.25, 1.0 + 0.08 * Math.max(0, margin - 1))
}

const tierFor = (league: string, blockName: string | null, tournamentName: string | null) => {
  const u = (league || '').toUpperCase()
  const intl = INTL.has(u)
  const blob = `${blockName ?? ''} ${tournamentName ?? ''}`.toLowerCase()
  const playoffs =
    /\b(play.?off|knockout|final|semifinal|quarter|grand final|bracket)\b/.test(blob)
  if (intl) return playoffs ? 'international_playoffs' : 'international_group'
  return playoffs ? 'domestic_playoffs' : 'domestic_regular'
}

const resolveBundleTeamKey = (
  teams: Record<string, StrengthTeam>,
  rawName: string,
): string | null => {
  const canon = resolveTeamCanonicalName(rawName)
  if (teams[canon]) return canon
  if (teams[rawName]) return rawName
  const lower = canon.toLowerCase()
  for (const key of Object.keys(teams)) {
    if (key.toLowerCase() === lower) return key
  }
  // Loose contains match for sponsor suffixes (Cloud9 Kia → Cloud9)
  for (const key of Object.keys(teams)) {
    const k = key.toLowerCase()
    if (k.includes(lower) || lower.includes(k)) {
      if (Math.abs(k.length - lower.length) <= 12) return key
    }
  }
  return null
}

const loadStrength = (): StrengthBundle => {
  const path = existsSync(PUBLIC_PATH)
    ? PUBLIC_PATH
    : existsSync(ARTIFACT_PATH)
      ? ARTIFACT_PATH
      : DEPLOY_PATH
  if (!existsSync(path)) {
    throw new Error(`region_strength.json not found (tried ${PUBLIC_PATH})`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as StrengthBundle
}

const loadAppliedIds = (): Set<string> => {
  try {
    const body = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as { matchIds?: string[] }
    return new Set(body.matchIds ?? [])
  } catch {
    return new Set()
  }
}

const fetchCompletedFromSupabase = async (sinceIso: string): Promise<CitoRow[]> => {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return []
  const client = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await client
    .from('cito_schedules')
    .select(
      'match_id, league, tournament_name, block_name, team_a, team_b, scheduled_at, status, score_a, score_b, best_of',
    )
    .eq('status', 'completed')
    .gte('scheduled_at', sinceIso)
    .order('scheduled_at', { ascending: true })
    .limit(500)
  if (error) {
    console.warn('cito_schedules fetch failed:', error.message)
    return []
  }
  return (data ?? []) as CitoRow[]
}

const regionMeans = (bundle: StrengthBundle): Record<string, number> => {
  const members: Record<string, number[]> = {}
  for (const row of Object.values(bundle.teams)) {
    const elo = row.teamEloOnly ?? row.rating
    members[row.homeRegion] ??= []
    members[row.homeRegion]!.push(elo)
  }
  const out: Record<string, number> = {}
  for (const [region, elos] of Object.entries(members)) {
    out[region] = elos.reduce((a, b) => a + b, 0) / elos.length
  }
  return out
}

const recomputePower = (bundle: StrengthBundle) => {
  const means = regionMeans(bundle)
  bundle.regions = Object.fromEntries(
    Object.entries(means).map(([r, v]) => [r, Math.round(v * 10) / 10]),
  )
  for (const row of Object.values(bundle.teams)) {
    const teamElo = row.teamEloOnly ?? row.rating
    const regionElo = means[row.homeRegion] ?? BASE_RATING
    row.teamEloOnly = Math.round(teamElo * 10) / 10
    row.regionRating = Math.round(regionElo * 10) / 10
    row.rating = Math.round((TEAM_WEIGHT * teamElo + LEAGUE_WEIGHT * regionElo) * 10) / 10
  }
}

async function main(): Promise<void> {
  const lookback = Number(process.env.CITO_ELO_LOOKBACK_DAYS ?? '21')
  const dryRun = process.env.CITO_ELO_DRY_RUN === '1'
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - lookback)
  const sinceIso = since.toISOString()

  const bundle = loadStrength()
  const applied = loadAppliedIds()
  const rows = await fetchCompletedFromSupabase(sinceIso)
  console.log(`Loaded ${rows.length} completed Cito series since ${sinceIso.slice(0, 10)}`)

  // Walk-forward already includes Riot/OE series through eloAsOf — only lag-fill newer ones.
  const eloAsOf = bundle.eloAsOf ? Date.parse(`${bundle.eloAsOf}T23:59:59.999Z`) : NaN

  const pending = rows.filter((r) => {
    if (applied.has(r.match_id)) return false
    if (typeof r.score_a !== 'number' || typeof r.score_b !== 'number') return false
    if (!isValidSeriesScore(r.score_a, r.score_b)) return false
    if (!r.team_a || !r.team_b || r.team_a === 'TBD' || r.team_b === 'TBD') return false
    if (Number.isFinite(eloAsOf) && r.scheduled_at) {
      const scheduled = Date.parse(r.scheduled_at)
      if (Number.isFinite(scheduled) && scheduled <= eloAsOf) return false
    }
    return true
  })

  let n = 0
  const matchIds: string[] = []
  for (const row of pending) {
    const keyA = resolveBundleTeamKey(bundle.teams, row.team_a)
    const keyB = resolveBundleTeamKey(bundle.teams, row.team_b)
    if (!keyA || !keyB) {
      console.warn(`  skip ${row.match_id}: unresolved ${row.team_a} vs ${row.team_b}`)
      continue
    }
    const a = bundle.teams[keyA]!
    const b = bundle.teams[keyB]!
    const winsA = row.score_a!
    const winsB = row.score_b!
    const aWon = winsA > winsB
    const tier = tierFor(row.league, row.block_name, row.tournament_name)
    const k = K_BY_TIER[tier]! * marginMultiplier(winsA, winsB)
    const eloA = a.teamEloOnly ?? a.rating
    const eloB = b.teamEloOnly ?? b.rating
    const [nextA, nextB] = updatePair(eloA, eloB, aWon, k)
    a.teamEloOnly = nextA
    b.teamEloOnly = nextB
    a.daysSinceLastSeries = 0
    b.daysSinceLastSeries = 0
    a.ratingDeviation = 30
    b.ratingDeviation = 30
    n += 1
    matchIds.push(row.match_id)
    console.log(
      `  ${row.league} ${keyA} ${winsA}-${winsB} ${keyB} (${tier}, k=${k.toFixed(1)})`,
    )
  }

  if (!n) {
    console.log('No new Cito series to apply — region_strength unchanged.')
    return
  }

  recomputePower(bundle)
  bundle.generatedAt = new Date().toISOString()
  bundle.methodology =
    (bundle.methodology ?? '') +
    ' Incremental Cito series bumps applied when OE retrain lags (bump-elo-from-cito).'
  bundle.citoEloBump = {
    appliedAt: bundle.generatedAt,
    seriesApplied: n,
    lookbackDays: lookback,
    matchIds,
  }

  if (dryRun) {
    console.log(`[dry-run] would apply ${n} series`)
    return
  }

  const json = JSON.stringify(bundle)
  for (const path of [PUBLIC_PATH, ARTIFACT_PATH, DEPLOY_PATH]) {
    mkdirSync(resolve(path, '..'), { recursive: true })
    writeFileSync(path, json, 'utf8')
    console.log(`Wrote ${path}`)
  }

  const nextApplied = [...applied, ...matchIds]
  mkdirSync(resolve(STATE_PATH, '..'), { recursive: true })
  writeFileSync(
    STATE_PATH,
    JSON.stringify({ matchIds: nextApplied.slice(-2000), updatedAt: bundle.generatedAt }, null, 2),
    'utf8',
  )
  console.log(`Applied ${n} Cito series to Elo / power rankings.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
