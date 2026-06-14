import type { Player, PlayerGameLog, Team } from '../hooks/useDashboardData'
import { resolveTeamCanonicalName } from './entities/slugs'
import { findTeamByName } from './teamAnalytics'
import { normalizePosition, type RoleKey } from './playerRadar'
import { buildSeriesFacts, type SeriesFacts } from './recapFacts'
import { recapTeamTag } from './recapTeamTag'

export type { SeriesFacts }

export interface WeeklyRecapWindow {
  start: Date
  end: Date
  label: string
}

export type WeeklyRecapSegment =
  | { kind: 'text'; value: string }
  | { kind: 'team'; canonicalName: string; label: string }

/** Re-apply official abbrev tags to cached team segments (fixes stale KR/TW labels in DB). */
export function normalizeRecapSegmentLabels(segments: WeeklyRecapSegment[]): WeeklyRecapSegment[] {
  return segments.map((seg) =>
    seg.kind === 'team' ? { ...seg, label: recapTeamTag(seg.canonicalName) } : seg,
  )
}

export interface WeeklyRecapLine {
  id: string
  date: string
  dateLabel: string
  segments: WeeklyRecapSegment[]
  score: WeeklyRecapScore
}

export interface WeeklyRecapScore {
  winner: string
  loser: string
  winnerAbbr: string
  loserAbbr: string
  score: string
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

interface ParsedGame {
  id: string
  date: string
  winner: string
  loser: string
  players: GamePlayer[]
}

interface SeriesBucket {
  teamA: string
  teamB: string
  games: ParsedGame[]
}

interface LaneGapInfo {
  gapper: string
  gapped: string
  gapperTeam: string
  role: RoleKey
  gap: number
}

interface TeamGameRecord {
  id: string
  date: string
  opponent: string
  won: boolean
}

interface HistoricalSeries {
  opponent: string
  wins: number
  losses: number
  lastDate: string
}

interface LaneDuelDomination {
  dominator: string
  victim: string
  role: RoleKey
  games: number
  avgGd15Lead: number
  wonLaneEveryGame: boolean
  wonDmgEveryGame: boolean
}

interface SeriesPlayerStats {
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

interface PocketPickStats extends SeriesPlayerStats {
  pocketChamp: string
}

interface SeriesContext {
  kind: string
  priority: number
  segments: WeeklyRecapSegment[]
}

const ROLE_CHAT: Record<RoleKey, string> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'mid',
  adc: 'bot',
  support: 'support',
}

/** GD@15 advantage phrasing — jungle is not a lane. */
function roleAdvantageVerb(role: RoleKey): 'outlaned' | 'outjungled' {
  return role === 'jungle' ? 'outjungled' : 'outlaned'
}

const MAX_CONTEXT_CLAUSES = 3

class RecapLedger {
  private families = new Set<string>()

  claim(family: string): boolean {
    if (this.families.has(family)) return false
    this.families.add(family)
    return true
  }

  pick<T>(key: string, salt: number, options: T[]): T {
    if (!options.length) throw new Error('empty options')
    return options[(hashKey(key) + salt) % options.length]!
  }
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(a: string, b: string): number {
  const da = parseDate(a)
  const db = parseDate(b)
  if (!da || !db) return 999
  return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24)
}

import { formatGameDate } from './format'

export function formatRecapDate(iso: string): string {
  return formatGameDate(iso)
}

function inWindow(log: PlayerGameLog, window: WeeklyRecapWindow): boolean {
  const d = parseDate(log.date)
  if (!d) return false
  return d >= window.start && d <= window.end
}

function playerLabel(name: string): string {
  return name.toLowerCase()
}

function champLabel(champ: string): string {
  return champ.toLowerCase()
}

function teamLeague(teams: Team[], name: string): string {
  const t = findTeamByName(teams, name)
  return (t?.league ?? 'LCK').toUpperCase()
}

function hashKey(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0
  }
  return h
}

function segText(value: string): WeeklyRecapSegment {
  return { kind: 'text', value }
}

function segTeam(name: string): WeeklyRecapSegment {
  const canonical = resolveTeamCanonicalName(name)
  return {
    kind: 'team',
    canonicalName: canonical,
    label: recapTeamTag(name),
  }
}

