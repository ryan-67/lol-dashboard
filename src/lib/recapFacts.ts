import type { Team } from '../hooks/useDashboardData'
import { resolveTeamCanonicalName } from './entities/slugs'
import { findTeamByName } from './teamAnalytics'
import { type RoleKey } from './playerRadar'

export interface SeriesPlayerFact {
  name: string
  team: string
  role: RoleKey | null
  games: number
  wins: number
  avgKda: number
  avgDmg: number
  avgGd15: number
  avgKp: number
  champions: string[]
}

export interface SeriesFacts {
  winner: string
  loser: string
  score: string
  league: string
  domWins: number
  vicWins: number
  gameCount: number
  reverseSweep: boolean
  blowout: boolean
  upset: boolean
  domSplitWr: number
  vicSplitWr: number
  seriesStreak: number
  victimSlump: number
  avgGd15Winner: number
  laneDuel: {
    dominator: string
    victim: string
    role: RoleKey
    advantageVerb: 'outlaned' | 'outjungled'
    wonLaneEveryGame: boolean
    wonDmgEveryGame: boolean
    games: number
  } | null
  topCarry: SeriesPlayerFact | null
  pocketPick: { name: string; champion: string; role: RoleKey | null } | null
  loserStandout: { name: string; avgKda: number; avgDmg: number } | null
  loserHorrors: string[]
  highlights: SeriesPlayerFact[]
}

interface GamePlayer {
  team: string
  name: string
  champion: string
  role: RoleKey | null
  kda: number
  gd15: number
  kp: number
  dmgShare: number
  won: boolean
}

interface SeriesBucket {
  teamA: string
  teamB: string
  games: Array<{
    id: string
    date: string
    winner: string
    loser: string
    players: GamePlayer[]
  }>
}

interface LaneDuelDomination {
  dominator: string
  victim: string
  role: RoleKey
  games: number
  wonLaneEveryGame: boolean
  wonDmgEveryGame: boolean
}

function teamLeague(teams: Team[], name: string): string {
  return (findTeamByName(teams, name)?.league ?? 'LCK').toUpperCase()
}

function splitWinrate(teams: Team[], name: string): number {
  return findTeamByName(teams, name)?.winrate ?? 50
}

function upsetFromWr(dom: number, vic: number): boolean {
  return dom + 8 < vic
}

function aggregateSeriesPlayerStats(bucket: SeriesBucket): SeriesPlayerFact[] {
  const map = new Map<string, SeriesPlayerFact & { _kda: number; _dmg: number; _gd: number; _kp: number }>()

  for (const g of bucket.games) {
    for (const p of g.players) {
      const key = `${p.team}|${p.name}`
      const cur = map.get(key) ?? {
        name: p.name,
        team: p.team,
        role: p.role,
        games: 0,
        wins: 0,
        avgKda: 0,
        avgDmg: 0,
        avgGd15: 0,
        avgKp: 0,
        champions: [],
        _kda: 0,
        _dmg: 0,
        _gd: 0,
        _kp: 0,
      }
      cur.games++
      if (p.won) cur.wins++
      cur._kda += p.kda
      cur._dmg += p.dmgShare
      cur._gd += p.gd15
      cur._kp += p.kp
      if (p.champion && !cur.champions.includes(p.champion)) cur.champions.push(p.champion)
      map.set(key, cur)
    }
  }

  return [...map.values()].map(({ _kda, _dmg, _gd, _kp, ...s }) => ({
    ...s,
    avgKda: _kda / s.games,
    avgDmg: _dmg / s.games,
    avgGd15: _gd / s.games,
    avgKp: _kp / s.games,
  }))
}

function findLaneDuelDomination(series: SeriesBucket): LaneDuelDomination | null {
  let best: LaneDuelDomination | null = null

  for (const role of ['top', 'jungle', 'mid', 'adc', 'support'] as RoleKey[]) {
    const perGame: { a: GamePlayer; b: GamePlayer }[] = []
    for (const g of series.games) {
      const lane = g.players.filter((p) => p.role === role)
      if (lane.length < 2) continue
      const teams = [...new Set(lane.map((p) => p.team))]
      if (teams.length < 2) continue
      const p1 = lane.find((p) => p.team === teams[0])
      const p2 = lane.find((p) => p.team === teams[1])
      if (!p1 || !p2) continue
      perGame.push({ a: p1, b: p2 })
    }
    if (perGame.length < 2) continue
    const namesA = new Set(perGame.map((x) => x.a.name))
    const namesB = new Set(perGame.map((x) => x.b.name))
    if (namesA.size !== 1 || namesB.size !== 1) continue

    let aLaneWins = 0
    let aDmgWins = 0
    for (const { a, b } of perGame) {
      if (a.gd15 > b.gd15) aLaneWins++
      if (a.dmgShare > b.dmgShare) aDmgWins++
    }
    const bLaneWins = perGame.length - aLaneWins
    const bDmgWins = perGame.length - aDmgWins
    const sample = perGame[0]!

    const candidates: LaneDuelDomination[] = []
    if (aLaneWins === perGame.length || aDmgWins === perGame.length) {
      candidates.push({
        dominator: sample.a.name,
        victim: sample.b.name,
        role,
        games: perGame.length,
        wonLaneEveryGame: aLaneWins === perGame.length,
        wonDmgEveryGame: aDmgWins === perGame.length,
      })
    }
    if (bLaneWins === perGame.length || bDmgWins === perGame.length) {
      candidates.push({
        dominator: sample.b.name,
        victim: sample.a.name,
        role,
        games: perGame.length,
        wonLaneEveryGame: bLaneWins === perGame.length,
        wonDmgEveryGame: bDmgWins === perGame.length,
      })
    }
    for (const c of candidates) {
      const score =
        (c.wonLaneEveryGame ? 40 : 0) + (c.wonDmgEveryGame ? 35 : 0) + c.games * 10
      const bestScore = best
        ? (best.wonLaneEveryGame ? 40 : 0) + (best.wonDmgEveryGame ? 35 : 0) + best.games * 10
        : 0
      if (!best || score > bestScore) best = c
    }
  }
  return best
}

