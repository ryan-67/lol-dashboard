import type { Team } from '../hooks/useDashboardData'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
import { findTeamByName } from './teamAnalytics'
import { type RoleKey } from './playerRadar'
import { recapTeamTag } from './recapTeamTag'
import { analyzeSeriesMomentum } from './seriesMomentum'
import { compareSeriesGames } from './seriesGrouping'

export interface PlayerPerformanceFact {
  name: string
  team: string
  role: RoleKey | null
  games: number
  wins: number
  avgKda: number
  avgDmg: number
  avgGd15: number
  avgXpd15: number
  avgCsd15: number
  avgKp: number
  avgGoldShare: number
  avgKaPerMin: number
  avgDmgGoldRatio: number
  avgDmgPerGold: number
  champions: string[]
  /** Role-weighted stat callouts the LLM should cite instead of defaulting to KDA. */
  notes: string[]
}

export interface SeriesParticipant {
  ign: string
  team: string
  role: RoleKey | null
  champions: string[]
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
  /** Full series roster with exact ign spellings for LLM entity grounding. */
  participants: SeriesParticipant[]
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
  xpd15: number
  csd15: number
  kp: number
  dmgShare: number
  goldShare: number
  kaPerMin: number
  dmgGoldRatio: number
  dmgPerGold: number
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

type PlayerAgg = PlayerPerformanceFact & {
  _kda: number
  _dmg: number
  _gd: number
  _xpd: number
  _csd: number
  _kp: number
  _gold: number
  _ka: number
  _dmgGold: number
  _dmgPerGold: number
}

function aggregateSeriesPlayerStats(bucket: SeriesBucket): PlayerPerformanceFact[] {
  const map = new Map<string, PlayerAgg>()

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
        avgXpd15: 0,
        avgCsd15: 0,
        avgKp: 0,
        avgGoldShare: 0,
        avgKaPerMin: 0,
        avgDmgGoldRatio: 0,
        avgDmgPerGold: 0,
        champions: [],
        notes: [],
        _kda: 0,
        _dmg: 0,
        _gd: 0,
        _xpd: 0,
        _csd: 0,
        _kp: 0,
        _gold: 0,
        _ka: 0,
        _dmgGold: 0,
        _dmgPerGold: 0,
      }
      cur.games++
      if (p.won) cur.wins++
      cur._kda += p.kda
      cur._dmg += p.dmgShare
      cur._gd += p.gd15
      cur._xpd += p.xpd15
      cur._csd += p.csd15
      cur._kp += p.kp
      cur._gold += p.goldShare
      cur._ka += p.kaPerMin
      cur._dmgGold += p.dmgGoldRatio
      cur._dmgPerGold += p.dmgPerGold
      if (p.champion && !cur.champions.includes(p.champion)) cur.champions.push(p.champion)
      map.set(key, cur)
    }
  }

  return [...map.values()].map(
    ({ _kda, _dmg, _gd, _xpd, _csd, _kp, _gold, _ka, _dmgGold, _dmgPerGold, ...s }) => ({
      ...s,
      avgKda: _kda / s.games,
      avgDmg: _dmg / s.games,
      avgGd15: _gd / s.games,
      avgXpd15: _xpd / s.games,
      avgCsd15: _csd / s.games,
      avgKp: _kp / s.games,
      avgGoldShare: _gold / s.games,
      avgKaPerMin: _ka / s.games,
      avgDmgGoldRatio: _dmgGold / s.games,
      avgDmgPerGold: _dmgPerGold / s.games,
    }),
  )
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

function fmtSigned(n: number, digits = 0): string {
  const v = n.toFixed(digits)
  return n > 0 ? `+${v}` : v
}