function collectWeeklyGames(players: Player[], window: WeeklyRecapWindow): ParsedGame[] {
  const seen = new Set<string>()
  const games: ParsedGame[] = []

  for (const player of players) {
    for (const g of player.gameLog ?? []) {
      if (!inWindow(g, window)) continue
      const id = g.gameId ?? `${g.date}|${player.team}|${g.opponent ?? ''}|${g.result}`
      if (seen.has(id)) continue
      seen.add(id)

      const opponent = g.opponent?.trim()
      if (!opponent) continue
      const won = g.result === 1
      const winner = won ? player.team : opponent
      const loser = won ? opponent : player.team

      const roster: GamePlayer[] = []
      for (const p of players) {
        for (const pg of p.gameLog ?? []) {
          const pgId = pg.gameId ?? `${pg.date}|${p.team}|${pg.opponent ?? ''}|${pg.result}`
          if (pgId !== id) continue
          roster.push({
            team: p.team,
            name: p.name,
            champion: pg.champion,
            role: normalizePosition(p.position),
            kda: pg.kda,
            gd15: pg.gd15,
            kp: pg.kp ?? 0,
            dmgShare: pg.dmgShare ?? 0,
            won: pg.result === 1,
          })
        }
      }

      games.push({ id, date: g.date, winner, loser, players: roster })
    }
  }

  return games.sort((a, b) => a.date.localeCompare(b.date))
}

function collectTeamGames(players: Player[], team: string): TeamGameRecord[] {
  const seen = new Set<string>()
  const games: TeamGameRecord[] = []

  for (const player of players) {
    if (player.team !== team) continue
    for (const g of player.gameLog ?? []) {
      const id = g.gameId ?? `${g.date}|${player.team}|${g.opponent ?? ''}|${g.result}`
      if (seen.has(id)) continue
      seen.add(id)
      const opponent = g.opponent?.trim()
      if (!opponent) continue
      games.push({
        id,
        date: g.date,
        opponent,
        won: g.result === 1,
      })
    }
  }

  return games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

function groupTeamSeriesHistory(games: TeamGameRecord[]): HistoricalSeries[] {
  if (!games.length) return []
  const out: HistoricalSeries[] = []
  let bucket: TeamGameRecord[] = [games[0]!]

  for (let i = 1; i < games.length; i++) {
    const g = games[i]!
    const last = bucket[bucket.length - 1]!
    const sameOpp = g.opponent === last.opponent
    const closeDates = daysBetween(last.date, g.date) <= 5
    if (sameOpp && closeDates) {
      bucket.push(g)
    } else {
      out.push(summarizeHistoricalSeries(bucket))
      bucket = [g]
    }
  }
  out.push(summarizeHistoricalSeries(bucket))
  return out
}

function summarizeHistoricalSeries(games: TeamGameRecord[]): HistoricalSeries {
  const wins = games.filter((g) => g.won).length
  const losses = games.length - wins
  return {
    opponent: games[0]!.opponent,
    wins,
    losses,
    lastDate: games[games.length - 1]!.date,
  }
}

function countSeriesWinStreak(
  history: HistoricalSeries[],
  beforeDate: string,
  excludeOpponent?: string,
): number {
  const prior = history.filter(
    (s) => s.lastDate < beforeDate && (!excludeOpponent || s.opponent !== excludeOpponent),
  )
  let streak = 0
  for (let i = prior.length - 1; i >= 0; i--) {
    const s = prior[i]!
    if (s.wins > s.losses) streak++
    else break
  }
  return streak
}

function countSeriesLossStreak(history: HistoricalSeries[], beforeDate: string): number {
  const prior = history.filter((s) => s.lastDate < beforeDate)
  let streak = 0
  for (let i = prior.length - 1; i >= 0; i--) {
    const s = prior[i]!
    if (s.losses > s.wins) streak++
    else break
  }
  return streak
}

function findStarPlayer(players: Player[], team: string): Player | null {
  return (
    players
      .filter((p) => p.team === team && p.games >= 8)
      .sort((a, b) => b.games * b.kda - a.games * a.kda)[0] ?? null
  )
}

function seriesKey(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y)).join('|')
}

function groupSeries(games: ParsedGame[]): SeriesBucket[] {
  const map = new Map<string, SeriesBucket>()
  for (const g of games) {
    const key = seriesKey(g.winner, g.loser)
    const [teamA, teamB] = [g.winner, g.loser].sort((a, b) => a.localeCompare(b))
    const bucket = map.get(key) ?? { teamA, teamB, games: [] }
    bucket.games.push(g)
    map.set(key, bucket)
  }
  return [...map.values()]
}

function splitWinrate(teams: Team[], name: string): number {
  return findTeamByName(teams, name)?.winrate ?? 50
}

function buildWeekChampionCounts(games: ParsedGame[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const g of games) {
    for (const p of g.players) {
      if (!p.champion) continue
      counts.set(p.champion, (counts.get(p.champion) ?? 0) + 1)
    }
  }
  return counts
}

