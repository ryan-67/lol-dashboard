import type { Champion } from '../hooks/useDashboardData'

export type RoleKey = 'top' | 'jungle' | 'mid' | 'adc' | 'support'
export type RoleFilter = 'all' | RoleKey

export const ROLES: RoleKey[] = ['top', 'jungle', 'mid', 'adc', 'support']

export const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All Roles' },
  { value: 'top', label: 'Top' },
  { value: 'jungle', label: 'Jungle' },
  { value: 'mid', label: 'Mid' },
  { value: 'adc', label: 'ADC' },
  { value: 'support', label: 'Support' },
]

export const CHAMPION_ROLE_COLORS: Record<RoleKey, string> = {
  top: '#c45c5c',
  jungle: '#5c9e5a',
  mid: '#5c7a9e',
  adc: '#c5a059',
  support: '#8c6a9e',
}

export const RISING_COLOR = '#5c9e5a'
export const FALLING_COLOR = '#c45c5c'

const MIN_PICKS_TOP_PERFORMER = 5
const MIN_PICKS_OP = 5

export function isDisplayableChampion(c: Champion): boolean {
  return Boolean(c?.name) && Array.isArray(c.positions)
}

export function championHasRole(c: Champion, role: RoleKey): boolean {
  return (c.positions ?? []).some((p) => p.toLowerCase() === role)
}

export function roleForChampion(c: Champion): RoleKey {
  for (const role of ROLES) {
    if (championHasRole(c, role)) return role
  }
  const primary = (c.primaryRole ?? '').toLowerCase() as RoleKey
  return ROLES.includes(primary) ? primary : 'mid'
}

export function filterByRole(champions: Champion[], role: RoleFilter): Champion[] {
  if (role === 'all') return champions
  return champions.filter((c) => championHasRole(c, role))
}

export function getPickRate(c: Champion): number {
  return c.pickRate ?? 0
}

export function getBanRate(c: Champion): number {
  return c.banRate ?? 0
}

export function topByPresence(champions: Champion[], limit = 20): Champion[] {
  return [...champions].sort((a, b) => b.presence - a.presence).slice(0, limit)
}

export function cohortAverages(champions: Champion[]) {
  if (!champions.length) return { pickRate: 0, winrate: 0 }
  const pickRate = champions.reduce((sum, c) => sum + getPickRate(c), 0) / champions.length
  const winrate = champions.reduce((sum, c) => sum + c.winrate, 0) / champions.length
  return { pickRate, winrate }
}

export interface RoleChampionEntry {
  role: RoleKey
  champion: Champion | null
}

/** Exactly one slot per role (Top, Jungle, Mid, ADC, Support). */
export function bestByRole(champions: Champion[]): RoleChampionEntry[] {
  return ROLES.map((role) => {
    const pool = champions
      .filter((c) => championHasRole(c, role) && (c.games ?? c.picks) >= MIN_PICKS_TOP_PERFORMER)
      .sort((a, b) => b.winrate - a.winrate)
    return { role, champion: pool[0] ?? null }
  })
}

export function roleColor(role: string): string {
  const key = role.toLowerCase() as RoleKey
  return CHAMPION_ROLE_COLORS[key] ?? '#9e9a8e'
}

export function roleLabel(role: string): string {
  return role.toUpperCase()
}

export interface PresenceBarRow {
  name: string
  pickRate: number
  banRate: number
  presence: number
  picks: number
  bans: number
}

export function buildPresenceBarData(champions: Champion[]): PresenceBarRow[] {
  return topByPresence(champions, 20).map((c) => ({
    name: c.name,
    pickRate: getPickRate(c),
    banRate: getBanRate(c),
    presence: c.presence,
    picks: c.picks,
    bans: c.bans,
  }))
}

function collectWeeks(champions: Champion[]): string[] {
  const weeks = new Set<string>()
  for (const c of champions) {
    for (const stat of c.weeklyStats ?? []) {
      weeks.add(stat.weekStart)
    }
  }
  return [...weeks].sort()
}