function isStandoutByRole(p: PlayerPerformanceFact): boolean {
  switch (p.role) {
    case 'top':
      return p.avgGd15 >= 80 || p.avgCsd15 >= 10 || p.notes.some((n) => n.includes('outlaned'))
    case 'jungle':
      return p.avgKp >= 68 || p.avgKaPerMin >= 0.14 || p.notes.some((n) => n.includes('outjungled'))
    case 'mid':
      return p.avgDmg >= 27 || p.avgDmgGoldRatio >= 1.15
    case 'adc':
      return p.avgDmg >= 27 || (p.avgKda >= 4 && p.avgDmg >= 24) || p.avgDmgGoldRatio >= 1.15
    case 'support':
      return p.avgKp >= 72 || p.avgKaPerMin >= 0.12
    default:
      return p.avgDmg >= 28 || p.avgKda >= 4
  }
}

function isConcernByRole(p: PlayerPerformanceFact): boolean {
  if (p.notes.some((n) => n.includes('stinker') || n.includes('lost lane') || n.includes('outjungled by'))) {
    return true
  }
  switch (p.role) {
    case 'top':
      return p.avgGd15 <= -80 || p.avgCsd15 <= -10
    case 'jungle':
      return p.avgKp <= 48 || p.avgKaPerMin <= 0.08
    case 'mid':
      return p.avgDmg <= 22 || p.avgDmgGoldRatio <= 0.85
    case 'adc':
      return p.avgKda <= 2.2 || p.avgDmg <= 22 || p.avgDmgGoldRatio <= 0.85
    case 'support':
      return p.avgKp <= 55
    default:
      return p.avgKda < 2.2
  }
}

function playerImpactScore(p: PlayerPerformanceFact): number {
  switch (p.role) {
    case 'top':
      return p.avgGd15 * 0.35 + p.avgCsd15 * 8 + p.avgXpd15 * 0.15
    case 'jungle':
      return p.avgKp * 0.55 + p.avgKaPerMin * 120 + p.avgGd15 * 0.05
    case 'mid':
      return p.avgDmg * 0.55 + p.avgDmgGoldRatio * 18 + p.avgDmgPerGold * 8
    case 'adc':
      return p.avgDmg * 0.45 + p.avgDmgGoldRatio * 14 + p.avgKda * 0.25
    case 'support':
      return p.avgKp * 0.45 + p.avgKaPerMin * 100
    default:
      return p.avgDmg * 0.5 + p.avgKda * 0.3
  }
}