function avgTeamGd15(series: SeriesBucket, team: string): number {
  const vals = series.games.flatMap((g) =>
    g.players.filter((p) => p.team === team).map((p) => p.gd15),
  )
  if (!vals.length) return 0
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

export function buildSeriesFacts(
  bucket: SeriesBucket,
  teams: Team[],
  weekCounts: Map<string, number>,
  opts: {
    reverseSweep: boolean
    blowout: boolean
    seriesStreak: number
    victimSlump: number
  },
): SeriesFacts {
  const winsA = bucket.games.filter((g) => g.winner === bucket.teamA).length
  const winsB = bucket.games.length - winsA
  const winner = winsA >= winsB ? bucket.teamA : bucket.teamB
  const loser = winner === bucket.teamA ? bucket.teamB : bucket.teamA
  const domWins = Math.max(winsA, winsB)
  const vicWins = Math.min(winsA, winsB)

  const domSplitWr = splitWinrate(teams, winner)
  const vicSplitWr = splitWinrate(teams, loser)
  const league = teamLeague(teams, winner)
  const playerStats = aggregateSeriesPlayerStats(bucket)
  const laneDuel = findLaneDuelDomination(bucket)
  const winPlayers = playerStats.filter((p) => p.team === winner && p.wins > 0)
  const losePlayers = playerStats.filter((p) => p.team === loser)

  const topCarry =
    winPlayers
      .filter((p) => p.wins >= 2 && p.avgDmg >= 28 && p.avgKda >= 3.2)
      .sort((a, b) => b.avgDmg * b.avgKda - a.avgDmg * a.avgKda)[0] ?? null

  const pocket = winPlayers
    .filter((p) => {
      const champ = p.champions.find((c) => (weekCounts.get(c) ?? 0) <= 2)
      return champ && p.avgKda >= 2.5
    })
    .sort((a, b) => b.avgKda - a.avgKda)[0]

  const pocketPick = pocket
    ? {
        name: pocket.name,
        champion: pocket.champions.find((c) => (weekCounts.get(c) ?? 0) <= 2)!,
        role: pocket.role,
      }
    : null

  const loserStandout =
    losePlayers
      .filter((p) => p.avgKda >= 3.2 || p.avgDmg >= 28)
      .sort((a, b) => b.avgKda * 0.5 + b.avgDmg * 0.5 - (a.avgKda * 0.5 + a.avgDmg * 0.5))[0] ?? null

  const loserHorrors = losePlayers
    .filter((p) => p.avgKda < 2.2)
    .sort((a, b) => a.avgKda - b.avgKda)
    .slice(0, 2)
    .map((p) => p.name)

  const highlights = playerStats
    .filter((p) => p.avgKda >= 3.5 || p.avgDmg >= 28)
    .sort((a, b) => b.avgKda * 0.4 + b.avgDmg * 0.6 - (a.avgKda * 0.4 + a.avgDmg * 0.6))
    .slice(0, 6)

  return {
    winner: resolveTeamCanonicalName(winner),
    loser: resolveTeamCanonicalName(loser),
    score: `${domWins}-${vicWins}`,
    league,
    domWins,
    vicWins,
    gameCount: bucket.games.length,
    reverseSweep: opts.reverseSweep,
    blowout: domWins >= 2 && vicWins === 0,
    upset: upsetFromWr(domSplitWr, vicSplitWr),
    domSplitWr,
    vicSplitWr,
    seriesStreak: opts.seriesStreak,
    victimSlump: opts.victimSlump,
    avgGd15Winner: avgTeamGd15(bucket, winner),
    laneDuel: laneDuel
      ? {
          dominator: laneDuel.dominator,
          victim: laneDuel.victim,
          role: laneDuel.role,
          advantageVerb: laneDuel.role === 'jungle' ? 'outjungled' : 'outlaned',
          wonLaneEveryGame: laneDuel.wonLaneEveryGame,
          wonDmgEveryGame: laneDuel.wonDmgEveryGame,
          games: laneDuel.games,
        }
      : null,
    topCarry: topCarry ?? null,
    pocketPick,
    loserStandout: loserStandout
      ? { name: loserStandout.name, avgKda: loserStandout.avgKda, avgDmg: loserStandout.avgDmg }
      : null,
    loserHorrors,
    highlights,
  }
}

export function factsToPromptJson(facts: SeriesFacts): string {
  return JSON.stringify(facts, null, 2)
}
