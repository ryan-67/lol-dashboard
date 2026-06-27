import type { Champion, Player } from '../hooks/useDashboardData'
import { normalizePosition, type RoleKey } from './playerRadar'

const ROLES: RoleKey[] = ['top', 'jungle', 'mid', 'adc', 'support']

export interface ChampionRoleContext {
  roleByChampion: Map<string, RoleKey>
  rolesByChampion: Map<string, RoleKey[]>
  picksByChampionRole: Map<string, Map<RoleKey, number>>
}

/** Dominant role per champion from actual player game logs in the current cohort. */
export function buildChampionRoleContext(players: Player[]): ChampionRoleContext {
  const picksByChampionRole = new Map<string, Map<RoleKey, number>>()

  for (const player of players) {
    const role = normalizePosition(player.position)
    if (!role) continue
    for (const game of player.gameLog ?? []) {
      const champion = game.champion?.trim()
      if (!champion) continue
      const roleMap = picksByChampionRole.get(champion) ?? new Map<RoleKey, number>()
      roleMap.set(role, (roleMap.get(role) ?? 0) + 1)
      picksByChampionRole.set(champion, roleMap)
    }
  }

  const roleByChampion = new Map<string, RoleKey>()
  const rolesByChampion = new Map<string, RoleKey[]>()

  for (const [champion, roleCounts] of picksByChampionRole) {
    const sorted = [...roleCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    if (sorted[0]) roleByChampion.set(champion, sorted[0][0])
    rolesByChampion.set(
      champion,
      sorted.map(([role]) => role),
    )
  }

  return { roleByChampion, rolesByChampion, picksByChampionRole }
}

export function enrichChampionsFromPlayers(champions: Champion[], players: Player[]): Champion[] {
  if (!players.length) return champions
  const ctx = buildChampionRoleContext(players)
  return champions.map((champion) => {
    const scopedRoles = ctx.rolesByChampion.get(champion.name)
    const scopedPrimary = ctx.roleByChampion.get(champion.name)
    if (!scopedRoles?.length && !scopedPrimary) return champion
    return {
      ...champion,
      positions: scopedRoles ?? champion.positions,
      primaryRole: scopedPrimary ?? champion.primaryRole,
    }
  })
}

export function picksInRole(
  ctx: ChampionRoleContext | undefined,
  championName: string,
  role: RoleKey,
): number {
  return ctx?.picksByChampionRole.get(championName)?.get(role) ?? 0
}

export function championPlayedRole(
  champion: Champion,
  role: RoleKey,
  ctx?: ChampionRoleContext,
): boolean {
  if (ctx) return picksInRole(ctx, champion.name, role) > 0
  if (champion.primaryRole?.toLowerCase() === role) return true
  return (champion.positions ?? []).some((p) => p.toLowerCase() === role)
}

export function dominantRoleForChampion(
  champion: Champion,
  ctx?: ChampionRoleContext,
): RoleKey {
  if (ctx?.roleByChampion.has(champion.name)) {
    return ctx.roleByChampion.get(champion.name)!
  }
  const primary = (champion.primaryRole ?? '').toLowerCase() as RoleKey
  if (ROLES.includes(primary)) return primary
  for (const role of ROLES) {
    if (championPlayedRole(champion, role, ctx)) return role
  }
  return 'mid'
}
