import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import { teamMatchesCanonical } from './entities'
import { playerSnapshotFromGame } from './playerRadar'

/** Align analysis radars with model-ish recency: ~2–3 series weeks of games. */
export const RECENT_FORM_MAX_GAMES = 16
export const RECENT_FORM_MAX_DAYS = 75
/** Soft stale threshold for “low recent activity” callouts. */
export const RECENT_FORM_STALE_DAYS = 45

export interface RecentFormSlice {
  player: Player
  gamesUsed: number
  lastGameDate: string | null
  daysSinceLastGame: number | null
  /** True when last game is older than {@link RECENT_FORM_STALE_DAYS}. */
  isStale: boolean
  /** True when fewer than 6 games fall in the recent window. */
  isThinSample: boolean
}

function daysSince(isoDate: string): number | null {
  const parsed = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.floor((Date.now() - parsed.getTime()) / 86400000)
}

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function pickRecentGames(
  log: PlayerGameLog[],
  maxGames: number,
  maxDays: number,
): PlayerGameLog[] {
  const cutoffMs = Date.now() - maxDays * 86400000
  const sorted = [...log].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const inWindow = sorted.filter((g) => {
    if (!g.date) return false
    const t = new Date(`${g.date}T12:00:00`).getTime()
    return !Number.isNaN(t) && t >= cutoffMs
  })
  const pool = inWindow.length > 0 ? inWindow : sorted
  return pool.slice(0, maxGames)
}

/**
 * Rebuild a Player-shaped aggregate from recent gameLog rows so radars track
 * recent form instead of the full filter-window season averages.
 */
export function playerFromRecentForm(
  player: Player,
  opts?: { maxGames?: number; maxDays?: number },
): RecentFormSlice {
  const maxGames = opts?.maxGames ?? RECENT_FORM_MAX_GAMES
  const maxDays = opts?.maxDays ?? RECENT_FORM_MAX_DAYS
  const log = player.gameLog ?? []
  const recent = pickRecentGames(log, maxGames, maxDays)
  const lastGameDate = recent[0]?.date ?? log.reduce<string | null>((max, g) => {
    if (!g.date) return max
    return !max || g.date > max ? g.date : max
  }, null)
  const daysSinceLastGame = lastGameDate ? daysSince(lastGameDate) : null

  if (!recent.length) {
    return {
      player,
      gamesUsed: 0,
      lastGameDate,
      daysSinceLastGame,
      isStale: daysSinceLastGame == null || daysSinceLastGame >= RECENT_FORM_STALE_DAYS,
      isThinSample: true,
    }
  }

  const snaps = recent.map(playerSnapshotFromGame)
  const metricKeys = [
    'kda',
    'kp',
    'dmgShare',
    'gd15',
    'csd15',
    'xpd15',
    'dpm',
    'goldShare',
    'firstBloodRate',
    'objControl',
    'visionScore',
    'turretPlates',
    'dmgGoldRatio',
    'dmgPerGold',
    'kaPerMin',
    'campsStolen',
    'wardsDestroyed',
  ] as const

  const aggregated: Player = {
    ...player,
    games: recent.length,
    gameLog: recent,
    kda: avg(snaps.map((s) => s.kda).filter((n) => typeof n === 'number')),
    kp: avg(snaps.map((s) => s.kp).filter((n): n is number => typeof n === 'number')),
    dmgShare: avg(snaps.map((s) => s.dmgShare).filter((n): n is number => typeof n === 'number')),
    gd15: avg(snaps.map((s) => s.gd15).filter((n): n is number => typeof n === 'number')),
    csd15: avg(snaps.map((s) => s.csd15).filter((n): n is number => typeof n === 'number')),
    xpd15: avg(snaps.map((s) => s.xpd15).filter((n): n is number => typeof n === 'number')),
    dpm: avg(snaps.map((s) => s.dpm).filter((n): n is number => typeof n === 'number')),
    goldShare: avg(snaps.map((s) => s.goldShare).filter((n): n is number => typeof n === 'number')),
    firstBloodRate: avg(
      snaps.map((s) => s.firstBloodRate).filter((n): n is number => typeof n === 'number'),
    ),
    objControl: avg(
      snaps.map((s) => s.objControl).filter((n): n is number => typeof n === 'number'),
    ),
    visionScore: avg(
      snaps.map((s) => s.visionScore).filter((n): n is number => typeof n === 'number'),
    ),
  }

  for (const key of metricKeys) {
    const vals = snaps
      .map((s) => s[key as keyof Player])
      .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n))
    if (vals.length) {
      ;(aggregated as unknown as Record<string, unknown>)[key] = avg(vals)
    }
  }

  return {
    player: aggregated,
    gamesUsed: recent.length,
    lastGameDate,
    daysSinceLastGame,
    isStale: daysSinceLastGame == null || daysSinceLastGame >= RECENT_FORM_STALE_DAYS,
    isThinSample: recent.length < 6,
  }
}

export function teamLastGameDate(players: Player[], teamName: string): string | null {
  let max: string | null = null
  for (const p of players) {
    if (!teamMatchesCanonical(p.team, teamName)) continue
    for (const g of p.gameLog ?? []) {
      if (g.date && (!max || g.date > max)) max = g.date
    }
  }
  return max
}
