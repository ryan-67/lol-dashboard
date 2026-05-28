import type {
  Champion,
  DashboardData,
  Matchup,
  Player,
  Team,
  TeamChampion,
} from '../hooks/useDashboardData'

export interface DashboardSlice {
  players: Player[]
  teams: Team[]
  champions: Champion[]
  matchups: Matchup[]
  teamChampions: TeamChampion[]
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

type PlayerRow = Player & { kills?: number; deaths?: number; assists?: number }
type TeamRow = Team & { kills?: number; deaths?: number; assists?: number }
type ChampionRow = Champion

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function avgWeighted(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, v) => sum + v.weight, 0)
  if (totalWeight <= 0) return 0
  return values.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight
}

export function sliceKey(split: string, league: string): string {
  return `${split}|${league}`
}

export function selectSliceKeys(store: OEStore, league: string, split: string): string[] {
  const splits = split === 'all' ? store.meta.splits : [split]
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
      }

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
      if (!existing.position && p.position) existing.position = p.position
      acc.set(key, existing)
    }
  }

  return [...acc.values()]
    .map((p) => {
      const deaths = Math.max(p.deaths, 1)
      return {
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position,
        games: p.games,
        kda: round((p.kills + p.assists) / deaths, 2),
        kp: round(avgWeighted(p.kp), 1),
        dmgShare: round(avgWeighted(p.dmgShare), 1),
        gd15: round(avgWeighted(p.gd15), 1),
        csd15: round(avgWeighted(p.csd15), 1),
        xpd15: round(avgWeighted(p.xpd15), 1),
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
      gd15: Array<{ value: number; weight: number }>
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
        gd15: [],
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
      if (games > 0 && typeof t.avgGd15 === 'number') {
        existing.gd15.push({ value: t.avgGd15, weight: games })
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
      } satisfies Team
    })
    .filter((t) => t.games >= 3)
    .sort((a, b) => b.winrate - a.winrate)
}

function mergeChampions(slices: DashboardSlice[]): Champion[] {
  const acc = new Map<
    string,
    {
      name: string
      positions: Set<string>
      picks: number
      bans: number
      wins: number
      kills: number
      deaths: number
      assists: number
    }
  >()

  let totalTeamGames = 0
  for (const slice of slices) {
    totalTeamGames += (slice.teams ?? []).reduce((sum, t) => sum + (t.games ?? 0), 0) / 2
    for (const raw of slice.champions ?? []) {
      const c = raw as ChampionRow
      const existing = acc.get(c.name) ?? {
        name: c.name,
        positions: new Set<string>(),
        picks: 0,
        bans: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
      }
      const picks = c.picks ?? 0
      existing.picks += picks
      existing.bans += c.bans ?? 0
      existing.wins += c.wins ?? Math.round(((c.winrate ?? 0) / 100) * picks)
      existing.kills += c.kills ?? 0
      existing.deaths += c.deaths ?? 0
      existing.assists += c.assists ?? 0
      for (const pos of c.positions ?? []) existing.positions.add(pos)
      acc.set(c.name, existing)
    }
  }

  const denom = Math.max(totalTeamGames / 12, 1)
  return [...acc.values()]
    .map((c) => {
      const picks = Math.max(c.picks, 1)
      const deaths = Math.max(c.deaths, 1)
      const total = c.picks + c.bans
      return {
        name: c.name,
        positions: [...c.positions].sort(),
        picks: c.picks,
        bans: c.bans,
        presence: round(total / denom * 100, 1),
        winrate: round(c.wins / picks * 100, 1),
        avgKda: round((c.kills + c.assists) / deaths, 2),
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
  const acc = new Map<string, { team: string; champion: string; picks: number; wins: number }>()

  for (const slice of slices) {
    for (const row of slice.teamChampions ?? []) {
      const key = `${row.team}|${row.champion}`
      const existing = acc.get(key) ?? {
        team: row.team,
        champion: row.champion,
        picks: 0,
        wins: 0,
      }
      const picks = row.picks ?? 0
      existing.picks += picks
      existing.wins += Math.round(((row.winrate ?? 0) / 100) * picks)
      acc.set(key, existing)
    }
  }

  return [...acc.values()]
    .filter((row) => row.picks >= 1)
    .map((row) => ({
      team: row.team,
      champion: row.champion,
      picks: row.picks,
      winrate: round(row.wins / Math.max(row.picks, 1) * 100, 1),
    }))
}

export function mergeSlices(store: OEStore, league: string, split: string): DashboardData {
  const keys = selectSliceKeys(store, league, split)
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
