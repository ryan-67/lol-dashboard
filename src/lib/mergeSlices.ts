import type {
  Champion,
  DashboardData,
  Matchup,
  Player,
  PlayerChampionPoolEntry,
  PlayerGameLog,
  Team,
  TeamChampion,
} from '../hooks/useDashboardData'
import { aggregateAdvancedFromGameLog } from './advancedStats'
import { mergeChampionPoolEntries } from './playerAnalytics'

export interface DashboardSlice {
  players: Player[]
  teams: Team[]
  champions: Champion[]
  matchups: Matchup[]
  teamChampions: TeamChampion[]
  weeklyTeamGames?: Record<string, number>
}

export interface OEStoreMeta {
  source: string
  generated_at: string
  leagues: string[]
  splits: string[]
  schema_version: string
  csv_files?: string[]
}

export interface OEStore {
  meta: OEStoreMeta
  slices: Record<string, DashboardSlice>
}

export const TIER1_LEAGUES = ['LCK', 'LPL', 'LEC', 'LCS'] as const

const SEASON_ORDER: Record<string, number> = {
  Winter: 0,
  'First Stand': 1,
  Spring: 2,
  MSI: 3,
  Summer: 4,
  Worlds: 5,
}

/** Matches ingest_csv.py split_sort_key for consistent split dropdown order. */
export function splitSortKey(splitLabel: string): [number, number, string] {
  const spaceIdx = splitLabel.indexOf(' ')
  const yearPart = spaceIdx >= 0 ? splitLabel.slice(0, spaceIdx) : splitLabel
  const season = spaceIdx >= 0 ? splitLabel.slice(spaceIdx + 1) : splitLabel
  const year = /^\d+$/.test(yearPart) ? parseInt(yearPart, 10) : 0
  return [year, SEASON_ORDER[season] ?? 99, season.toLowerCase()]
}