function annotatePlayer(
  p: PlayerPerformanceFact,
  bucket: SeriesBucket,
  seriesWinner: string,
): PlayerPerformanceFact {
  const notes: string[] = []
  const role = p.role

  if (p.champions.length) notes.push(`champs: ${p.champions.join(', ')}`)

  if (wonLaneEveryGame(bucket, p.name)) {
    const verb = role === 'jungle' ? 'outjungled' : 'outlaned'
    notes.push(`${verb} lane opponent every game`)
  }
  if (lostLaneEveryGame(bucket, p.name)) {
    const verb = role === 'jungle' ? 'outjungled by' : 'lost lane to'
    notes.push(`${verb} opponent every game`)
    if (p.team !== seriesWinner) {
      notes.push('gapped every single game — fraud watch candidate')
    }
  }

  if (p.team === seriesWinner && lostLaneEveryGame(bucket, p.name)) {
    notes.push('fraud watch — lost lane every game on the winning team (winning despite them)')
  }

  switch (role) {
    case 'top': {
      if (p.avgGd15 >= 120) notes.push(`${fmtSigned(p.avgGd15)} gd@15 avg — lane kingdom`)
      else if (p.avgGd15 >= 50) notes.push(`${fmtSigned(p.avgGd15)} gd@15 avg — won lane`)
      else if (p.avgGd15 <= -100) notes.push(`${fmtSigned(p.avgGd15)} gd@15 avg — got gapped`)
      if (Math.abs(p.avgXpd15) >= 80) notes.push(`${fmtSigned(p.avgXpd15)} xpd@15 avg`)
      if (Math.abs(p.avgCsd15) >= 8) notes.push(`${fmtSigned(p.avgCsd15, 1)} cs@15 diff avg`)
      break
    }
    case 'jungle': {
      if (p.avgKp >= 72) notes.push(`${p.avgKp.toFixed(0)}% kp — early facilitator`)
      else if (p.avgKp <= 45) notes.push(`${p.avgKp.toFixed(0)}% kp — low early impact`)
      if (p.avgKaPerMin >= 0.16) notes.push(`${p.avgKaPerMin.toFixed(2)} k+a/min — active map`)
      else if (p.avgKaPerMin <= 0.08) notes.push(`${p.avgKaPerMin.toFixed(2)} k+a/min — pretty inactive`)
      break
    }
    case 'mid': {
      if (p.avgDmg >= 30) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — hard carry`)
      else if (p.avgDmg >= 25) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — strong`)
      else if (p.avgDmg <= 20) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — quiet`)
      if (p.avgDmgGoldRatio >= 1.2) notes.push(`${p.avgDmgGoldRatio.toFixed(2)} dmg%/gold% — efficient carry`)
      else if (p.avgDmgGoldRatio > 0 && p.avgDmgGoldRatio <= 0.85) {
        notes.push(`${p.avgDmgGoldRatio.toFixed(2)} dmg%/gold% — ate gold, low impact`)
      }
      if (p.avgDmgPerGold >= 0.01) notes.push(`${p.avgDmgPerGold.toFixed(3)} dmg/gold`)
      break
    }
    case 'adc': {
      if (p.avgDmg >= 30) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — hard carry`)
      else if (p.avgDmg <= 22) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — low output`)
      if (p.avgKda >= 5) notes.push(`${p.avgKda.toFixed(1)} kda — clean positioning`)
      else if (p.avgKda < 2) notes.push(`${p.avgKda.toFixed(1)} kda — dying too much`)
      if (p.avgDmgGoldRatio >= 1.2) notes.push(`${p.avgDmgGoldRatio.toFixed(2)} dmg%/gold% — efficient`)
      else if (p.avgDmgGoldRatio > 0 && p.avgDmgGoldRatio <= 0.85) {
        notes.push(`${p.avgDmgGoldRatio.toFixed(2)} dmg%/gold% — resource hog`)
      }
      break
    }
    case 'support': {
      if (p.avgKp >= 75) notes.push(`${p.avgKp.toFixed(0)}% kp — everywhere`)
      else if (p.avgKp <= 52) notes.push(`${p.avgKp.toFixed(0)}% kp — low presence`)
      if (p.avgKaPerMin >= 0.14) notes.push(`${p.avgKaPerMin.toFixed(2)} k+a/min`)
      break
    }
    default: {
      if (p.avgDmg >= 28) notes.push(`${p.avgDmg.toFixed(0)}% dmg share`)
      if (p.avgKda >= 4) notes.push(`${p.avgKda.toFixed(1)} kda`)
      else if (p.avgKda < 2) notes.push(`${p.avgKda.toFixed(1)} kda — stinker`)
    }
  }

  if (p.team === seriesWinner && p.wins >= 2 && isStandoutByRole(p)) {
    notes.push('series standout')
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
    g.players.filter((p) => teamMatchesCanonical(p.team, team)).map((p) => p.gd15),
  )
  if (!vals.length) return 0
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function avgTeamGd15ForGame(game: SeriesBucket['games'][0], team: string): number {
  const roster = game.players.filter((p) => teamMatchesCanonical(p.team, team))
  if (!roster.length) return 0
  return roster.reduce((s, p) => s + p.gd15, 0) / roster.length
}

function buildEarlyGameHints(bucket: SeriesBucket, winner: string, loser: string): string[] {
  const ordered = [...bucket.games].sort(compareSeriesGames)
  const hints: string[] = []
  let competitiveGames = 0
  const throws: string[] = []

  for (let i = 0; i < ordered.length; i++) {
    const g = ordered[i]!
    if (teamMatchesCanonical(g.winner, loser)) continue

    const loserGd = avgTeamGd15ForGame(g, loser)
    const winnerGd = avgTeamGd15ForGame(g, winner)
    const gap = loserGd - winnerGd

    if (loserGd >= -80 && gap >= -150) competitiveGames++

    if (loserGd >= 400) {
      throws.push(
        `game ${i + 1}: ${recapTeamTag(loser)} had ~+${Math.round(loserGd)} team gd@15 but threw the lead`,
      )
    } else if (loserGd >= 180) {
      throws.push(
        `game ${i + 1}: ${recapTeamTag(loser)} led @15 (+${Math.round(loserGd)} gd) but still lost`,
      )
    }
  }

  if (competitiveGames >= 2 && ordered.length >= 2) {
    hints.push(
      `${recapTeamTag(loser)} hung around early (${competitiveGames}/${ordered.length} games competitive @15) before getting outscaled`,
    )
  }
  hints.push(...throws)
  return hints
}

function buildNarrativeHints(opts: {
  reverseSweep: boolean
  droppedGame1: boolean
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
    hints.push(`${recapTeamTag(opts.leadBlownBy)} blew a 2-0 lead and got reverse swept`)
  } else if (opts.reverseSweep) {
    hints.push(`${recapTeamTag(opts.winner)} came back from 0-2 to win the series`)
  } else if (opts.droppedGame1) {
    hints.push(`${recapTeamTag(opts.winner)} dropped game 1 then rallied`)
  }
  if (opts.blowout) hints.push('clean sweep — no games dropped')
  if (opts.upset) hints.push(`${recapTeamTag(opts.winner)} upset the higher split-WR favorite`)
  if (opts.messySeries) hints.push('back-and-forth series — multiple momentum swings')
  if (opts.seriesStreak >= 3) hints.push(`${recapTeamTag(opts.winner)} on a ${opts.seriesStreak}-series win streak`)
  else if (opts.seriesStreak >= 2) hints.push(`${recapTeamTag(opts.winner)} building momentum (${opts.seriesStreak} series wins)`)
  if (opts.victimSlump >= 2) {
    hints.push(
      `${recapTeamTag(opts.loser)} on a ${opts.victimSlump}-series losing streak (count completed series only, not individual games)`,
    )
  }
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

  const ordered = [...bucket.games].sort(compareSeriesGames)
  const momentum = analyzeSeriesMomentum(bucket.games, winner)
  const { reverseSweep, droppedGame1, leadBlownBy } = momentum
  const messySeries = vicWins >= 2 && domWins >= 2 && bucket.games.length >= 4

  const winnerStars = winPlayers
    .filter((p) => isStandoutByRole(p) || p.notes.some((n) => n.includes('standout')))
    .sort((a, b) => playerImpactScore(b) - playerImpactScore(a))
    .slice(0, 4)

  const winnerConcerns = winPlayers
    .filter((p) => isConcernByRole(p))
    .sort((a, b) => playerImpactScore(a) - playerImpactScore(b))
    .slice(0, 3)

  const loserStinkers = losePlayers
    .filter((p) => isConcernByRole(p))
    .sort((a, b) => playerImpactScore(a) - playerImpactScore(b))
    .slice(0, 3)

  const loserBrightSpots = losePlayers
    .filter((p) => isStandoutByRole(p))
    .sort((a, b) => playerImpactScore(b) - playerImpactScore(a))
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

  const narrativeHints = [
    ...buildNarrativeHints({
      reverseSweep,
      droppedGame1,
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
    }),
    ...buildEarlyGameHints(bucket, winnerCanon, loserCanon),
  ]

  const laneDuelPlayer = laneDuel
    ? playerStats.find((p) => p.name === laneDuel.dominator)
    : null

  const participants: SeriesParticipant[] = playerStats.map((p) => ({
    ign: p.name.toLowerCase(),
    team: p.team,
    role: p.role,
    champions: p.champions.map((c) => c.toLowerCase()),
  }))

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
    reverseSweep,
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
    participants,
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
