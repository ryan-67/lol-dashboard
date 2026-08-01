/**
 * Load cached Cito player box scores for Hub recaps / Form lag-fill.
 * Written by scripts/cito/sync-player-stats.ts → public/data/cito_player_stats_cache.json
 */
import type { PlayerGameLog } from '../hooks/useDashboardData'
import { resolveTeamCanonicalName } from './entities/slugs'
import { normalizePosition, type RoleKey } from './playerRadar'

export interface CitoPlayerStatCacheRow {
  citoGameId: string
  citoMatchId: string
  gameNumber: number | null
  league: string
  gameDate: string
  playerName: string
  teamName: string
  teamSlug: string | null
  side: 'blue' | 'red' | null
  role: RoleKey | null
  champion: string
  result: 0 | 1
  kills: number
  deaths: number
  assists: number
  kda: number
  cs: number
  gold: number
  damage: number
  dpm: number
  damageShare: number
  goldShare: number
  visionScore: number
  wardsPlaced: number
  wardsDestroyed: number
  gd15: number
  csd15: number
  xpd15: number
  gd25: number | null
  gameLengthMinutes: number | null
}

export interface CitoPlayerStatsBundle {
  generatedAt: string
  rows: CitoPlayerStatCacheRow[]
}

let cache: CitoPlayerStatsBundle | null = null
let inflight: Promise<CitoPlayerStatsBundle> | null = null

export async function fetchCitoPlayerStatsBundle(
  force = false,
): Promise<CitoPlayerStatsBundle> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = fetch(
    `${import.meta.env.BASE_URL}data/cito_player_stats_cache.json?t=${Date.now()}`,
    { cache: 'no-store' },
  )
    .then(async (res) => {
      if (!res.ok) return { generatedAt: '', rows: [] }
      const json = (await res.json()) as Partial<CitoPlayerStatsBundle>
      const bundle: CitoPlayerStatsBundle = {
        generatedAt: typeof json.generatedAt === 'string' ? json.generatedAt : '',
        rows: Array.isArray(json.rows) ? (json.rows as CitoPlayerStatCacheRow[]) : [],
      }
      cache = bundle
      return bundle
    })
    .catch(() => ({ generatedAt: '', rows: [] }))
    .finally(() => {
      inflight = null
    })

  return inflight
}

export function rowsForMatch(
  bundle: CitoPlayerStatsBundle | null,
  matchId: string,
): CitoPlayerStatCacheRow[] {
  if (!bundle?.rows?.length || !matchId) return []
  const normalized = matchId.startsWith('lol-match-') ? matchId : `lol-match-${matchId}`
  return bundle.rows.filter(
    (r) => r.citoMatchId === matchId || r.citoMatchId === normalized,
  )
}

export function rowsForTeamsDate(
  bundle: CitoPlayerStatsBundle | null,
  teamA: string,
  teamB: string,
  date: string,
): CitoPlayerStatCacheRow[] {
  if (!bundle?.rows?.length) return []
  const a = resolveTeamCanonicalName(teamA)
  const b = resolveTeamCanonicalName(teamB)
  const day = date.slice(0, 10)
  const matchIds = new Set<string>()
  for (const r of bundle.rows) {
    if (r.gameDate.slice(0, 10) !== day) continue
    const t = resolveTeamCanonicalName(r.teamName)
    if (t === a || t === b) matchIds.add(r.citoMatchId)
  }
  if (!matchIds.size) return []
  return bundle.rows.filter((r) => matchIds.has(r.citoMatchId) && r.gameDate.slice(0, 10) === day)
}

export function citoRowToGameLog(row: CitoPlayerStatCacheRow): PlayerGameLog {
  const length = row.gameLengthMinutes ?? 30
  const kaPerMin = length > 0 ? (row.kills + row.assists) / length : 0
  const dmgGoldRatio =
    row.goldShare > 0 ? row.damageShare / row.goldShare : row.damageShare
  const dmgPerGold = row.gold > 0 ? row.damage / row.gold : 0
  return {
    date: row.gameDate,
    result: row.result,
    champion: row.champion || 'Unknown',
    gameId: row.citoGameId,
    kda: row.kda,
    kp: 0, // filled when team kills known
    dmgShare: row.damageShare * (row.damageShare <= 1.5 ? 100 : 1),
    gd15: row.gd15,
    csd15: row.csd15,
    xpd15: row.xpd15,
    dpm: row.dpm,
    visionScore: row.visionScore,
    goldShare: row.goldShare * (row.goldShare <= 1.5 ? 100 : 1),
    kaPerMin,
    dmgGoldRatio,
    dmgPerGold,
    gpm: length > 0 ? row.gold / length : undefined,
    side: row.side ?? undefined,
    league: row.league,
    oeYear: row.gameDate.slice(0, 4),
    gameLength: length,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    totalCs: row.cs,
  }
}

/** Build synthetic players[] + gameLog overlay for a series from Cito box scores. */
export function buildSyntheticPlayersFromCitoRows(
  rows: CitoPlayerStatCacheRow[],
): Array<{
  name: string
  team: string
  league: string
  gameLog: PlayerGameLog[]
}> {
  if (!rows.length) return []

  // Team kills per game for KP
  const teamKills = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.citoGameId}|${resolveTeamCanonicalName(r.teamName)}`
    teamKills.set(key, (teamKills.get(key) ?? 0) + r.kills)
  }

  const byPlayer = new Map<
    string,
    { name: string; team: string; league: string; gameLog: PlayerGameLog[] }
  >()

  for (const r of rows) {
    const team = resolveTeamCanonicalName(r.teamName)
    const key = `${r.playerName.toLowerCase()}|${team}`
    const log = citoRowToGameLog(r)
    const tk = teamKills.get(`${r.citoGameId}|${team}`) ?? 0
    if (tk > 0) log.kp = ((r.kills + r.assists) / tk) * 100

    const cur = byPlayer.get(key)
    if (cur) cur.gameLog.push(log)
    else {
      byPlayer.set(key, {
        name: r.playerName,
        team,
        league: r.league,
        gameLog: [log],
      })
    }
  }
  return [...byPlayer.values()]
}

export function hasSufficientCitoBoxScores(rows: CitoPlayerStatCacheRow[]): boolean {
  if (rows.length < 10) return false // at least one full game of 10 players
  const withGd = rows.filter((r) => Number.isFinite(r.gd15)).length
  return withGd >= Math.min(8, rows.length * 0.7)
}

export { normalizePosition }
