import type { Champion, Team } from '../hooks/useDashboardData'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
import { findTeamByName } from './teamAnalytics'
import { type RoleKey } from './playerRadar'
import { recapTeamTag } from './recapTeamTag'
import { analyzeSeriesMomentum } from './seriesMomentum'
import { compareSeriesGames } from './seriesGrouping'
import { findPocketPick } from './recapPocketPick'

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
  /** True when "fraud" slang is appropriate — top-tier team / expected star, not a weak-side underdog. */
  fraudEligible?: boolean
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
  /** Display label e.g. "2026 MSI" — use for stakes / advancement copy. */
  tournamentLabel: string
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
    league?: string
    split?: string
    playoffs?: boolean
    rawSplit?: string
    oeYear?: string
  }>
}

export interface TournamentSeriesRef {
  date: string
  winner: string
  loser: string
  league: string
  tournamentLabel: string
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

/** GD@15 lane dominance is meaningful for solo lanes (top/mid), not bot-lane shared gold. */
function roleUsesLaneGold(role: RoleKey | null): boolean {
  return role === 'top' || role === 'mid'
}

function lostLaneEveryGame(bucket: SeriesBucket, playerName: string): boolean {
  const gamesPlayed = bucket.games.filter((g) => g.players.some((p) => p.name === playerName))
  if (gamesPlayed.length < 2) return false
  for (const g of gamesPlayed) {
    const me = g.players.find((p) => p.name === playerName)
    if (!me?.role || !roleUsesLaneGold(me.role)) return false
    const opp = g.players.find((p) => p.role === me.role && p.team !== me.team)
    // Require a meaningful gap — ~500 gold is slight, not a stomp.
    if (!opp || me.gd15 >= opp.gd15 - 200) return false
  }
  return true
}

function wonLaneEveryGame(bucket: SeriesBucket, playerName: string): boolean {
  const gamesPlayed = bucket.games.filter((g) => g.players.some((p) => p.name === playerName))
  if (gamesPlayed.length < 2) return false
  for (const g of gamesPlayed) {
    const me = g.players.find((p) => p.name === playerName)
    if (!me?.role || !roleUsesLaneGold(me.role)) return false
    const opp = g.players.find((p) => p.role === me.role && p.team !== me.team)
    if (!opp || me.gd15 <= opp.gd15 + 200) return false
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

/** Global power rank map: canonical team name (lowercase) → rank (1 = best). */
export type PowerRankMap = Map<string, number>

export interface MatchupContext {
  favorite: string | null
  underdog: string | null
  rankWinner: number | null
  rankLoser: number | null
  /** Positive when winner was favored (underdog lost as expected). */
  rankGap: number | null
  /** True when `team` was a significant underdog in this series. */
  isSignificantUnderdog: (team: string) => boolean
  /** True when `team` was favorite or near-even (not a big underdog). */
  isFavoriteSide: (team: string) => boolean
  summary: string
}

function powerRankFor(map: PowerRankMap | undefined, team: string): number | null {
  if (!map?.size) return null
  return map.get(resolveTeamCanonicalName(team).toLowerCase()) ?? null
}

/**
 * Favorite / underdog from global power ranks, else split winrate gap.
 * Significant underdogs (e.g. TL #16 vs T1 #2) never get fraud labels.
 */
export function buildMatchupContext(
  winner: string,
  loser: string,
  teams: Team[],
  powerRanks?: PowerRankMap,
): MatchupContext {
  const w = resolveTeamCanonicalName(winner)
  const l = resolveTeamCanonicalName(loser)
  const rankW = powerRankFor(powerRanks, w)
  const rankL = powerRankFor(powerRanks, l)

  let favorite: string | null = null
  let underdog: string | null = null
  let rankGap: number | null = null

  if (rankW != null && rankL != null) {
    // Lower rank number = stronger team.
    rankGap = rankL - rankW
    if (rankGap >= 3) {
      favorite = w
      underdog = l
    } else if (rankGap <= -3) {
      favorite = l
      underdog = w
      rankGap = -rankGap
    } else {
      rankGap = Math.abs(rankGap)
    }
  } else {
    const wrW = splitWinrate(teams, w)
    const wrL = splitWinrate(teams, l)
    const wrGap = wrW - wrL
    if (wrGap >= 12) {
      favorite = w
      underdog = l
      rankGap = Math.round(wrGap / 4)
    } else if (wrGap <= -12) {
      favorite = l
      underdog = w
      rankGap = Math.round(-wrGap / 4)
    }
  }

  const isSignificantUnderdog = (team: string) => {
    const t = resolveTeamCanonicalName(team)
    if (underdog && teamMatchesCanonical(t, underdog) && (rankGap ?? 0) >= 5) return true
    if (rankW != null && rankL != null) {
      const r = teamMatchesCanonical(t, w) ? rankW : teamMatchesCanonical(t, l) ? rankL : null
      const opp = teamMatchesCanonical(t, w) ? rankL : teamMatchesCanonical(t, l) ? rankW : null
      if (r != null && opp != null && r - opp >= 5) return true
    }
    return false
  }

  const isFavoriteSide = (team: string) => {
    const t = resolveTeamCanonicalName(team)
    if (isSignificantUnderdog(t)) return false
    if (favorite && teamMatchesCanonical(t, favorite)) return true
    if (!favorite && !underdog) {
      // Even matchup — either side can be fraud-eligible if they underperform.
      return true
    }
    // Slight underdog (gap 3–4): still not fraud-eligible.
    if (underdog && teamMatchesCanonical(t, underdog)) return false
    return true
  }

  const rankBit = (team: string, rank: number | null) =>
    rank != null ? `${recapTeamTag(team)} (#${rank})` : recapTeamTag(team)

  let summary: string
  if (favorite && underdog && rankGap != null && rankGap >= 5) {
    summary =
      `${rankBit(favorite, powerRankFor(powerRanks, favorite))} heavily favored over ` +
      `${rankBit(underdog, powerRankFor(powerRanks, underdog))} — underdog poor performances are expected, NEVER fraud`
  } else if (favorite && underdog) {
    summary =
      `${rankBit(favorite, powerRankFor(powerRanks, favorite))} favored over ` +
      `${rankBit(underdog, powerRankFor(powerRanks, underdog))} — only fraud the favorite side if they underperform`
  } else {
    summary = 'relatively even matchup — fraud only for expected stars who massively underperformed'
  }

  return {
    favorite,
    underdog,
    rankWinner: rankW,
    rankLoser: rankL,
    rankGap,
    isSignificantUnderdog,
    isFavoriteSide,
    summary,
  }
}

/**
 * "Fraud" only for perceived top-tier / favored-side players who underperformed.
 * Significant underdogs (e.g. Pun on TSW vs Zeus/HLE, Morgan on TL vs T1) are never fraud.
 */
function isFraudEligible(
  p: PlayerPerformanceFact,
  matchup: MatchupContext,
): boolean {
  if (matchup.isSignificantUnderdog(p.team)) return false
  if (!matchup.isFavoriteSide(p.team)) return false
  return true
}

function annotatePlayer(
  p: PlayerPerformanceFact,
  bucket: SeriesBucket,
  seriesWinner: string,
  _teams: Team[],
  matchup: MatchupContext,
): PlayerPerformanceFact {
  const notes: string[] = []
  const role = p.role
  const fraudEligible = isFraudEligible(p, matchup)

  if (p.champions.length) notes.push(`champs: ${p.champions.join(', ')}`)

  // Solo-lane GD@15 only — never call ADC/support "gapped" from bot-lane gold share.
  if (roleUsesLaneGold(role) && wonLaneEveryGame(bucket, p.name)) {
    notes.push(`outlaned opponent every game`)
  }
  if (roleUsesLaneGold(role) && lostLaneEveryGame(bucket, p.name)) {
    notes.push(`lost lane to opponent every game`)
    if (p.team !== seriesWinner && p.avgGd15 <= -800) {
      if (fraudEligible) {
        notes.push(
          'heavily gapped in lane — fraud watch candidate (favored/top-tier side, expected to perform)',
        )
      } else if (matchup.isSignificantUnderdog(p.team)) {
        notes.push(
          'heavily gapped in lane — expected vs a much stronger opponent (NOT fraud)',
        )
      } else {
        notes.push('heavily gapped in lane — stinker (not a fraud-eligible favorite)')
      }
    } else if (p.team !== seriesWinner) {
      notes.push('slightly outlaned early — not a full gap')
    }
  }

  if (
    p.team === seriesWinner &&
    roleUsesLaneGold(role) &&
    lostLaneEveryGame(bucket, p.name) &&
    p.avgGd15 <= -800
  ) {
    notes.push(
      fraudEligible
        ? 'fraud watch — lost lane every game on the winning team (carried by teammates)'
        : 'lost lane every game despite series win — teammates hard 1v9 (not fraud)',
    )
  }

  switch (role) {
    case 'top': {
      // Early laning is the primary signal for tops.
      if (p.avgGd15 >= 800) notes.push(`${fmtSigned(p.avgGd15)} gd@15 avg — lane kingdom`)
      else if (p.avgGd15 >= 300) notes.push(`${fmtSigned(p.avgGd15)} gd@15 avg — won lane`)
      else if (p.avgGd15 >= 100) notes.push(`${fmtSigned(p.avgGd15)} gd@15 avg — slight lane edge`)
      else if (p.avgGd15 <= -800) notes.push(`${fmtSigned(p.avgGd15)} gd@15 avg — heavily gapped`)
      else if (p.avgGd15 <= -300) notes.push(`${fmtSigned(p.avgGd15)} gd@15 avg — lost lane`)
      if (Math.abs(p.avgXpd15) >= 80) notes.push(`${fmtSigned(p.avgXpd15)} xpd@15 avg`)
      if (Math.abs(p.avgCsd15) >= 8) notes.push(`${fmtSigned(p.avgCsd15, 1)} cs@15 diff avg`)
      break
    }
    case 'jungle': {
      // Map activity / early influence — not solo-lane gold.
      if (p.avgKp >= 72) notes.push(`${p.avgKp.toFixed(0)}% kp — early facilitator`)
      else if (p.avgKp <= 45) notes.push(`${p.avgKp.toFixed(0)}% kp — low early impact`)
      if (p.avgKaPerMin >= 0.16) notes.push(`${p.avgKaPerMin.toFixed(2)} k+a/min — active map`)
      else if (p.avgKaPerMin <= 0.08) notes.push(`${p.avgKaPerMin.toFixed(2)} k+a/min — pretty inactive`)
      break
    }
    case 'mid': {
      // Carry impact: damage share / efficiency. GD@15 only as secondary lane note.
      if (p.avgDmg >= 30) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — hard carry`)
      else if (p.avgDmg >= 25) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — strong`)
      else if (p.avgDmg <= 20) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — quiet`)
      if (p.avgDmgGoldRatio >= 1.2) notes.push(`${p.avgDmgGoldRatio.toFixed(2)} dmg%/gold% — efficient carry`)
      else if (p.avgDmgGoldRatio > 0 && p.avgDmgGoldRatio <= 0.85) {
        notes.push(`${p.avgDmgGoldRatio.toFixed(2)} dmg%/gold% — ate gold, low impact`)
      }
      if (p.avgGd15 >= 400) notes.push(`${fmtSigned(p.avgGd15)} gd@15 — also won lane`)
      else if (p.avgGd15 <= -800) notes.push(`${fmtSigned(p.avgGd15)} gd@15 — lost lane hard`)
      break
    }
    case 'adc': {
      // Carry roles: dmg share / efficiency. Never lead with GD@15 (bot shares gold).
      if (p.avgDmg >= 30) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — hard carry`)
      else if (p.avgDmg >= 25) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — solid output`)
      else if (p.avgDmg <= 22) notes.push(`${p.avgDmg.toFixed(0)}% dmg share — low output`)
      if (p.avgKda >= 5) notes.push(`${p.avgKda.toFixed(1)} kda — clean positioning`)
      else if (p.avgKda < 2) notes.push(`${p.avgKda.toFixed(1)} kda — dying too much`)
      if (p.avgDmgGoldRatio >= 1.2) notes.push(`${p.avgDmgGoldRatio.toFixed(2)} dmg%/gold% — efficient`)
      else if (p.avgDmgGoldRatio > 0 && p.avgDmgGoldRatio <= 0.85) {
        notes.push(`${p.avgDmgGoldRatio.toFixed(2)} dmg%/gold% — resource hog`)
      }
      // Optional mild bot-lane note only at extreme gaps; never "completely gapped".
      if (p.avgGd15 <= -1000) {
        notes.push(`${fmtSigned(p.avgGd15)} bot gd@15 — bot lane was starved early (shared gold, not solo gap)`)
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

  return { ...p, notes: [...new Set(notes)], fraudEligible }
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
    let aImpactWins = 0
    for (const { a, b } of perGame) {
      // Solo-lane gold only for top/mid; jungle/support use KP; carries use damage.
      if (role === 'top' || role === 'mid') {
        if (a.gd15 > b.gd15 + 200) aLaneWins++
      } else if (role === 'jungle' || role === 'support') {
        if (a.kp > b.kp) aImpactWins++
      }
      if (a.dmgShare > b.dmgShare) aDmgWins++
    }
    const bLaneWins = roleUsesLaneGold(role) ? perGame.length - aLaneWins : 0
    const bDmgWins = perGame.length - aDmgWins
    const bImpactWins =
      role === 'jungle' || role === 'support' ? perGame.length - aImpactWins : 0
    const sample = perGame[0]!

    const candidates: LaneDuelDomination[] = []
    const aWonLane = roleUsesLaneGold(role) && aLaneWins === perGame.length
    const bWonLane = roleUsesLaneGold(role) && bLaneWins === perGame.length
    const aWonDmg = (role === 'mid' || role === 'adc') && aDmgWins === perGame.length
    const bWonDmg = (role === 'mid' || role === 'adc') && bDmgWins === perGame.length
    const aWonImpact =
      (role === 'jungle' || role === 'support') && aImpactWins === perGame.length
    const bWonImpact =
      (role === 'jungle' || role === 'support') && bImpactWins === perGame.length

    if (aWonLane || aWonDmg || aWonImpact) {
      candidates.push({
        dominator: sample.a.name,
        victim: sample.b.name,
        role,
        games: perGame.length,
        wonLaneEveryGame: aWonLane,
        wonDmgEveryGame: aWonDmg || aWonImpact,
      })
    }
    if (bWonLane || bWonDmg || bWonImpact) {
      candidates.push({
        dominator: sample.b.name,
        victim: sample.a.name,
        role,
        games: perGame.length,
        wonLaneEveryGame: bWonLane,
        wonDmgEveryGame: bWonDmg || bWonImpact,
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
  tournamentLabel: string
  matchup: MatchupContext
}): string[] {
  const hints: string[] = []
  const event = opts.tournamentLabel || 'this event'
  if (opts.leadBlownBy) {
    hints.push(`${recapTeamTag(opts.leadBlownBy)} blew a 2-0 lead and got reverse swept`)
  } else if (opts.reverseSweep) {
    hints.push(`${recapTeamTag(opts.winner)} came back from 0-2 to win the series`)
  } else if (opts.droppedGame1) {
    hints.push(`${recapTeamTag(opts.winner)} dropped game 1 then rallied`)
  }
  if (opts.blowout) hints.push('clean sweep — no games dropped')
  if (opts.upset) hints.push(`${recapTeamTag(opts.winner)} upset the higher-ranked / higher-WR favorite`)
  if (opts.messySeries) hints.push('back-and-forth series — multiple momentum swings')

  // Streaks are tournament-scoped only (e.g. MSI series, not LEC playoffs bleed-in).
  if (opts.seriesStreak >= 3) {
    hints.push(
      `${recapTeamTag(opts.winner)} on a ${opts.seriesStreak}-series win streak within ${event} only (ignore other splits/leagues)`,
    )
  } else if (opts.seriesStreak >= 2) {
    hints.push(
      `${recapTeamTag(opts.winner)} building momentum in ${event} (${opts.seriesStreak} series wins in this event only)`,
    )
  }
  if (opts.victimSlump >= 2) {
    hints.push(
      `${recapTeamTag(opts.loser)} on a ${opts.victimSlump}-series losing streak within ${event} only (not career/other splits)`,
    )
  }

  hints.push(`matchup context: ${opts.matchup.summary}`)
  if (opts.matchup.rankWinner != null || opts.matchup.rankLoser != null) {
    hints.push(
      `power ranks: ${recapTeamTag(opts.winner)}` +
        (opts.matchup.rankWinner != null ? ` #${opts.matchup.rankWinner}` : ' (unranked)') +
        ` vs ${recapTeamTag(opts.loser)}` +
        (opts.matchup.rankLoser != null ? ` #${opts.matchup.rankLoser}` : ' (unranked)'),
    )
  }

  if (opts.domSplitWr >= 65) hints.push(`${recapTeamTag(opts.winner)} strong split form (${opts.domSplitWr.toFixed(0)}% WR)`)
  if (opts.vicSplitWr >= 65 && opts.upset) {
    hints.push(`${recapTeamTag(opts.loser)} entered as split favorite (${opts.vicSplitWr.toFixed(0)}% WR)`)
  }
  return hints
}

function seriesTournamentLabel(bucket: SeriesBucket, fallbackLeague: string): string {
  const g = bucket.games[0]
  if (!g) return fallbackLeague
  const year = g.oeYear ?? g.date?.slice(0, 4) ?? ''
  const league = (g.league ?? fallbackLeague).toUpperCase()
  if (['MSI', 'WLDS', 'WORLDS', 'FST', 'FIRST STAND'].includes(league)) {
    const name =
      league === 'WLDS' || league === 'WORLDS'
        ? 'Worlds'
        : league === 'FST' || league === 'FIRST STAND'
          ? 'First Stand'
          : 'MSI'
    return year ? `${year} ${name}` : name
  }
  const split = g.split ?? ''
  if (split) return split
  return year ? `${year} ${league}` : league
}

export type BracketContext = {
  blockName?: string | null
  bracket?: 'upper' | 'lower' | 'play-in' | 'grand-final' | 'final' | 'unknown'
  /** Loser has a later fixture in this tournament (OE peers or Cito schedule). */
  loserContinues?: boolean
  /** Winner has a later fixture in this tournament. */
  winnerContinues?: boolean
  formatId?: string | null
  structure?: 'double_elim' | 'single_elim' | 'swiss' | 'groups' | 'round_robin' | 'unknown' | null
  lossCanEliminateWithoutLower?: boolean | null
}

function buildTournamentImplicationHints(
  winner: string,
  loser: string,
  date: string,
  tournamentLabel: string,
  league: string,
  peers: TournamentSeriesRef[],
  bracketCtx?: BracketContext,
): string[] {
  const hints: string[] = []
  const intl = ['MSI', 'WLDS', 'WORLDS', 'FST', 'FIRST STAND'].includes(league.toUpperCase())
  if (!intl && !/playoff/i.test(tournamentLabel)) return hints

  const sameEvent = peers.filter(
    (p) =>
      p.tournamentLabel === tournamentLabel ||
      p.league.toUpperCase() === league.toUpperCase(),
  )
  const laterWinner = sameEvent
    .filter(
      (p) =>
        p.date > date &&
        (teamMatchesCanonical(p.winner, winner) || teamMatchesCanonical(p.loser, winner)),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  const laterLoser = sameEvent.filter(
    (p) =>
      p.date > date &&
      (teamMatchesCanonical(p.winner, loser) || teamMatchesCanonical(p.loser, loser)),
  )
  const priorWinner = sameEvent.filter(
    (p) =>
      p.date < date &&
      (teamMatchesCanonical(p.winner, winner) || teamMatchesCanonical(p.loser, winner)),
  )
  const priorLoser = sameEvent.filter(
    (p) =>
      p.date < date &&
      (teamMatchesCanonical(p.winner, loser) || teamMatchesCanonical(p.loser, loser)),
  )

  const loserContinues = Boolean(bracketCtx?.loserContinues) || laterLoser.length > 0
  const winnerContinues = Boolean(bracketCtx?.winnerContinues) || laterWinner.length > 0
  const bracket = bracketCtx?.bracket ?? 'unknown'
  const block = (bracketCtx?.blockName ?? '').trim()
  const structure = bracketCtx?.structure ?? null
  const doubleElim =
    structure === 'double_elim' ||
    bracket === 'upper' ||
    bracket === 'lower' ||
    /upper|lower/.test(block.toLowerCase())
  const singleElimNoLower =
    bracketCtx?.lossCanEliminateWithoutLower === true ||
    structure === 'single_elim' ||
    structure === 'swiss'

  // Play-in / qualification final: same matchup earlier in the event, loser has no further games.
  const priorMeeting = sameEvent.find(
    (p) =>
      p.date < date &&
      ((teamMatchesCanonical(p.winner, winner) && teamMatchesCanonical(p.loser, loser)) ||
        (teamMatchesCanonical(p.winner, loser) && teamMatchesCanonical(p.loser, winner))),
  )

  if (bracketCtx?.formatId) {
    hints.push(
      `tournament format: ${bracketCtx.formatId}` +
        (structure ? ` (${structure.replace('_', '-')})` : ''),
    )
  }

  // Upper-bracket loss → lower bracket, NOT elimination.
  if ((bracket === 'upper' || (doubleElim && bracket === 'unknown' && !singleElimNoLower)) && !loserContinues) {
    if (bracket === 'upper' || doubleElim) {
      hints.push(
        `${tournamentLabel} is double-elimination — ${recapTeamTag(winner)} advances in winners, ${recapTeamTag(loser)} drops to the lower bracket (not eliminated / not going home)`,
      )
    }
  } else if (loserContinues) {
    // Handled below with next-opponent detail when available.
  } else if (
    (bracket === 'play-in' || /play[\s-]?in/i.test(block)) &&
    priorMeeting &&
    !loserContinues &&
    intl
  ) {
    hints.push(
      `${tournamentLabel} play-in finals stakes — ${recapTeamTag(winner)} advances to the main bracket, ${recapTeamTag(loser)} is eliminated and sent home`,
    )
  } else if (bracket === 'grand-final' && !winnerContinues && !loserContinues) {
    hints.push(
      `${recapTeamTag(winner)} wins ${tournamentLabel} — tournament champions`,
    )
    hints.push(
      `${tournamentLabel} grand final — ${recapTeamTag(loser)} finishes runner-up (eliminated)`,
    )
  } else if (bracket === 'final' && !winnerContinues && !loserContinues && !doubleElim) {
    hints.push(
      `${recapTeamTag(winner)} wins ${tournamentLabel} — tournament champions`,
    )
    hints.push(
      `${tournamentLabel} final — ${recapTeamTag(loser)} is eliminated from ${tournamentLabel}`,
    )
  } else if (bracket === 'lower' && !loserContinues) {
    hints.push(
      `${tournamentLabel} elimination stakes — ${recapTeamTag(loser)} is eliminated from ${tournamentLabel}`,
    )
  } else if (
    singleElimNoLower &&
    !loserContinues &&
    !doubleElim &&
    (bracket === 'final' || bracket !== 'unknown' || priorLoser.length >= 1)
  ) {
    // Worlds knockout / First Stand / single-elim: a loss can send a team home.
    hints.push(
      `${tournamentLabel} is single-elim / no lower bracket — ${recapTeamTag(loser)} is eliminated from ${tournamentLabel}`,
    )
  } else if (
    intl &&
    !loserContinues &&
    !winnerContinues &&
    priorWinner.length >= 1 &&
    priorLoser.length >= 1 &&
    bracket !== 'upper' &&
    !doubleElim &&
    bracket !== 'unknown'
  ) {
    const latestEventDate = sameEvent.reduce(
      (max, p) => (p.date > max ? p.date : max),
      date,
    )
    if (date >= latestEventDate) {
      hints.push(
        `${tournamentLabel} stage stakes — ${recapTeamTag(winner)} advances, ${recapTeamTag(loser)} is eliminated from ${tournamentLabel}`,
      )
    }
  } else if (intl && !loserContinues && (bracket === 'unknown' || doubleElim) && !priorMeeting) {
    // Incomplete peer history in a double-elim event: do NOT invent "going home".
    if (doubleElim) {
      hints.push(
        `${tournamentLabel} uses a double-elimination bracket — do not assume ${recapTeamTag(loser)} is eliminated without lower-bracket / upcoming-match confirmation`,
      )
    }
  }

  if (laterWinner.length) {
    const next = laterWinner[0]!
    const opp = teamMatchesCanonical(next.winner, winner) ? next.loser : next.winner
    hints.push(
      `${recapTeamTag(winner)} advances and next faces ${recapTeamTag(opp)} in ${tournamentLabel}`,
    )
  } else if (winnerContinues && bracket === 'upper') {
    hints.push(`${recapTeamTag(winner)} continues in the ${tournamentLabel} upper bracket`)
  }

  if (laterLoser.length) {
    const nextL = laterLoser.sort((a, b) => a.date.localeCompare(b.date))[0]!
    const oppL = teamMatchesCanonical(nextL.winner, loser) ? nextL.loser : nextL.winner
    hints.push(
      `${recapTeamTag(loser)} continues in ${tournamentLabel} (next: ${recapTeamTag(oppL)}) — not eliminated`,
    )
  } else if (loserContinues || bracket === 'upper' || (doubleElim && !singleElimNoLower && !loserContinues && bracket === 'unknown')) {
    if (loserContinues || bracket === 'upper') {
      hints.push(
        `${recapTeamTag(loser)} continues in ${tournamentLabel}${bracket === 'upper' || doubleElim ? ' via the lower bracket' : ''} — not eliminated / not going home`,
      )
    }
  }

  return hints
}

export function buildSeriesFacts(
  bucket: SeriesBucket,
  teams: Team[],
  _weekCounts: Map<string, number>,
  opts: {
    blowout: boolean
    seriesStreak: number
    victimSlump: number
    /** Player ign → champion → career/split games (for pocket-pick gating). */
    playerChampGames?: Map<string, Map<string, number>>
    /** Other series in the same event window (for advancement / elimination). */
    tournamentPeers?: TournamentSeriesRef[]
    /** Cito / bracket context so we don't invent "going home" on upper-bracket losses. */
    bracketContext?: BracketContext
    /** Split-level champion meta for rare/off-role pocket picks. */
    champions?: Champion[]
    /** Global power ranks (1 = best) for favorite/underdog fraud gating. */
    powerRanks?: PowerRankMap
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
  // Prefer game league (MSI/Worlds) over team's home region (LCK/LEC/…).
  const gameLeague = (bucket.games[0]?.league ?? teamLeague(teams, winner)).toUpperCase()
  const league = gameLeague === 'WLDS' ? 'WORLDS' : gameLeague
  const tournamentLabel = seriesTournamentLabel(bucket, league)
  const orderedDates = [...bucket.games].sort((a, b) => a.date.localeCompare(b.date))
  const latestDate = orderedDates[orderedDates.length - 1]?.date ?? bucket.games[0]?.date ?? ''

  const matchup = buildMatchupContext(winnerCanon, loserCanon, teams, opts.powerRanks)

  const playerStats = aggregateSeriesPlayerStats(bucket).map((p) =>
    annotatePlayer(p, bucket, winner, teams, matchup),
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

  // Pocket pick: bottom-5% presence (not a recent riser) or off-role surprise.
  const pocketHit = findPocketPick(
    winPlayers.map((p) => ({
      name: p.name,
      champions: p.champions,
      role: p.role,
      avgKda: p.avgKda,
    })),
    opts.champions ?? [],
    latestDate,
    opts.playerChampGames,
  )
  const pocketPick = pocketHit
    ? { name: pocketHit.name, champion: pocketHit.champion, role: pocketHit.role }
    : null

  const gameFlow = ordered.map((g, i) => ({
    game: i + 1,
    winnerAbbr: recapTeamTag(g.winner),
  }))

  const narrativeHints = [
    `tournament: ${tournamentLabel}`,
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
      tournamentLabel,
      matchup,
    }),
    ...buildEarlyGameHints(bucket, winnerCanon, loserCanon),
    ...buildTournamentImplicationHints(
      winnerCanon,
      loserCanon,
      latestDate,
      tournamentLabel,
      league,
      opts.tournamentPeers ?? [],
      opts.bracketContext,
    ),
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
    tournamentLabel,
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