function aggregateSeriesPlayerStats(bucket: SeriesBucket): SeriesPlayerStats[] {
  const map = new Map<string, SeriesPlayerStats>()

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
      }
      cur.games++
      if (p.won) cur.wins++
      cur.avgKda += p.kda
      cur.avgDmg += p.dmgShare
      cur.avgGd15 += p.gd15
      cur.avgKp += p.kp
      if (p.champion && !cur.champions.includes(p.champion)) cur.champions.push(p.champion)
      map.set(key, cur)
    }
  }

  return [...map.values()].map((s) => ({
    ...s,
    avgKda: s.avgKda / s.games,
    avgDmg: s.avgDmg / s.games,
    avgGd15: s.avgGd15 / s.games,
    avgKp: s.avgKp / s.games,
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
      if (!p1 || !p2 || p1.name === p2.name) continue
      perGame.push({ a: p1, b: p2 })
    }

    if (perGame.length < 2) continue

    const namesA = new Set(perGame.map((x) => x.a.name))
    const namesB = new Set(perGame.map((x) => x.b.name))
    if (namesA.size !== 1 || namesB.size !== 1) continue

    const sample = perGame[0]!
    let aLaneWins = 0
    let aDmgWins = 0
    let gdLead = 0

    for (const { a, b } of perGame) {
      if (a.gd15 > b.gd15) aLaneWins++
      if (a.dmgShare > b.dmgShare) aDmgWins++
      gdLead += a.gd15 - b.gd15
    }

    const bLaneWins = perGame.length - aLaneWins
    const bDmgWins = perGame.length - aDmgWins

    const candidates: LaneDuelDomination[] = []
    if (aLaneWins === perGame.length || aDmgWins === perGame.length) {
      candidates.push({
        dominator: sample.a.name,
        victim: sample.b.name,
        role,
        games: perGame.length,
        avgGd15Lead: gdLead / perGame.length,
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
        avgGd15Lead: -gdLead / perGame.length,
        wonLaneEveryGame: bLaneWins === perGame.length,
        wonDmgEveryGame: bDmgWins === perGame.length,
      })
    }

    for (const c of candidates) {
      const score =
        (c.wonLaneEveryGame ? 40 : 0) +
        (c.wonDmgEveryGame ? 35 : 0) +
        c.games * 10 +
        Math.abs(c.avgGd15Lead) / 20
      const bestScore = best
        ? (best.wonLaneEveryGame ? 40 : 0) +
          (best.wonDmgEveryGame ? 35 : 0) +
          best.games * 10 +
          Math.abs(best.avgGd15Lead) / 20
        : 0
      if (!best || score > bestScore) best = c
    }
  }

  return best
}

