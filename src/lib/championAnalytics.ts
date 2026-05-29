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

const MIN_PICKS_TOP_PERFORMER = 5

export function isDisplayableChampion(c: Champion): boolean {
  return Boolean(c?.name) && Array.isArray(c.positions)
}

export function championHasRole(c: Champion, role: RoleKey): boolean {
  return (c.positions ?? []).some((p) => p.toLowerCase() === role)
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
  const pickRate =
    champions.reduce((sum, c) => sum + getPickRate(c), 0) / champions.length
  const winrate = champions.reduce((sum, c) => sum + c.winrate, 0) / champions.length
  return { pickRate, winrate }
}

export function roleDistribution(champions: Champion[]): { role: RoleKey; count: number }[] {
  const counts = new Map<RoleKey, number>()
  for (const role of ROLES) counts.set(role, 0)

  for (const c of champions) {
    const role = (c.primaryRole || c.positions?.[0] || '') as RoleKey
    if (ROLES.includes(role)) {
      counts.set(role, (counts.get(role) ?? 0) + 1)
    }
  }

  return ROLES.map((role) => ({ role, count: counts.get(role) ?? 0 })).filter((r) => r.count > 0)
}

export function bestChampionPerRole(champions: Champion[]): Champion[] {
  return ROLES.map((role) => {
    const inRole = champions
      .filter((c) => championHasRole(c, role) && (c.games ?? c.picks) >= MIN_PICKS_TOP_PERFORMER)
      .sort((a, b) => b.winrate - a.winrate)
    return inRole[0] ?? null
  }).filter((c): c is Champion => Boolean(c))
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
