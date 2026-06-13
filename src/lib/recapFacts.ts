import type { Team } from '../hooks/useDashboardData'
import { resolveTeamCanonicalName } from './entities/slugs'
import { findTeamByName } from './teamAnalytics'
import { type RoleKey } from './playerRadar'
import { recapTeamTag } from './recapTeamTag'

export interface PlayerPerformanceFact {
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
  notes: string[]
}

export interface GameResultFact {
  game: number
  winnerAbbr: string
}

export interface SeriesFacts {
  winner: string
  loser: string
  winnerAbbr: string
  loserAbbr: string
  score: string
  league: string
  domWins: number
  vicWins: number
  gameCount: number
  reverseSweep: boolean
  blowout: boolean
  upset: boolean
  messySeries: boolean
  leadBlownBy: string | null
  leadBlownByAbbr: string | null
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
    dominatorWonSeries: boolean
  } | null
  topCarry: PlayerPerformanceFact | null
  pocketPick: { name: string; champion: string; role: RoleKey | null } | null
  winnerStars: PlayerPerformanceFact[]
  winnerConcerns: PlayerPerformanceFact[]
  loserBrightSpots: PlayerPerformanceFact[]
  loserStinkers: PlayerPerformanceFact[]
  gameFlow: GameResultFact[]
  narrativeHints: string[]
  /** @deprecated use loserStinkers */
  loserHorrors: string[]
  /** @deprecated use winnerStars */
  highlights: PlayerPerformanceFact[]
  /** @deprecated */
  loserStandout: { name: string; avgKda: number; avgDmg: number } | null
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