type PlayerRow = Player & {
  kills?: number
  deaths?: number
  assists?: number
  gameLog?: PlayerGameLog[]
  championPool?: PlayerChampionPoolEntry[]
}
type TeamRow = Team & {
  kills?: number
  deaths?: number
  assists?: number
  voidGrubs?: number
}
type ChampionRow = Champion

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function dedupeGameLog(log: PlayerGameLog[]): PlayerGameLog[] {
  const seen = new Set<string>()
  return log.filter((game) => {
    const id = game.gameId ?? `${game.date}|${game.champion}|${game.result}|${game.opponent ?? ''}|${game.kda}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function avgWeighted(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, v) => sum + v.weight, 0)
  if (totalWeight <= 0) return 0
  return values.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight
}

export function sliceKey(split: string, league: string): string {
  return `${split}|${league}`
}

export function selectSliceKeysFromFilters(
  store: OEStore,
  leagues: string[],
  years: string[],
  splits: string[],
): string[] {
  const tier1 =
    !leagues.length || leagues.includes('All Tier 1')
      ? [...TIER1_LEAGUES]
      : leagues.filter((l) => l !== 'All Tier 1')
  let splitLabels = store.meta.splits
  const allYears = years.includes('ALL')
  const allSplits = splits.includes('ALL')

  if (!allYears) {
    splitLabels = splitLabels.filter((s) => years.some((y) => s.startsWith(`${y} `)))
  }
  if (!allSplits) {
    splitLabels = splitLabels.filter((s) => splits.includes(s))
  }

  const keys: string[] = []
  for (const splitLabel of splitLabels) {
    for (const league of tier1) {
      const key = sliceKey(splitLabel, league)
      if (store.slices[key]) keys.push(key)
    }
  }
  return keys
}

export function selectSliceKeys(
  store: OEStore,
  league: string,
  split: string,
  year?: string,
): string[] {
  const isAll = split === 'all' || split === 'ALL'
  const splits = isAll
    ? store.meta.splits.filter((s) => !year || s.startsWith(`${year} `))
    : [split]
  const leagues =
    league === 'All Tier 1' ? [...TIER1_LEAGUES] : [league]

  const keys: string[] = []
  for (const s of splits) {
    for (const l of leagues) {
      const key = sliceKey(s, l)
      if (store.slices[key]) keys.push(key)
    }
  }
  return keys
}

function mergePlayers(slices: DashboardSlice[]): Player[] {
  const acc = new Map<
    string,
    {
      name: string
      team: string
      league: string
      position: string
      games: number
      kills: number
      deaths: number
      assists: number
      kp: Array<{ value: number; weight: number }>
      dmgShare: Array<{ value: number; weight: number }>
      gd15: Array<{ value: number; weight: number }>
      csd15: Array<{ value: number; weight: number }>
      xpd15: Array<{ value: number; weight: number }>
      dpm: Array<{ value: number; weight: number }>
      visionScore: Array<{ value: number; weight: number }>
      goldShare: Array<{ value: number; weight: number }>
      firstBloodRate: Array<{ value: number; weight: number }>
      objControl: Array<{ value: number; weight: number }>
      gameLog: PlayerGameLog[]
      championPool: PlayerChampionPoolEntry[]
    }
  >()

  for (const slice of slices) {
    for (const raw of slice.players ?? []) {
      const p = raw as PlayerRow
      const key = `${p.name}|${p.team}|${p.league}`
      const games = p.games ?? 0
      const existing = acc.get(key) ?? {
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position ?? '',
        games: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        kp: [],
        dmgShare: [],
        gd15: [],
        csd15: [],
        xpd15: [],
        dpm: [],
        visionScore: [],
        goldShare: [],
        firstBloodRate: [],
        objControl: [],
        gameLog: [],
        championPool: [],
      }

      if (p.gameLog?.length) existing.gameLog.push(...p.gameLog)
      if (p.championPool?.length) existing.championPool.push(...p.championPool)

      existing.games += games
      existing.kills += p.kills ?? 0
      existing.deaths += p.deaths ?? 0
      existing.assists += p.assists ?? 0
      if (games > 0 && typeof p.kp === 'number') existing.kp.push({ value: p.kp, weight: games })
      if (games > 0 && typeof p.dmgShare === 'number') {
        existing.dmgShare.push({ value: p.dmgShare, weight: games })
      }
      if (games > 0 && typeof p.gd15 === 'number') existing.gd15.push({ value: p.gd15, weight: games })
      if (games > 0 && typeof p.csd15 === 'number') {
        existing.csd15.push({ value: p.csd15, weight: games })
      }
      if (games > 0 && typeof p.xpd15 === 'number') {
        existing.xpd15.push({ value: p.xpd15, weight: games })
      }
      if (games > 0 && typeof p.dpm === 'number') existing.dpm.push({ value: p.dpm, weight: games })
      if (games > 0 && typeof p.visionScore === 'number') {
        existing.visionScore.push({ value: p.visionScore, weight: games })
      }
      if (games > 0 && typeof p.goldShare === 'number') {
        existing.goldShare.push({ value: p.goldShare, weight: games })
      }
      if (games > 0 && typeof p.firstBloodRate === 'number') {
        existing.firstBloodRate.push({ value: p.firstBloodRate, weight: games })
      }
      if (games > 0 && typeof p.objControl === 'number') {
        existing.objControl.push({ value: p.objControl, weight: games })
      }
      if (!existing.position && p.position) existing.position = p.position
      acc.set(key, existing)
    }
  }

  return [...acc.values()]
    .map((p) => {
      const deaths = Math.max(p.deaths, 1)
      const gameLog = dedupeGameLog(p.gameLog).sort((a, b) => a.date.localeCompare(b.date))
      const advanced = aggregateAdvancedFromGameLog(gameLog)
      return {
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position,
        games: p.games,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        kda: round((p.kills + p.assists) / deaths, 2),
        kp: round(avgWeighted(p.kp), 1),
        dmgShare: round(avgWeighted(p.dmgShare), 1),
        gd15: round(avgWeighted(p.gd15), 1),
        csd15: round(avgWeighted(p.csd15), 1),
        xpd15: round(avgWeighted(p.xpd15), 1),
        dpm: round(avgWeighted(p.dpm), 1),
        visionScore: round(avgWeighted(p.visionScore), 1),
        goldShare: round(avgWeighted(p.goldShare), 1),
        firstBloodRate: round(avgWeighted(p.firstBloodRate), 1),
        objControl: round(avgWeighted(p.objControl), 2),
        turretPlates: round(advanced.turretPlates ?? 0, 2),
        campsStolen: round(advanced.campsStolen ?? 0, 2),
        wardsDestroyed: round(advanced.wardsDestroyed ?? 0, 1),
        kaPerMin: round(advanced.kaPerMin ?? 0, 2),
        dmgGoldRatio: round(advanced.dmgGoldRatio ?? 0, 3),
        dmgPerGold: round(advanced.dmgPerGold ?? 0, 4),
        gameLog,
        championPool: mergeChampionPoolEntries(p.championPool),
      } satisfies Player
    })
    .filter((p) => p.games >= 5)
    .sort((a, b) => b.kda - a.kda)
}

function mergeTeams(slices: DashboardSlice[]): Team[] {
  const acc = new Map<
    string,
    {
      name: string
      league: string
      games: number
      wins: number
      losses: number
      kills: number
      deaths: number
      assists: number
      towers: number
      dragons: number
      barons: number
      heralds: number
      voidGrubs: number
      gd15: Array<{ value: number; weight: number }>
      goldPerMin: Array<{ value: number; weight: number }>
      wardsPerMin: Array<{ value: number; weight: number }>
      avgGameLength: Array<{ value: number; weight: number }>
      firstBloodRate: Array<{ value: number; weight: number }>
    }
  >()

  for (const slice of slices) {
    for (const raw of slice.teams ?? []) {
      const t = raw as TeamRow
      const key = `${t.name}|${t.league}`
      const games = t.games ?? 0
      const existing = acc.get(key) ?? {
        name: t.name,
        league: t.league,
        games: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        towers: 0,
        dragons: 0,
        barons: 0,
        heralds: 0,
        voidGrubs: 0,
        gd15: [],
        goldPerMin: [],
        wardsPerMin: [],
        avgGameLength: [],
        firstBloodRate: [],
      }

      existing.games += games
      existing.wins += t.wins ?? 0
      existing.losses += t.losses ?? 0
      existing.kills += t.kills ?? 0
      existing.deaths += t.deaths ?? 0
      existing.assists += t.assists ?? 0
      existing.towers += t.towers ?? 0
      existing.dragons += t.dragons ?? 0
      existing.barons += t.barons ?? 0
      existing.heralds += t.heralds ?? 0
      existing.voidGrubs += t.voidGrubs ?? 0
      if (games > 0 && typeof t.avgGd15 === 'number') {
        existing.gd15.push({ value: t.avgGd15, weight: games })
      }
      if (games > 0 && typeof t.goldPerMin === 'number') {
        existing.goldPerMin.push({ value: t.goldPerMin, weight: games })
      }
      if (games > 0 && typeof t.wardsPerMin === 'number') {
        existing.wardsPerMin.push({ value: t.wardsPerMin, weight: games })
      }
      if (games > 0 && typeof t.avgGameLength === 'number') {
        existing.avgGameLength.push({ value: t.avgGameLength, weight: games })
      }
      if (games > 0 && typeof t.firstBloodRate === 'number') {
        existing.firstBloodRate.push({ value: t.firstBloodRate, weight: games })
      }
      acc.set(key, existing)
    }
  }

  return [...acc.values()]
    .map((t) => {
      const games = Math.max(t.games, 1)
      const deaths = Math.max(t.deaths, 1)
      return {
        name: t.name,
        league: t.league,
        games: t.games,
        wins: t.wins,
        losses: t.losses,
        winrate: round(t.wins / games * 100, 1),
        avgKda: round((t.kills + t.assists) / deaths, 2),
        avgGd15: round(avgWeighted(t.gd15), 1),
        towers: t.towers,
        dragons: t.dragons,
        barons: t.barons,
        heralds: t.heralds,
        voidGrubs: t.voidGrubs,
        dragonsPerGame: round(t.dragons / games, 2),
        baronsPerGame: round(t.barons / games, 2),
        towersPerGame: round(t.towers / games, 2),
        heraldsPerGame: round(t.heralds / games, 2),
        voidGrubsPerGame: round(t.voidGrubs / games, 2),
        killsPerGame: round(t.kills / games, 2),
        deathsPerGame: round(t.deaths / games, 2),
        objPerGame: round((t.dragons + t.barons + t.heralds + t.voidGrubs) / games, 2),
        avgGameLength: round(avgWeighted(t.avgGameLength), 0),
        goldPerMin: round(avgWeighted(t.goldPerMin), 1),
        wardsPerMin: round(avgWeighted(t.wardsPerMin), 2),
        firstBloodRate: round(avgWeighted(t.firstBloodRate), 1),
      } satisfies Team
    })
    .filter((t) => t.games >= 3)
    .sort((a, b) => b.winrate - a.winrate)
}

type ChampionMergeAcc = {
  name: string
  positions: Set<string>
  picks: number
  bans: number
  wins: number
  kills: number
  deaths: number
  assists: number
  csd15: Array<{ value: number; weight: number }>
  dpm: Array<{ value: number; weight: number }>
  goldPerMin: Array<{ value: number; weight: number }>
  sparkline: number[]
  weekly: Map<string, { picks: number; bans: number; wins: number }>
  gameDates: string[]
}

function emptyChampionAcc(name: string): ChampionMergeAcc {
  return {
    name,
    positions: new Set<string>(),
    picks: 0,
    bans: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    csd15: [],
    dpm: [],
    goldPerMin: [],
    sparkline: [],
    weekly: new Map(),
    gameDates: [],
  }
}

function mergeChampions(slices: DashboardSlice[]): Champion[] {
  const acc = new Map<string, ChampionMergeAcc>()

  let totalGames = 0
  const mergedWeeklyTeamGames = new Map<string, number>()

  for (const slice of slices) {
    totalGames += (slice.teams ?? []).reduce((sum, t) => sum + (t.games ?? 0), 0) / 2
    for (const [week, count] of Object.entries(slice.weeklyTeamGames ?? {})) {
      mergedWeeklyTeamGames.set(week, (mergedWeeklyTeamGames.get(week) ?? 0) + count)
    }
    for (const raw of slice.champions ?? []) {
      const c = raw as ChampionRow
      const existing = acc.get(c.name) ?? emptyChampionAcc(c.name)
      const picks = c.picks ?? 0
      existing.picks += picks
      existing.bans += c.bans ?? 0
      existing.wins += c.wins ?? Math.round(((c.winrate ?? 0) / 100) * picks)
      existing.kills += c.kills ?? 0
      existing.deaths += c.deaths ?? 0
      existing.assists += c.assists ?? 0
      if (picks > 0 && typeof c.avgCsd15 === 'number') {
        existing.csd15.push({ value: c.avgCsd15, weight: picks })
      }
      if (picks > 0 && typeof c.avgDpm === 'number') {
        existing.dpm.push({ value: c.avgDpm, weight: picks })
      }
      if (picks > 0 && typeof c.avgGoldPerMin === 'number') {
        existing.goldPerMin.push({ value: c.avgGoldPerMin, weight: picks })
      }
      if (c.sparkline?.length) existing.sparkline.push(...c.sparkline)
      for (const stat of c.weeklyStats ?? []) {
        const week = existing.weekly.get(stat.weekStart) ?? { picks: 0, bans: 0, wins: 0 }
        week.picks += stat.picks ?? 0
        week.bans += stat.bans ?? 0
        week.wins += stat.wins ?? Math.round(((stat.winrate ?? 0) / 100) * (stat.picks ?? 0))
        existing.weekly.set(stat.weekStart, week)
      }
      if (c.gameDates?.length) existing.gameDates.push(...c.gameDates)
      for (const pos of c.positions ?? []) existing.positions.add(pos)
      acc.set(c.name, existing)
    }
  }

  const games = Math.max(totalGames, 1)
  return [...acc.values()]
    .map((c) => {
      const picks = Math.max(c.picks, 1)
      const deaths = Math.max(c.deaths, 1)
      const positions = [...c.positions].sort()
      const pickRate = Math.min(100, round((c.picks / games) * 100, 1))
      const banRate = Math.min(100, round((c.bans / games) * 100, 1))
      const presence = Math.min(200, round(pickRate + banRate, 1))
      const weeklyStats = [...c.weekly.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, stats]) => {
          const weekGames = Math.max((mergedWeeklyTeamGames.get(weekStart) ?? 0) / 2, 1)
          const weekPick = Math.min(100, round((stats.picks / weekGames) * 100, 1))
          const weekBan = Math.min(100, round((stats.bans / weekGames) * 100, 1))
          return {
            weekStart,
            picks: stats.picks,
            bans: stats.bans,
            wins: stats.wins,
            winrate: stats.picks ? round((stats.wins / stats.picks) * 100, 1) : 0,
            presence: Math.min(200, round(weekPick + weekBan, 1)),
          }
        })
      return {
        name: c.name,
        positions,
        picks: c.picks,
        bans: c.bans,
        presence,
        pickRate,
        banRate,
        winrate: round(c.wins / picks * 100, 1),
        wins: c.wins,
        avgKda: round((c.kills + c.assists) / deaths, 2),
        games: c.picks,
        avgCsd15: round(avgWeighted(c.csd15), 1),
        avgDpm: round(avgWeighted(c.dpm), 1),
        avgGoldPerMin: round(avgWeighted(c.goldPerMin), 1),
        sparkline: c.sparkline.slice(-10),
        primaryRole: positions[0] ?? '',
        weeklyStats,
        gameDates: [...new Set(c.gameDates)].sort(),
      } satisfies Champion
    })
    .filter((c) => c.picks >= 3)
    .sort((a, b) => b.presence - a.presence)
}

function mergeMatchups(slices: DashboardSlice[]): Matchup[] {
  const acc = new Map<string, Matchup>()

  for (const slice of slices) {
    for (const m of slice.matchups ?? []) {
      const key = [m.teamA, m.teamB].sort().join('|')
      const ordered = [m.teamA, m.teamB].sort()
      const sameOrder = ordered[0] === m.teamA
      const existing = acc.get(key) ?? {
        teamA: ordered[0],
        teamB: ordered[1],
        games: 0,
        winsA: 0,
        winsB: 0,
      }
      existing.games += m.games ?? 0
      existing.winsA += sameOrder ? (m.winsA ?? 0) : (m.winsB ?? 0)
      existing.winsB += sameOrder ? (m.winsB ?? 0) : (m.winsA ?? 0)
      acc.set(key, existing)
    }
  }

  return [...acc.values()].filter((m) => m.games > 0)
}

function mergeTeamChampions(slices: DashboardSlice[]): TeamChampion[] {
  const acc = new Map<
    string,
    { team: string; champion: string; picks: number; wins: number; pickSlotSum: number; pickSlotCount: number }
  >()

  for (const slice of slices) {
    for (const row of slice.teamChampions ?? []) {
      const key = `${row.team}|${row.champion}`
      const existing = acc.get(key) ?? {
        team: row.team,
        champion: row.champion,
        picks: 0,
        wins: 0,
        pickSlotSum: 0,
        pickSlotCount: 0,
      }
      const picks = row.picks ?? 0
      existing.picks += picks
      existing.wins += Math.round(((row.winrate ?? 0) / 100) * picks)
      if (row.avgPickOrder != null && picks > 0) {
        existing.pickSlotSum += row.avgPickOrder * picks
        existing.pickSlotCount += picks
      }
      acc.set(key, existing)
    }
  }

  return [...acc.values()]
    .filter((row) => row.picks >= 1)
    .map((row) => {
      const result: TeamChampion = {
        team: row.team,
        champion: row.champion,
        picks: row.picks,
        winrate: round(row.wins / Math.max(row.picks, 1) * 100, 1),
      }
      if (row.pickSlotCount > 0) {
        result.avgPickOrder = round(row.pickSlotSum / row.pickSlotCount, 2)
      }
      return result
    })
}

export function mergeSlicesFromFilters(
  store: OEStore,
  leagues: string[],
  years: string[],
  splits: string[],
): DashboardData {
  const keys = selectSliceKeysFromFilters(store, leagues, years, splits)
  const slices = keys.map((key) => store.slices[key]).filter(Boolean)

  if (slices.length === 0) {
    return {
      meta: {
        ...store.meta,
        leagues: [...store.meta.leagues],
      },
      players: [],
      teams: [],
      champions: [],
      matchups: [],
      teamChampions: [],
    }
  }

  return {
    meta: {
      ...store.meta,
      leagues: [...store.meta.leagues],
    },
    players: mergePlayers(slices),
    teams: mergeTeams(slices),
    champions: mergeChampions(slices),
    matchups: mergeMatchups(slices),
    teamChampions: mergeTeamChampions(slices),
  }
}

export function mergeSlices(
  store: OEStore,
  league: string,
  split: string,
  year?: string,
): DashboardData {
  const keys = selectSliceKeys(store, league, split, year)
  const slices = keys.map((key) => store.slices[key]).filter(Boolean)

  if (slices.length === 0) {
    return {
      meta: {
        ...store.meta,
        leagues: [...store.meta.leagues],
      },
      players: [],
      teams: [],
      champions: [],
      matchups: [],
      teamChampions: [],
    }
  }

  return {
    meta: {
      ...store.meta,
      leagues: [...store.meta.leagues],
    },
    players: mergePlayers(slices),
    teams: mergeTeams(slices),
    champions: mergeChampions(slices),
    matchups: mergeMatchups(slices),
    teamChampions: mergeTeamChampions(slices),
  }
}