function findBestLaneGap(series: SeriesBucket): LaneGapInfo | null {
  let best: LaneGapInfo | null = null
  for (const g of series.games) {
    for (const role of ['top', 'jungle', 'mid', 'adc', 'support'] as RoleKey[]) {
      const lanePlayers = g.players.filter((p) => p.role === role)
      if (lanePlayers.length < 2) continue
      const byTeam = new Map<string, GamePlayer[]>()
      for (const p of lanePlayers) {
        const list = byTeam.get(p.team) ?? []
        list.push(p)
        byTeam.set(p.team, list)
      }
      const teamNames = [...byTeam.keys()]
      if (teamNames.length < 2) continue
      const [t1, t2] = teamNames
      const p1 = byTeam.get(t1)?.[0]
      const p2 = byTeam.get(t2)?.[0]
      if (!p1 || !p2) continue
      const gap = Math.abs(p1.gd15 - p2.gd15)
      if (gap < 75) continue
      const gapper = p1.gd15 > p2.gd15 ? p1 : p2
      const gapped = p1.gd15 > p2.gd15 ? p2 : p1
      if (!best || gap > best.gap) {
        best = {
          gapper: gapper.name,
          gapped: gapped.name,
          gapperTeam: gapper.team,
          role,
          gap,
        }
      }
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

function buildFormPrefix(
  dominant: string,
  victim: string,
  domWins: number,
  vicWins: number,
  flags: {
    reverseSweep: boolean
    blowout: boolean
    upset: boolean
    domSplitWr: number
    vicSplitWr: number
    seriesStreak: number
    victimSlump: number
  },
  players: Player[],
  region: string,
  ledger: RecapLedger,
  id: string,
  salt: number,
): WeeklyRecapSegment[] | null {
  const { reverseSweep, blowout, domSplitWr, vicSplitWr, seriesStreak, victimSlump } = flags
  const star = findStarPlayer(players, dominant)

  if (reverseSweep && vicSplitWr >= domSplitWr + 5) {
    return [
      segTeam(victim),
      segText(
        ledger.pick(`${id}-stinker`, salt, [
          ` with an absolute stinker, getting reverse swept by `,
          ` in freefall — reverse swept by `,
          ` blew a game-1 lead and got reverse swept by `,
        ]),
      ),
    ]
  }

  if (seriesStreak >= 3 && blowout) {
    return [
      segTeam(dominant),
      segText(
        ledger.pick(`${id}-peak`, salt, [
          ` are peaking, stomping `,
          ` keep rolling — another clean `,
          ` extend their hot streak, dismantling `,
        ]),
      ),
    ]
  }

  if (seriesStreak >= 3) {
    const ord =
      seriesStreak === 3 ? '3rd' : seriesStreak === 4 ? '4th' : `${seriesStreak}th`
    return [
      segTeam(dominant),
      segText(` riding a wave — their ${ord} straight series win, taking `),
    ]
  }

  if (domSplitWr >= 72 && star && domWins >= vicWins) {
    return [
      segText(
        ledger.pick(`${id}-goat`, salt, [
          `${playerLabel(star.name)} reminds everyone why `,
          `${playerLabel(star.name)} shows once again that `,
          `${playerLabel(star.name)} keeps proving `,
        ]),
      ),
      segTeam(dominant),
      segText(
        ledger.pick(`${id}-goat2`, salt, [
          ` run ${region} as they beat `,
          ` are the team to beat in ${region}, beating `,
          ` own ${region} right now — `,
        ]),
      ),
    ]
  }

  if (victimSlump >= 2 && !reverseSweep) {
    return [
      segTeam(victim),
      segText(
        ledger.pick(`${id}-slump`, salt, [
          ` can't catch a break, dropping another to `,
          ` stay ice cold against `,
          ` continue to struggle vs `,
        ]),
      ),
    ]
  }

  if (upsetFromWr(domSplitWr, vicSplitWr) && domSplitWr < 45) {
    return [
      segTeam(dominant),
      segText(` spring the upset, knocking off `),
    ]
  }

  return null
}

function upsetFromWr(dom: number, vic: number): boolean {
  return dom + 8 < vic
}

function buildResultSegments(
  dominant: string,
  victim: string,
  domWins: number,
  vicWins: number,
  region: string,
  flags: {
    reverseSweep: boolean
    blowout: boolean
    upset: boolean
    domSplitWr: number
    vicSplitWr: number
    hasPrefix: boolean
    victimSlump: number
  },
  ledger: RecapLedger,
  id: string,
  salt: number,
): WeeklyRecapSegment[] {
  const { reverseSweep, blowout, upset, domSplitWr, vicSplitWr, hasPrefix } = flags

  if (hasPrefix && reverseSweep) {
    return [
      segTeam(dominant),
      segText(` ${domWins}-${vicWins}`),
    ]
  }

  if (hasPrefix && blowout) {
    return [
      segTeam(victim),
      segText(` ${domWins}-0`),
    ]
  }

  if (hasPrefix && domSplitWr >= 72) {
    return [
      segTeam(victim),
      segText(` ${domWins}-${vicWins}`),
    ]
  }

  if (hasPrefix && flags.victimSlump >= 2) {
    return [
      segTeam(dominant),
      segText(` ${domWins}-${vicWins}`),
    ]
  }

  if (reverseSweep && domWins >= 2) {
    const templates = [
      () => [
        segTeam(dominant),
        segText(` rallied for the reverse `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins} (${region})`),
      ],
      () => [
        segTeam(dominant),
        segText(` dropped game 1 then closed `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins}`),
      ],
    ]
    return ledger.pick(`${id}-rev`, salt, templates)()
  }

  if (blowout && domWins >= 3) {
    const templates = [
      () => [
        segTeam(dominant),
        segText(` rolled `),
        segTeam(victim),
        segText(` ${domWins}-0 this week`),
      ],
      () => [
        segTeam(dominant),
        segText(` took a clean ${domWins}-0 vs `),
        segTeam(victim),
        segText(` (${region})`),
      ],
    ]
    return ledger.pick(`${id}-blowout`, salt + 1, templates)()
  }

  if (blowout) {
    return [
      segTeam(dominant),
      segText(` swept `),
      segTeam(victim),
      segText(` ${domWins}-0 (${region})`),
    ]
  }

  if (upset) {
    return [
      segTeam(dominant),
      segText(` (${domSplitWr.toFixed(0)}% split wr) knocked off `),
      segTeam(victim),
      segText(` (${vicSplitWr.toFixed(0)}%) ${domWins}-${vicWins}`),
    ]
  }

  const templates = [
    () => [
      segTeam(dominant),
      segText(` beat `),
      segTeam(victim),
      segText(` ${domWins}-${vicWins} (${region})`),
    ],
    () => [
      segTeam(dominant),
      segText(` took the series ${domWins}-${vicWins} from `),
      segTeam(victim),
    ],
    () => [
      segTeam(dominant),
      segText(` vs `),
      segTeam(victim),
      segText(`: ${domWins}-${vicWins} on the week`),
    ],
  ]
  return ledger.pick(`${id}-close`, salt + 3, templates)()
}

function buildContextInsights(
  bucket: SeriesBucket,
  dominant: string,
  victim: string,
  gap: LaneGapInfo | null,
  laneDuel: LaneDuelDomination | null,
  playerStats: SeriesPlayerStats[],
  weekCounts: Map<string, number>,
  flags: {
    reverseSweep: boolean
    blowout: boolean
    domSplitWr: number
    vicSplitWr: number
  },
  ledger: RecapLedger,
  id: string,
  salt: number,
): SeriesContext[] {
  const insights: SeriesContext[] = []
  const role = gap ? ROLE_CHAT[gap.role] : 'mid'
  const gapper = gap?.gapper ?? ''
  const gapped = gap?.gapped ?? ''
  const gapOnWinner = gap ? gap.gapperTeam === dominant : false
  const avgGd = avgTeamGd15(bucket, dominant)
  const winPlayers = playerStats.filter((p) => p.team === dominant && p.wins > 0)
  const losePlayers = playerStats.filter((p) => p.team === victim)

  if (laneDuel && (laneDuel.wonLaneEveryGame || laneDuel.wonDmgEveryGame)) {
    const r = ROLE_CHAT[laneDuel.role]
    const adv = roleAdvantageVerb(laneDuel.role)
    const dom = playerLabel(laneDuel.dominator)
    const vic = playerLabel(laneDuel.victim)
    const onWinnerSide = playerStats.some(
      (p) => p.name === laneDuel.dominator && p.team === dominant,
    )

    if (laneDuel.wonLaneEveryGame && laneDuel.wonDmgEveryGame) {
      insights.push({
        kind: 'lane_sweep',
        priority: 95,
        segments: [
          segText(
            ledger.pick(`${id}-ls`, salt, [
              ` — ${dom} ${adv} and outdamaged ${vic} in every game`,
              ` — ${dom} styled on ${vic} in ${r} all series (${laneDuel.games} games)`,
              ` with ${dom} winning ${r} and damage vs ${vic} every single game`,
            ]),
          ),
        ],
      })
    } else if (laneDuel.wonLaneEveryGame) {
      const lanePhrase =
        laneDuel.role === 'jungle'
          ? ` — ${dom} ${adv} ${vic} every game`
          : ` — ${dom} ${adv} ${vic} in ${r} every game`
      insights.push({
        kind: 'lane_sweep',
        priority: 88,
        segments: [
          segText(lanePhrase + (onWinnerSide ? '' : ` (still lost the series)`)),
        ],
      })
    } else if (laneDuel.wonDmgEveryGame) {
      insights.push({
        kind: 'dmg_sweep',
        priority: 82,
        segments: [
          segText(` — ${dom} had more damage than ${vic} in every game`),
        ],
      })
    }
  }

  const carries = winPlayers
    .filter((p) => p.wins >= 2 && p.avgDmg >= 30 && p.avgKda >= 3.5)
    .sort((a, b) => b.avgDmg * b.avgKda - a.avgDmg * a.avgKda)

  if (carries.length >= 1) {
    const c = carries[0]!
    const winGames = bucket.games.filter((g) => g.winner === dominant).length
    insights.push({
      kind: 'dmg_carry',
      priority: 85 + c.avgDmg,
      segments: [
        segText(
          ledger.pick(`${id}-dc`, salt, [
            ` — ${playerLabel(c.name)} 1v9'd in the wins (${c.avgDmg.toFixed(0)}% dmg avg)`,
            ` — ${playerLabel(c.name)} was unkillable when it mattered (${c.avgDmg.toFixed(0)}% dmg across ${c.wins}W)`,
            ` with ${playerLabel(c.name)} popping off (${c.avgKda.toFixed(1)} kda, ${c.avgDmg.toFixed(0)}% dmg in ${winGames} wins)`,
          ]),
        ),
      ],
    })
  }

  const pocketPicks: PocketPickStats[] = winPlayers
    .filter((p) => {
      const rareChamp = p.champions.find((c) => (weekCounts.get(c) ?? 0) <= 2)
      return rareChamp && p.avgKda >= 2.5
    })
    .map((p) => {
      const champ = p.champions.find((c) => (weekCounts.get(c) ?? 0) <= 2)!
      return { ...p, pocketChamp: champ }
    })
    .sort((a, b) => b.avgKda - a.avgKda)

  if (pocketPicks.length) {
    const p = pocketPicks[0]!
    const r = p.role ? ROLE_CHAT[p.role] : ''
    insights.push({
      kind: 'pocket_pick',
      priority: 78,
      segments: [
        segText(
          ledger.pick(`${id}-pp`, salt, [
            ` — ${playerLabel(p.name)} pulled out the ${champLabel(p.pocketChamp)}${r ? ` ${r}` : ''}`,
            `, ${playerLabel(p.name)} whipped out ${champLabel(p.pocketChamp)}${r ? ` ${r}` : ''} and it worked`,
            ` with ${playerLabel(p.name)}'s ${champLabel(p.pocketChamp)} pocket pick paying off`,
          ]),
        ),
      ],
    })
  }

  if (flags.reverseSweep && flags.vicSplitWr >= flags.domSplitWr) {
    const tried = losePlayers
      .filter((p) => p.avgKda >= 3.2 || p.avgDmg >= 28)
      .sort((a, b) => b.avgKda * 0.5 + b.avgDmg * 0.5 - (a.avgKda * 0.5 + a.avgDmg * 0.5))[0]
    const horrors = losePlayers
      .filter((p) => p.avgKda < 2.2)
      .sort((a, b) => a.avgKda - b.avgKda)
      .slice(0, 2)

    if (tried && horrors.length >= 2) {
      insights.push({
        kind: 'reverse_horror',
        priority: 92,
        segments: [
          segText(
            ` — ${playerLabel(tried.name)} tried his best but ${playerLabel(horrors[0]!.name)} and ${playerLabel(horrors[1]!.name)} had a horror series`,
          ),
        ],
      })
    } else if (horrors.length >= 2) {
      insights.push({
        kind: 'horror_series',
        priority: 86,
        segments: [
          segText(
            ` — ${playerLabel(horrors[0]!.name)} and ${playerLabel(horrors[1]!.name)} had a nightmare series`,
          ),
        ],
      })
    } else if (tried) {
      insights.push({
        kind: 'loser_effort',
        priority: 75,
        segments: [
          segText(
            ` — ${playerLabel(tried.name)} tried to 1v9 (${tried.avgKda.toFixed(1)} kda) but got no help`,
          ),
        ],
      })
    }
  }

  if (gap && gap.gap >= 75 && !laneDuel?.wonLaneEveryGame) {
    if (!gapOnWinner) {
      insights.push({
        kind: 'lane_comeback',
        priority: 72 + gap.gap / 100,
        segments: [
          segText(
            ` — ${playerLabel(gapper)} won ${role} vs ${playerLabel(gapped)} but the team still closed it`,
          ),
        ],
      })
    } else {
      insights.push({
        kind: 'lane_dom',
        priority: 68 + gap.gap / 100,
        segments: [
          segText(
            ` — ${playerLabel(gapper)} owned ${playerLabel(gapped)} in the ${role} matchup`,
          ),
        ],
      })
    }
  }

  if (avgGd >= 400 && bucket.games.length >= 2 && flags.blowout) {
    insights.push({
      kind: 'early_lead',
      priority: 62,
      segments: [
        segText(` — up +${avgGd.toFixed(0)} gd@15 on average, never close`),
      ],
    })
  }

  const jg = winPlayers
    .filter((p) => p.role === 'jungle' && p.avgKp >= 72)
    .sort((a, b) => b.avgKp - a.avgKp)[0]

  if (jg) {
    insights.push({
      kind: 'jungle_kp',
      priority: 58,
      segments: [
        segText(` — ${playerLabel(jg.name)} had the map on a leash (${jg.avgKp.toFixed(0)}% kp)`),
      ],
    })
  }

  const feeder = losePlayers
    .filter((p) => p.avgKda < 1.5 && p.avgKda > 0)
    .sort((a, b) => a.avgKda - b.avgKda)[0]

  if (feeder && !flags.reverseSweep) {
    insights.push({
      kind: 'feed',
      priority: 48,
      segments: [
        segText(
          ` — ${playerLabel(feeder.name)} had a rough series on ${champLabel(feeder.champions[0] ?? 'their pick')} (${feeder.avgKda.toFixed(1)} kda avg)`,
        ),
      ],
    })
  }

  const pop = winPlayers
    .filter((p) => p.avgKda >= 4.5 && p.avgDmg < 30)
    .sort((a, b) => b.avgKda - a.avgKda)[0]

  if (pop && (!carries.length || pop.name !== carries[0]!.name)) {
    insights.push({
      kind: 'popoff',
      priority: 56,
      segments: [
        segText(` — ${playerLabel(pop.name)} went off (${pop.avgKda.toFixed(1)} kda avg)`),
      ],
    })
  }

  if (flags.domSplitWr >= 65 && flags.blowout) {
    insights.push({
      kind: 'split_form',
      priority: 52,
      segments: [
        segText(` — ${flags.domSplitWr.toFixed(0)}% on the split, looking like title contenders`),
      ],
    })
  }

  return insights.sort((a, b) => b.priority - a.priority)
}

function summarizeSeries(
  bucket: SeriesBucket,
  teams: Team[],
  players: Player[],
  weekCounts: Map<string, number>,
  lineIndex: number,
  ledger: RecapLedger,
): Omit<WeeklyRecapLine, 'score'> | null {
  const { teamA, teamB, games } = bucket
  if (!games.length) return null

  const id = seriesKey(teamA, teamB)
  const salt = lineIndex * 31 + hashKey(id)

  const winsA = games.filter((g) => g.winner === teamA).length
  const winsB = games.length - winsA
  const dominant = winsA >= winsB ? teamA : teamB
  const victim = dominant === teamA ? teamB : teamA
  const domWins = Math.max(winsA, winsB)
  const vicWins = Math.min(winsA, winsB)

  const region = teamLeague(teams, dominant)
  const domSplitWr = splitWinrate(teams, dominant)
  const vicSplitWr = splitWinrate(teams, victim)

  const ordered = [...games].sort((a, b) => a.date.localeCompare(b.date))
  const latestDate = ordered[ordered.length - 1]?.date ?? games[0]!.date
  const firstGameDate = ordered[0]!.date
  const firstLoss = vicWins > 0 ? ordered.findIndex((g) => g.winner === victim) : -1
  const reverseSweep = vicWins > 0 && domWins > vicWins && firstLoss === 0
  const blowout = domWins >= 2 && vicWins === 0
  const upset = upsetFromWr(domSplitWr, vicSplitWr)

  const domHistory = groupTeamSeriesHistory(collectTeamGames(players, dominant))
  const vicHistory = groupTeamSeriesHistory(collectTeamGames(players, victim))
  const seriesStreak =
    countSeriesWinStreak(domHistory, firstGameDate, victim) +
    (domWins > vicWins ? 1 : 0)
  const victimSlump = countSeriesLossStreak(vicHistory, firstGameDate)

  const gap = findBestLaneGap(bucket)
  const laneDuel = findLaneDuelDomination(bucket)
  const playerStats = aggregateSeriesPlayerStats(bucket)

  const formFlags = {
    reverseSweep,
    blowout,
    upset,
    domSplitWr,
    vicSplitWr,
    seriesStreak: domWins > vicWins ? seriesStreak : 0,
    victimSlump: vicWins > domWins ? 0 : victimSlump,
  }

  const prefix = buildFormPrefix(
    dominant,
    victim,
    domWins,
    vicWins,
    formFlags,
    players,
    region,
    ledger,
    id,
    salt,
  )

  const segments: WeeklyRecapSegment[] = prefix ? [...prefix] : []
  segments.push(
    ...buildResultSegments(
      dominant,
      victim,
      domWins,
      vicWins,
      region,
      {
        reverseSweep,
        blowout,
        upset,
        domSplitWr,
        vicSplitWr,
        hasPrefix: Boolean(prefix),
        victimSlump: formFlags.victimSlump,
      },
      ledger,
      id,
      salt,
    ),
  )

  const insights = buildContextInsights(
    bucket,
    dominant,
    victim,
    gap,
    laneDuel,
    playerStats,
    weekCounts,
    { reverseSweep, blowout, domSplitWr, vicSplitWr },
    ledger,
    id,
    salt,
  )

  let added = 0
  for (const insight of insights) {
    if (added >= MAX_CONTEXT_CLAUSES) break
    if (ledger.claim(insight.kind)) {
      segments.push(...insight.segments)
      added++
    }
  }

  if (added === 0 && insights.length) {
    for (const insight of insights.slice(0, MAX_CONTEXT_CLAUSES)) {
      segments.push(...insight.segments)
    }
  }

  return {
    id,
    date: latestDate,
    dateLabel: formatRecapDate(latestDate),
    segments,
  }
}

export function buildWeeklyRecapLines(
  players: Player[],
  teams: Team[],
  window: WeeklyRecapWindow | null,
  _league: string,
): WeeklyRecapLine[] {
  if (!window) return []
  const games = collectWeeklyGames(players, window)
  if (!games.length) return []

  const weekCounts = buildWeekChampionCounts(games)
  const series = groupSeries(games)
  const ledger = new RecapLedger()
  const lines: WeeklyRecapLine[] = []

  for (let i = 0; i < series.length; i++) {
    const bucket = series[i]!
    if (bucket.games.length < 1) continue
    const line = summarizeSeries(bucket, teams, players, weekCounts, i, ledger)
    if (!line) continue

    const winsA = bucket.games.filter((g) => g.winner === bucket.teamA).length
    const winsB = bucket.games.length - winsA
    const dominant = winsA >= winsB ? bucket.teamA : bucket.teamB
    const victim = dominant === bucket.teamA ? bucket.teamB : bucket.teamA
    const domWins = Math.max(winsA, winsB)
    const vicWins = Math.min(winsA, winsB)

    lines.push({
      ...line,
      score: {
        winner: resolveTeamCanonicalName(dominant),
        loser: resolveTeamCanonicalName(victim),
        winnerAbbr: recapTeamTag(dominant),
        loserAbbr: recapTeamTag(victim),
        score: `${domWins}-${vicWins}`,
      },
    })
  }

  return lines
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, 8)
}

export function recapLineToText(line: WeeklyRecapLine): string {
  return line.segments
    .map((s) => (s.kind === 'text' ? s.value : s.label))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Template segments through score/league — excludes stat/context clauses (for AI detail append). */
export function extractRecapShellSegments(
  templateLine: WeeklyRecapLine,
  score: string,
): WeeklyRecapSegment[] {
  const shell: WeeklyRecapSegment[] = []
  for (const seg of templateLine.segments) {
    if (seg.kind === 'team') {
      shell.push(seg)
      continue
    }
    const idx = seg.value.indexOf(score)
    if (idx === -1) {
      shell.push(seg)
      continue
    }
    const afterScore = seg.value.slice(idx + score.length)
    const leagueSuffix = afterScore.match(/^\s*\([A-Z]+\)/)?.[0] ?? ''
    const shellText = seg.value.slice(0, idx + score.length + leagueSuffix.length)
    if (shellText) shell.push({ kind: 'text', value: shellText })
    return shell
  }
  return shell
}

export function buildFallbackRecapShell(brief: SeriesBrief): WeeklyRecapSegment[] {
  return [
    segTeam(brief.facts.winner),
    segText(' beat '),
    segTeam(brief.facts.loser),
    segText(` ${brief.facts.score} (${brief.facts.league})`),
  ]
}

export interface SeriesBrief {
  seriesId: string
  date: string
  dateLabel: string
  league: string
  teamA: string
  teamB: string
  facts: SeriesFacts
  templateLine: WeeklyRecapLine
}

export function stableSeriesId(teamA: string, teamB: string, latestDate: string): string {
  return `${seriesKey(teamA, teamB)}|${latestDate}`
}

/** All series in the window with deterministic facts + template fallback line. */
export function collectSeriesBriefs(
  players: Player[],
  teams: Team[],
  window: WeeklyRecapWindow | null,
): SeriesBrief[] {
  if (!window) return []
  const games = collectWeeklyGames(players, window)
  if (!games.length) return []

  const weekCounts = buildWeekChampionCounts(games)
  const series = groupSeries(games)
  const ledger = new RecapLedger()
  const briefs: SeriesBrief[] = []

  for (let i = 0; i < series.length; i++) {
    const bucket = series[i]!
    if (!bucket.games.length) continue

    const winsA = bucket.games.filter((g) => g.winner === bucket.teamA).length
    const winsB = bucket.games.length - winsA
    const dominant = winsA >= winsB ? bucket.teamA : bucket.teamB
    const victim = dominant === bucket.teamA ? bucket.teamB : bucket.teamA
    const domWins = Math.max(winsA, winsB)
    const vicWins = Math.min(winsA, winsB)

    const ordered = [...bucket.games].sort((a, b) => a.date.localeCompare(b.date))
    const latestDate = ordered[ordered.length - 1]?.date ?? bucket.games[0]!.date
    const firstGameDate = ordered[0]!.date
    const firstLoss = vicWins > 0 ? ordered.findIndex((g) => g.winner === victim) : -1
    const reverseSweep = vicWins > 0 && domWins > vicWins && firstLoss === 0

    const domHistory = groupTeamSeriesHistory(collectTeamGames(players, dominant))
    const vicHistory = groupTeamSeriesHistory(collectTeamGames(players, victim))
    const seriesStreak =
      countSeriesWinStreak(domHistory, firstGameDate, victim) + (domWins > vicWins ? 1 : 0)
    const victimSlump = countSeriesLossStreak(vicHistory, firstGameDate)

    const facts = buildSeriesFacts(bucket, teams, weekCounts, {
      reverseSweep,
      blowout: domWins >= 2 && vicWins === 0,
      seriesStreak: domWins > vicWins ? seriesStreak : 0,
      victimSlump: vicWins > domWins ? 0 : victimSlump,
    })

    const templateBase = summarizeSeries(bucket, teams, players, weekCounts, i, ledger)
    if (!templateBase) continue

    const templateLine: WeeklyRecapLine = {
      ...templateBase,
      score: {
        winner: resolveTeamCanonicalName(dominant),
        loser: resolveTeamCanonicalName(victim),
        winnerAbbr: recapTeamTag(dominant),
        loserAbbr: recapTeamTag(victim),
        score: `${domWins}-${vicWins}`,
      },
    }

    briefs.push({
      seriesId: stableSeriesId(bucket.teamA, bucket.teamB, latestDate),
      date: latestDate,
      dateLabel: formatRecapDate(latestDate),
      league: facts.league,
      teamA: resolveTeamCanonicalName(bucket.teamA),
      teamB: resolveTeamCanonicalName(bucket.teamB),
      facts,
      templateLine,
    })
  }

  return briefs.sort((a, b) => b.date.localeCompare(a.date) || a.seriesId.localeCompare(b.seriesId))
}

export { recapTeamTag } from './recapTeamTag'