function avgPresenceForWeeks(c: Champion, weeks: string[]): number {
  if (!weeks.length) return 0
  const stats = c.weeklyStats ?? []
  const values = weeks
    .map((w) => stats.find((s) => s.weekStart === w)?.presence)
    .filter((v): v is number => typeof v === 'number')
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export interface RisingFallingEntry {
  champion: Champion
  role: RoleKey
  priorPresence: number
  recentPresence: number
  delta: number
}

export interface RisingFallingResult {
  sufficient: boolean
  rising: RisingFallingEntry[]
  falling: RisingFallingEntry[]
}

export function computeRisingFalling(champions: Champion[]): RisingFallingResult {
  const weeks = collectWeeks(champions)

  if (weeks.length < 2) {
    return { sufficient: false, rising: [], falling: [] }
  }

  const recentWeeks = weeks.slice(-Math.min(2, weeks.length))
  const priorEnd = weeks.length - recentWeeks.length
  const priorWeeks = weeks.slice(Math.max(0, priorEnd - 2), priorEnd)

  if (!priorWeeks.length || !recentWeeks.length) {
    return { sufficient: false, rising: [], falling: [] }
  }

  const deltas: RisingFallingEntry[] = champions
    .map((champion) => {
      const priorPresence = avgPresenceForWeeks(champion, priorWeeks)
      const recentPresence = avgPresenceForWeeks(champion, recentWeeks)
      const delta = recentPresence - priorPresence
      return {
        champion,
        role: roleForChampion(champion),
        priorPresence,
        recentPresence,
        delta,
      }
    })
    .filter((entry) => entry.priorPresence > 0 || entry.recentPresence > 0)

  const rising = [...deltas]
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5)

  const falling = [...deltas]
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 5)

  return { sufficient: true, rising, falling }
}

function zScoreById(items: { id: string; value: number }[]): Map<string, number> {
  if (!items.length) return new Map()
  const values = items.map((i) => i.value)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  const std = Math.sqrt(variance)
  const map = new Map<string, number>()
  for (const item of items) {
    map.set(item.id, std > 0 ? (item.value - mean) / std : 0)
  }
  return map
}

export interface OpChampionEntry {
  champion: Champion
  role: RoleKey
  opScore: number
  presenceZ: number
  winrateZ: number
  banrateZ: number
  kdaZ: number
}

export interface OpScoresResult {
  top: OpChampionEntry | null
  runners: OpChampionEntry[]
  roleAverages: Record<
    RoleKey,
    { presence: number; winrate: number; banRate: number; kda: number }
  >
}

export function computeOpScores(champions: Champion[]): OpScoresResult {
  const eligible = champions.filter((c) => (c.games ?? c.picks) >= MIN_PICKS_OP)
  if (!eligible.length) {
    return { top: null, runners: [], roleAverages: {} as OpScoresResult['roleAverages'] }
  }

  const roleAverages = {} as OpScoresResult['roleAverages']
  const byRole = new Map<RoleKey, Champion[]>()
  for (const role of ROLES) byRole.set(role, [])

  for (const c of eligible) {
    const role = roleForChampion(c)
    byRole.get(role)?.push(c)
  }

  const presenceZ = new Map<string, number>()
  const winrateZ = new Map<string, number>()
  const banrateZ = new Map<string, number>()
  const kdaZ = new Map<string, number>()

  for (const role of ROLES) {
    const group = byRole.get(role) ?? []
    if (!group.length) continue

    roleAverages[role] = {
      presence: group.reduce((s, c) => s + c.presence, 0) / group.length,
      winrate: group.reduce((s, c) => s + c.winrate, 0) / group.length,
      banRate: group.reduce((s, c) => s + getBanRate(c), 0) / group.length,
      kda: group.reduce((s, c) => s + c.avgKda, 0) / group.length,
    }

    const pZ = zScoreById(group.map((c) => ({ id: c.name, value: c.presence })))
    const wZ = zScoreById(group.map((c) => ({ id: c.name, value: c.winrate })))
    const bZ = zScoreById(group.map((c) => ({ id: c.name, value: getBanRate(c) })))
    const kZ = zScoreById(group.map((c) => ({ id: c.name, value: c.avgKda })))

    for (const c of group) {
      presenceZ.set(c.name, pZ.get(c.name) ?? 0)
      winrateZ.set(c.name, wZ.get(c.name) ?? 0)
      banrateZ.set(c.name, bZ.get(c.name) ?? 0)
      kdaZ.set(c.name, kZ.get(c.name) ?? 0)
    }
  }

  const scored: OpChampionEntry[] = eligible.map((champion) => {
    const role = roleForChampion(champion)
    const pz = presenceZ.get(champion.name) ?? 0
    const wz = winrateZ.get(champion.name) ?? 0
    const bz = banrateZ.get(champion.name) ?? 0
    const kz = kdaZ.get(champion.name) ?? 0
    return {
      champion,
      role,
      opScore: round((pz + wz + bz + kz) / 4, 2),
      presenceZ: pz,
      winrateZ: wz,
      banrateZ: bz,
      kdaZ: kz,
    }
  })

  scored.sort((a, b) => b.opScore - a.opScore)

  return {
    top: scored[0] ?? null,
    runners: scored.slice(1, 5),
    roleAverages,
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
