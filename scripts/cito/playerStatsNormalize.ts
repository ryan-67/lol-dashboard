/**
 * Normalize Cito match/game player-stats payloads into OE-like row shapes
 * used by recaps and the ML supplement CSV.
 */
import { resolveTeamCanonicalName } from '../../src/lib/entities/slugs.ts'
import { normalizePosition, type RoleKey } from '../../src/lib/playerRadar.ts'

export interface CitoNormalizedPlayerRow {
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
  payload: Record<string, unknown>
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const pickNum = (obj: Record<string, unknown>, keys: string[]): number | null => {
  for (const k of keys) {
    const n = num(obj[k])
    if (n != null) return n
  }
  return null
}

const pickStr = (obj: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

const share01 = (v: number | null): number => {
  if (v == null || !Number.isFinite(v)) return 0
  // Cito sometimes returns 0–1, sometimes 0–100
  return v > 1.5 ? v / 100 : v
}

const goldAtMinute = (
  timeline: Array<{ minute?: number; timestamp?: number; goldDiffBlue?: number; blueGold?: number; redGold?: number }> | null,
  minute: number,
  side: 'blue' | 'red' | null,
): number | null => {
  if (!timeline?.length || !side) return null
  let best: { minute: number; gd: number } | null = null
  for (const pt of timeline) {
    const m =
      typeof pt.minute === 'number'
        ? pt.minute
        : typeof pt.timestamp === 'number'
          ? Math.round(pt.timestamp / 60)
          : null
    if (m == null) continue
    let gd: number | null = null
    if (typeof pt.goldDiffBlue === 'number') gd = pt.goldDiffBlue
    else if (typeof pt.blueGold === 'number' && typeof pt.redGold === 'number') {
      gd = pt.blueGold - pt.redGold
    }
    if (gd == null) continue
    if (!best || Math.abs(m - minute) < Math.abs(best.minute - minute)) {
      best = { minute: m, gd }
    }
  }
  if (!best) return null
  return side === 'blue' ? best.gd : -best.gd
}

export function extractPlayersFromMatchPlayerStats(payload: unknown): Array<{
  gameId: string
  gameNumber: number | null
  players: Record<string, unknown>[]
  durationMinutes?: number | null
}> {
  const root = payload as Record<string, unknown>
  const games = Array.isArray(root?.data)
    ? (root.data as unknown[])
    : Array.isArray(payload)
      ? (payload as unknown[])
      : []

  const out: Array<{
    gameId: string
    gameNumber: number | null
    players: Record<string, unknown>[]
    durationMinutes?: number | null
  }> = []

  for (const g of games) {
    if (!g || typeof g !== 'object') continue
    const row = g as Record<string, unknown>
    const gameId = pickStr(row, ['gameId', 'game_id', 'id'])
    if (!gameId) continue
    const playersRaw = row.players
    const players = Array.isArray(playersRaw)
      ? (playersRaw as Record<string, unknown>[])
      : []
    out.push({
      gameId: gameId.startsWith('lol-game-') ? gameId : `lol-game-${gameId}`,
      gameNumber: num(row.gameNumber ?? row.game_number),
      players,
      durationMinutes: num(row.durationMinutes ?? row.duration ?? row.gameLength),
    })
  }
  return out
}

export function normalizeCitoPlayer(
  raw: Record<string, unknown>,
  ctx: {
    citoGameId: string
    citoMatchId: string
    gameNumber: number | null
    league: string
    gameDate: string
    winnerTeam?: string | null
    goldTimeline?: Array<{ minute?: number; goldDiffBlue?: number }> | null
    gameLengthMinutes?: number | null
  },
): CitoNormalizedPlayerRow | null {
  const playerName = pickStr(raw, ['playerName', 'playername', 'name', 'summonerName', 'ign'])
  if (!playerName) return null

  const teamNameRaw = pickStr(raw, ['teamName', 'teamname', 'team', 'team_name'])
  const teamSlug = pickStr(raw, ['teamSlug', 'team_slug', 'slug']) || null
  const teamName = resolveTeamCanonicalName(teamNameRaw || teamSlug || 'Unknown')

  const sideRaw = pickStr(raw, ['side', 'teamSide', 'color']).toLowerCase()
  const side: 'blue' | 'red' | null =
    sideRaw === 'blue' || sideRaw === 'red'
      ? sideRaw
      : null

  const role = normalizePosition(
    pickStr(raw, ['position', 'role', 'lane']) || null,
  )

  const champion = pickStr(raw, ['champion', 'championName', 'champion_name'])
  const kills = pickNum(raw, ['kills']) ?? 0
  const deaths = pickNum(raw, ['deaths']) ?? 0
  const assists = pickNum(raw, ['assists']) ?? 0
  const kda =
    pickNum(raw, ['kda']) ??
    (deaths === 0 ? kills + assists : (kills + assists) / deaths)

  const gd15 =
    pickNum(raw, ['gd15', 'goldDiffAt15', 'golddiffat15', 'gold_diff_at_15']) ?? 0
  const csd15 =
    pickNum(raw, ['csd15', 'csDiffAt15', 'csdiffat15', 'cs_diff_at_15']) ?? 0
  const xpd15 =
    pickNum(raw, ['xpd15', 'xpDiffAt15', 'xpdiffat15', 'xp_diff_at_15']) ?? 0

  const gd25FromTimeline = goldAtMinute(ctx.goldTimeline ?? null, 25, side)
  const gd25 =
    pickNum(raw, ['gd25', 'goldDiffAt25', 'golddiffat25']) ?? gd25FromTimeline

  const damageShare = share01(pickNum(raw, ['damageShare', 'damageshare', 'damage_share']))
  const goldShare = share01(pickNum(raw, ['goldShare', 'earnedgoldshare', 'gold_share']))

  let result: 0 | 1 = 0
  if (typeof raw.win === 'boolean') result = raw.win ? 1 : 0
  else if (typeof raw.result === 'number') result = raw.result >= 1 ? 1 : 0
  else if (ctx.winnerTeam && teamNameRaw) {
    result =
      resolveTeamCanonicalName(ctx.winnerTeam) === teamName ||
      resolveTeamCanonicalName(ctx.winnerTeam) === resolveTeamCanonicalName(teamNameRaw)
        ? 1
        : 0
  }

  const damage = pickNum(raw, ['damage', 'damagetochampions', 'totalDamage']) ?? 0
  const dpm =
    pickNum(raw, ['damagePerMin', 'dpm', 'damage_per_min']) ??
    (ctx.gameLengthMinutes && ctx.gameLengthMinutes > 0
      ? damage / ctx.gameLengthMinutes
      : 0)

  return {
    citoGameId: ctx.citoGameId,
    citoMatchId: ctx.citoMatchId,
    gameNumber: ctx.gameNumber,
    league: ctx.league,
    gameDate: ctx.gameDate,
    playerName,
    teamName,
    teamSlug,
    side,
    role,
    champion,
    result,
    kills,
    deaths,
    assists,
    kda,
    cs: pickNum(raw, ['cs', 'totalCs', 'total_cs']) ?? 0,
    gold: pickNum(raw, ['gold', 'totalgold', 'totalGold']) ?? 0,
    damage,
    dpm,
    damageShare,
    goldShare,
    visionScore: pickNum(raw, ['visionScore', 'visionscore', 'vision_score']) ?? 0,
    wardsPlaced: pickNum(raw, ['wardsPlaced', 'wardsplaced']) ?? 0,
    wardsDestroyed:
      pickNum(raw, ['wardsDestroyed', 'wardsKilled', 'wardskilled']) ?? 0,
    gd15,
    csd15,
    xpd15,
    gd25,
    gameLengthMinutes: ctx.gameLengthMinutes ?? null,
    payload: raw,
  }
}

/** Map Cito league labels → OE league codes used by the ML loader. */
export function toOeLeagueCode(league: string): string {
  const u = (league || '').trim().toUpperCase()
  if (u === 'WORLDS' || u === 'WLDS') return 'WLDs'
  if (u === 'FIRST STAND' || u === 'FST') return 'FST'
  if (u === 'MSI') return 'MSI'
  if (u === 'EWC') return 'EWC'
  if (u === 'LCK' || u === 'LPL' || u === 'LEC' || u === 'LCS') return u
  return u
}

/** OE-shaped player row for ML supplement CSV. */
export function toOePlayerCsvRow(row: CitoNormalizedPlayerRow): Record<string, unknown> {
  const teamKills = row.kills // filled later per-game; placeholder
  return {
    gameid: row.citoGameId,
    datacompleteness: 'partial',
    url: '',
    league: toOeLeagueCode(row.league),
    year: row.gameDate.slice(0, 4),
    split: 'Summer',
    playoffs: 0,
    date: `${row.gameDate} 12:00:00`,
    game: row.gameNumber ?? 1,
    patch: '',
    participantid: '',
    side: row.side ?? '',
    position: row.role === 'jungle' ? 'jng' : row.role === 'adc' ? 'bot' : row.role === 'support' ? 'sup' : row.role ?? '',
    playername: row.playerName,
    playerid: '',
    teamname: row.teamName,
    teamid: '',
    champion: row.champion,
    result: row.result,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    teamkills: teamKills,
    dpm: row.dpm,
    damageshare: row.damageShare,
    damagetochampions: row.damage,
    earnedgoldshare: row.goldShare,
    totalgold: row.gold,
    'earned gpm': row.gameLengthMinutes ? row.gold / row.gameLengthMinutes : null,
    visionscore: row.visionScore,
    wardskilled: row.wardsDestroyed,
    wardsplaced: row.wardsPlaced,
    golddiffat15: row.gd15,
    csdiffat15: row.csd15,
    xpdiffat15: row.xpd15,
    golddiffat25: row.gd25,
    'total cs': row.cs,
    gamelength: row.gameLengthMinutes != null ? Math.round(row.gameLengthMinutes * 60) : null,
    cito_source: 1,
  }
}
