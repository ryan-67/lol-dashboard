import type { Champion, DashboardData, Player, Team } from '../../hooks/useDashboardData'
import { aggregateAdvancedFromGameLog } from '../advancedStats'
import { mergeChampionPoolEntries } from '../playerAnalytics'
import { mergeSlices, type OEStore } from '../mergeSlices'
import { pickNewestSplitWithData, splitsNewestFirst } from '../splitSelection'
import { playerSlug, resolveTeamCanonicalName, teamMatchesCanonical, teamSlugFromName } from './slugs'

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function avgWeighted(values: Array<{ value: number; weight: number }>): number {
  const total = values.reduce((s, v) => s + v.weight, 0)
  if (!total) return 0
  return values.reduce((s, v) => s + v.value * v.weight, 0) / total
}

export function mergePlayersByName(players: Player[], name: string): Player | null {
  const rows = players.filter((p) => p.name === name)
  if (!rows.length) return null

  const merged = {
    name,
    team: '',
    league: '',
    position: '',
    games: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    kp: [] as Array<{ value: number; weight: number }>,
    dmgShare: [] as Array<{ value: number; weight: number }>,
    gd15: [] as Array<{ value: number; weight: number }>,
    csd15: [] as Array<{ value: number; weight: number }>,
    xpd15: [] as Array<{ value: number; weight: number }>,
    dpm: [] as Array<{ value: number; weight: number }>,
    visionScore: [] as Array<{ value: number; weight: number }>,
    goldShare: [] as Array<{ value: number; weight: number }>,
    firstBloodRate: [] as Array<{ value: number; weight: number }>,
    objControl: [] as Array<{ value: number; weight: number }>,
    gameLog: [] as Player['gameLog'],
    championPool: [] as Player['championPool'],
  }

  for (const p of rows) {
    const games = p.games ?? 0
    merged.games += games
    merged.kills += p.kills ?? 0
    merged.deaths += p.deaths ?? 0
    merged.assists += p.assists ?? 0
    if (p.gameLog?.length) merged.gameLog!.push(...p.gameLog)
    if (p.championPool?.length) merged.championPool!.push(...p.championPool)
    if (games > 0 && typeof p.kp === 'number') merged.kp.push({ value: p.kp, weight: games })
    if (games > 0 && typeof p.dmgShare === 'number') merged.dmgShare.push({ value: p.dmgShare, weight: games })
    if (games > 0 && typeof p.gd15 === 'number') merged.gd15.push({ value: p.gd15, weight: games })
    if (games > 0 && typeof p.csd15 === 'number') merged.csd15.push({ value: p.csd15, weight: games })
    if (games > 0 && typeof p.xpd15 === 'number') merged.xpd15.push({ value: p.xpd15, weight: games })
    if (games > 0 && typeof p.dpm === 'number') merged.dpm.push({ value: p.dpm, weight: games })
    if (games > 0 && typeof p.visionScore === 'number') {
      merged.visionScore.push({ value: p.visionScore, weight: games })
    }
    if (games > 0 && typeof p.goldShare === 'number') {
      merged.goldShare.push({ value: p.goldShare, weight: games })
    }
    if (games > 0 && typeof p.firstBloodRate === 'number') {
      merged.firstBloodRate.push({ value: p.firstBloodRate, weight: games })
    }
    if (games > 0 && typeof p.objControl === 'number') {
      merged.objControl.push({ value: p.objControl, weight: games })
    }
    if (!merged.position && p.position) merged.position = p.position
    if (!merged.league && p.league) merged.league = p.league
    if (!merged.team && p.team) merged.team = p.team
  }

  const sortedLog = [...(merged.gameLog ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sortedLog[sortedLog.length - 1]
  const latestRow = rows.find((p) => p.gameLog?.some((g) => g.date === latest?.date)) ?? rows[rows.length - 1]
  const advanced = aggregateAdvancedFromGameLog(sortedLog)

  const deaths = Math.max(merged.deaths, 1)
  const kdaFromKda =
    merged.kills > 0 || merged.assists > 0
      ? round((merged.kills + merged.assists) / deaths, 2)
      : (() => {
          const weighted = rows
            .filter((p) => (p.games ?? 0) > 0 && typeof p.kda === 'number')
            .map((p) => ({ value: p.kda, weight: p.games }))
          if (weighted.length) return round(avgWeighted(weighted), 2)
          const log = sortedLog.filter((g) => typeof g.kda === 'number')
          if (log.length) return round(log.reduce((s, g) => s + g.kda, 0) / log.length, 2)
          return 0
        })()
  return {
    name,
    team: latestRow?.team ?? merged.team,
    league: latestRow?.league ?? merged.league,
    position: latestRow?.position ?? merged.position,
    games: merged.games,
    kills: merged.kills,
    deaths: merged.deaths,
    assists: merged.assists,
    kda: kdaFromKda,
    kp: round(avgWeighted(merged.kp), 1),
    dmgShare: round(avgWeighted(merged.dmgShare), 1),
    gd15: round(avgWeighted(merged.gd15), 1),
    csd15: round(avgWeighted(merged.csd15), 1),
    xpd15: round(avgWeighted(merged.xpd15), 1),
    dpm: round(avgWeighted(merged.dpm), 1),
    visionScore: round(avgWeighted(merged.visionScore), 1),
    goldShare: round(avgWeighted(merged.goldShare), 1),
    firstBloodRate: round(avgWeighted(merged.firstBloodRate), 1),
    objControl: round(avgWeighted(merged.objControl), 2),
    turretPlates: advanced.turretPlates,
    campsStolen: advanced.campsStolen,
    wardsDestroyed: advanced.wardsDestroyed,
    kaPerMin: advanced.kaPerMin,
    dmgGoldRatio: advanced.dmgGoldRatio,
    dmgPerGold: advanced.dmgPerGold,
    gameLog: sortedLog,
    championPool: mergeChampionPoolEntries(merged.championPool ?? []),
  }
}

export function mergeTeamsByCanonical(teams: Team[], slugOrName: string): Team | null {
  const matches = teams.filter(
    (t) => teamMatchesCanonical(t.name, slugOrName) || teamSlugFromName(t.name) === slugOrName,
  )
  if (!matches.length) return null
  if (matches.length === 1) return matches[0]!

  const merged = { ...matches[0]! }
  for (let i = 1; i < matches.length; i++) {
    const t = matches[i]!
    merged.games += t.games
    merged.wins += t.wins
    merged.losses += t.losses
    merged.towers += t.towers
    merged.dragons += t.dragons
    merged.barons += t.barons
    merged.heralds += t.heralds
    merged.kills = (merged.kills ?? 0) + (t.kills ?? 0)
    merged.deaths = (merged.deaths ?? 0) + (t.deaths ?? 0)
    merged.assists = (merged.assists ?? 0) + (t.assists ?? 0)
  }
  merged.name = resolveTeamCanonicalName(merged.name)
  merged.winrate = merged.games ? round((merged.wins / merged.games) * 100, 1) : 0
  return merged
}

export function findChampionBySlug(champions: Champion[], slug: string): Champion | null {
  return (
    champions.find((c) => slugifyChamp(c.name) === slug) ??
    champions.find((c) => c.name.toLowerCase().replace(/\s+/g, '-') === slug) ??
    null
  )
}

function slugifyChamp(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface EntityFilterState {
  league: string
  year: string
  split: string
}

export function mergeDataForFilters(
  store: OEStore,
  filters: EntityFilterState,
): DashboardData {
  const split = filters.split === 'ALL' ? 'all' : filters.split
  return mergeSlices(store, filters.league, split, filters.year)
}

export function playerHasData(data: DashboardData, playerName: string): boolean {
  return data.players.some((p) => p.name === playerName)
}

export function teamHasData(data: DashboardData, teamSlug: string): boolean {
  return data.teams.some((t) => teamMatchesCanonical(t.name, teamSlug))
}

export function championHasData(data: DashboardData, championSlug: string): boolean {
  return Boolean(findChampionBySlug(data.champions, championSlug))
}

export function resolveEntityFilters(
  catalogSplits: string[],
  defaultYear: string,
  _defaultSplit: string,
  hasData: (split: string) => boolean,
): EntityFilterState {
  const split =
    pickNewestSplitWithData(catalogSplits, hasData, defaultYear) ??
    splitsNewestFirst(catalogSplits)[0] ??
    `${defaultYear} Spring`
  const year = split.split(' ', 1)[0] ?? defaultYear
  return { league: 'All Tier 1', year, split }
}

export function buildPlayerSearchSlug(player: Player, allPlayers: Player[]): string {
  const sameName = allPlayers.filter((p) => p.name === player.name)
  if (sameName.length <= 1) return playerSlug(player.name)
  return playerSlug(player.name, player.team, player.league)
}

export function resolvePlayerFromSlug(
  players: Player[],
  slug: string,
): { player: Player; slug: string } | null {
  const byExactSlug = new Map<string, Player>()
  for (const p of players) {
    byExactSlug.set(buildPlayerSearchSlug(p, players), p)
  }
  if (byExactSlug.has(slug)) {
    const row = byExactSlug.get(slug)!
    return { player: mergePlayersByName(players, row.name)!, slug }
  }

  const nameGuess = slug.split('-')[0]?.replace(/-/g, ' ') ?? slug
  const candidates = [...new Set(players.filter((p) => slugifyPlayerName(p.name) === slugifyPlayerName(nameGuess) || slug.startsWith(slugifyPlayerName(p.name))).map((p) => p.name))]
  if (candidates.length === 1) {
    const merged = mergePlayersByName(players, candidates[0]!)
    return merged ? { player: merged, slug: buildPlayerSearchSlug(merged, players) } : null
  }

  for (const name of candidates) {
    const merged = mergePlayersByName(players, name)
    if (merged && buildPlayerSearchSlug(merged, players) === slug) {
      return { player: merged, slug }
    }
  }

  const direct = players.find((p) => slugifyPlayerName(p.name) === slug)
  if (direct) {
    const merged = mergePlayersByName(players, direct.name)
    return merged ? { player: merged, slug: buildPlayerSearchSlug(merged, players) } : null
  }
  return null
}

function slugifyPlayerName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export { slugifyChamp as championSlugify }