function aggregateSeriesPlayerStats(bucket: SeriesBucket): PlayerPerformanceFact[] {
  const map = new Map<
    string,
    PlayerPerformanceFact & { _kda: number; _dmg: number; _gd: number; _kp: number }
  >()

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
        notes: [],
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

function lostLaneEveryGame(bucket: SeriesBucket, playerName: string): boolean {
  const gamesPlayed = bucket.games.filter((g) => g.players.some((p) => p.name === playerName))
  if (gamesPlayed.length < 2) return false
  for (const g of gamesPlayed) {
    const me = g.players.find((p) => p.name === playerName)
    if (!me?.role) return false
    const opp = g.players.find((p) => p.role === me.role && p.team !== me.team)
    if (!opp || me.gd15 >= opp.gd15) return false
  }
  return true
}

function wonLaneEveryGame(bucket: SeriesBucket, playerName: string): boolean {
  const gamesPlayed = bucket.games.filter((g) => g.players.some((p) => p.name === playerName))
  if (gamesPlayed.length < 2) return false
  for (const g of gamesPlayed) {
    const me = g.players.find((p) => p.name === playerName)
    if (!me?.role) return false
    const opp = g.players.find((p) => p.role === me.role && p.team !== me.team)
    if (!opp || me.gd15 <= opp.gd15) return false
  }
  return true
}

function annotatePlayer(
  p: PlayerPerformanceFact,
  bucket: SeriesBucket,
  seriesWinner: string,
): PlayerPerformanceFact {
  const notes: string[] = []
  if (p.avgKda >= 5) notes.push(`${p.avgKda.toFixed(1)} kda — popoff`)
  else if (p.avgKda >= 3.5) notes.push(`${p.avgKda.toFixed(1)} kda — strong`)
  else if (p.avgKda < 2) notes.push(`${p.avgKda.toFixed(1)} kda — stinker`)

  if (p.avgDmg >= 30) notes.push(`${p.avgDmg.toFixed(0)}% dmg share`)
  if (p.avgKp >= 75) notes.push(`${p.avgKp.toFixed(0)}% kp`)
  if (p.champions.length) notes.push(`champs: ${p.champions.join(', ')}`)

  if (wonLaneEveryGame(bucket, p.name)) {
    const verb = p.role === 'jungle' ? 'outjungled' : 'outlaned'
    notes.push(`${verb} lane opponent every game`)
  }
  if (lostLaneEveryGame(bucket, p.name)) {
    const verb = p.role === 'jungle' ? 'outjungled by' : 'lost lane to'
    notes.push(`${verb} opponent every game`)
  }

  if (p.team === seriesWinner && p.wins >= 2 && p.avgDmg >= 28 && p.avgKda >= 3.2) {
    notes.push('series carry')
  }

  return { ...p, notes: [...new Set(notes)] }
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

function detectLeadBlown(
  orderedGames: SeriesBucket['games'],
  seriesWinner: string,
): string | null {
  if (orderedGames.length < 3) return null
  const first = orderedGames[0]!.winner
  const second = orderedGames[1]!.winner
  if (first === second && first !== seriesWinner) return first
  return null
}

function buildNarrativeHints(opts: {
  reverseSweep: boolean
  blowout: boolean
  upset: boolean
  messySeries: boolean
  leadBlownBy: string | null
  seriesStreak: number
  victimSlump: number
  domSplitWr: number
  vicSplitWr: number
  winner: string
  loser: string
}): string[] {
  const hints: string[] = []
  if (opts.leadBlownBy) {
    hints.push(`${recapTeamTag(opts.leadBlownBy)} blew a multi-game lead and got reverse swept`)
  } else if (opts.reverseSweep) {
    hints.push(`${recapTeamTag(opts.winner)} dropped game 1 then rallied`)
  }
  if (opts.blowout) hints.push('clean sweep — no games dropped')
  if (opts.upset) hints.push(`${recapTeamTag(opts.winner)} upset the higher split-WR favorite`)
  if (opts.messySeries) hints.push('back-and-forth series — multiple momentum swings')
  if (opts.seriesStreak >= 3) hints.push(`${recapTeamTag(opts.winner)} on a ${opts.seriesStreak}-series win streak`)
  else if (opts.seriesStreak >= 2) hints.push(`${recapTeamTag(opts.winner)} building momentum (${opts.seriesStreak} series wins)`)
  if (opts.victimSlump >= 2) hints.push(`${recapTeamTag(opts.loser)} slumping (${opts.victimSlump}+ series losses)`)
  if (opts.domSplitWr >= 65) hints.push(`${recapTeamTag(opts.winner)} strong split form (${opts.domSplitWr.toFixed(0)}% WR)`)
  if (opts.vicSplitWr >= 65 && opts.upset) {
    hints.push(`${recapTeamTag(opts.loser)} entered as split favorite (${opts.vicSplitWr.toFixed(0)}% WR)`)
  }
  return hints
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
  const winnerCanon = resolveTeamCanonicalName(winner)
  const loserCanon = resolveTeamCanonicalName(loser)

  const domSplitWr = splitWinrate(teams, winner)
  const vicSplitWr = splitWinrate(teams, loser)
  const league = teamLeague(teams, winner)
  const playerStats = aggregateSeriesPlayerStats(bucket).map((p) =>
    annotatePlayer(p, bucket, winner),
  )
  const laneDuel = findLaneDuelDomination(bucket)
  const winPlayers = playerStats.filter((p) => p.team === winner)
  const losePlayers = playerStats.filter((p) => p.team === loser)

  const ordered = [...bucket.games].sort((a, b) => a.date.localeCompare(b.date))
  const leadBlownBy = detectLeadBlown(ordered, winner)
  const messySeries = vicWins >= 2 && domWins >= 2 && bucket.games.length >= 4

  const winnerStars = winPlayers
    .filter(
      (p) =>
        p.notes.some((n) => n.includes('carry') || n.includes('popoff') || n.includes('strong')) ||
        p.avgKda >= 3.5 ||
        p.avgDmg >= 28,
    )
    .sort((a, b) => b.avgKda * 0.4 + b.avgDmg * 0.6 - (a.avgKda * 0.4 + a.avgDmg * 0.6))
    .slice(0, 4)

  const winnerConcerns = winPlayers
    .filter(
      (p) =>
        p.notes.some((n) => n.includes('stinker') || n.includes('lost lane') || n.includes('outjungled by')) ||
        p.avgKda < 2.3 ||
        lostLaneEveryGame(bucket, p.name),
    )
    .sort((a, b) => a.avgKda - b.avgKda)
    .slice(0, 3)

  const loserStinkers = losePlayers
    .filter((p) => p.avgKda < 2.2 || p.notes.some((n) => n.includes('stinker')))
    .sort((a, b) => a.avgKda - b.avgKda)
    .slice(0, 3)

  const loserBrightSpots = losePlayers
    .filter((p) => p.avgKda >= 3 || p.avgDmg >= 28)
    .sort((a, b) => b.avgKda * 0.5 + b.avgDmg * 0.5 - (a.avgKda * 0.5 + a.avgDmg * 0.5))
    .slice(0, 2)

  const topCarry = winnerStars[0] ?? null

  const pocket = winPlayers.find((p) => {
    const champ = p.champions.find((c) => (weekCounts.get(c) ?? 0) <= 2)
    return champ && p.avgKda >= 2.5
  })
  const pocketPick = pocket
    ? {
        name: pocket.name,
        champion: pocket.champions.find((c) => (weekCounts.get(c) ?? 0) <= 2)!,
        role: pocket.role,
      }
    : null

  const gameFlow = ordered.map((g, i) => ({
    game: i + 1,
    winnerAbbr: recapTeamTag(g.winner),
  }))

  const narrativeHints = buildNarrativeHints({
    reverseSweep: opts.reverseSweep,
    blowout: domWins >= 2 && vicWins === 0,
    upset: upsetFromWr(domSplitWr, vicSplitWr),
    messySeries,
    leadBlownBy,
    seriesStreak: opts.seriesStreak,
    victimSlump: opts.victimSlump,
    domSplitWr,
    vicSplitWr,
    winner: winnerCanon,
    loser: loserCanon,
  })

  const laneDuelPlayer = laneDuel
    ? playerStats.find((p) => p.name === laneDuel.dominator)
    : null

  return {
    winner: winnerCanon,
    loser: loserCanon,
    winnerAbbr: recapTeamTag(winnerCanon),
    loserAbbr: recapTeamTag(loserCanon),
    score: `${domWins}-${vicWins}`,
    league,
    domWins,
    vicWins,
    gameCount: bucket.games.length,
    reverseSweep: opts.reverseSweep,
    blowout: domWins >= 2 && vicWins === 0,
    upset: upsetFromWr(domSplitWr, vicSplitWr),
    messySeries,
    leadBlownBy: leadBlownBy ? resolveTeamCanonicalName(leadBlownBy) : null,
    leadBlownByAbbr: leadBlownBy ? recapTeamTag(leadBlownBy) : null,
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
          dominatorWonSeries: laneDuelPlayer?.team === winner,
        }
      : null,
    topCarry,
    pocketPick,
    winnerStars,
    winnerConcerns,
    loserBrightSpots,
    loserStinkers,
    gameFlow,
    narrativeHints,
    loserHorrors: loserStinkers.map((p) => p.name),
    highlights: winnerStars,
    loserStandout: loserBrightSpots[0]
      ? { name: loserBrightSpots[0].name, avgKda: loserBrightSpots[0].avgKda, avgDmg: loserBrightSpots[0].avgDmg }
      : null,
  }
}

export function factsToPromptJson(facts: SeriesFacts): string {
  return JSON.stringify(facts, null, 2)
}
