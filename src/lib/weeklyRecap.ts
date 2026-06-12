import type { Player, PlayerGameLog, Team } from '../hooks/useDashboardData'
import { teamSearchAbbreviation } from './entities/entityMap'
import { resolveTeamCanonicalName } from './entities/slugs'
import { findTeamByName } from './teamAnalytics'
import { normalizePosition, type RoleKey } from './playerRadar'

export interface WeeklyRecapWindow {
  start: Date
  end: Date
  label: string
}

export type WeeklyRecapSegment =
  | { kind: 'text'; value: string }
  | { kind: 'team'; canonicalName: string; label: string }

export interface WeeklyRecapLine {
  id: string
  date: string
  dateLabel: string
  segments: WeeklyRecapSegment[]
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

const FILLER_WORDS = new Set(['esports', 'gaming', 'team', 'life', 'of', 'the'])

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

function formatRecapDate(iso: string): string {
  const d = parseDate(iso)
  if (!d) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function inWindow(log: PlayerGameLog, window: WeeklyRecapWindow): boolean {
  const d = parseDate(log.date)
  if (!d) return false
  return d >= window.start && d <= window.end
}

function recapTeamTag(name: string): string {
  const canonical = resolveTeamCanonicalName(name)
  const mapped = teamSearchAbbreviation(canonical)
  if (mapped !== canonical && mapped.length <= 6) return mapped.toUpperCase()

  const words = canonical.replace(/'/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0]!.toUpperCase()
  if (words[0] && words[0].length <= 4) return words[0].toUpperCase()

  const significant = words.filter((w) => !FILLER_WORDS.has(w.toLowerCase()))
  if (significant.length >= 2) {
    return significant.map((w) => w[0]?.toUpperCase() ?? '').join('')
  }
  return words.map((w) => w[0]?.toUpperCase() ?? '').join('') || canonical.toUpperCase()
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
  },
  ledger: RecapLedger,
  id: string,
  salt: number,
): WeeklyRecapSegment[] {
  const { reverseSweep, blowout, upset, domSplitWr, vicSplitWr } = flags

  if (reverseSweep && domWins >= 2) {
    const family = ledger.claim('reverse') ? 'reverse' : 'result'
    const templates = [
      () => [
        segTeam(dominant),
        segText(` rallied for the reverse `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins} (${region})`),
      ],
      () => [
        segTeam(dominant),
        segText(` dropped game 1 then took `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins}`),
      ],
      () => [
        segTeam(victim),
        segText(` stole game 1 but `),
        segTeam(dominant),
        segText(` closed ${domWins}-${vicWins} in ${region}`),
      ],
    ]
    return ledger.pick(`${id}-${family}`, salt, templates)()
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
      () => [
        segTeam(victim),
        segText(` went winless (${domWins}-0) vs `),
        segTeam(dominant),
      ],
    ]
    return ledger.pick(`${id}-blowout`, salt + 1, templates)()
  }

  if (blowout) {
    const templates = [
      () => [
        segTeam(dominant),
        segText(` swept the week ${domWins}-0 against `),
        segTeam(victim),
      ],
      () => [
        segTeam(dominant),
        segText(` won every game vs `),
        segTeam(victim),
        segText(` (${domWins}-0, ${region})`),
      ],
    ]
    return ledger.pick(`${id}-sweep`, salt + 2, templates)()
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
      segText(` won the week ${domWins}-${vicWins} over `),
      segTeam(victim),
      segText(` (${region})`),
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
    () => [
      segTeam(victim),
      segText(` fell ${vicWins}-${domWins} to `),
      segTeam(dominant),
      segText(` in ${region}`),
    ],
  ]
  return ledger.pick(`${id}-close`, salt + 3, templates)()
}

function buildContextInsights(
  bucket: SeriesBucket,
  dominant: string,
  _victim: string,
  gap: LaneGapInfo | null,
  weekCounts: Map<string, number>,
  ledger: RecapLedger,
  id: string,
  salt: number,
): SeriesContext[] {
  const insights: SeriesContext[] = []
  const players = bucket.games.flatMap((g) => g.players)
  const role = gap ? ROLE_CHAT[gap.role] : 'mid'
  const gapper = gap?.gapper.toLowerCase() ?? ''
  const gapped = gap?.gapped.toLowerCase() ?? ''
  const gapOnWinner = gap ? gap.gapperTeam === dominant : false
  const avgGd = avgTeamGd15(bucket, dominant)

  if (gap && gap.gap >= 75) {
    if (!gapOnWinner) {
      insights.push({
        kind: 'lane_comeback',
        priority: 90 + gap.gap / 100,
        segments: [
          segText(
            ledger.pick(`${id}-lc`, salt, [
              ` — ${gapper} smashed ${role} vs ${gapped} but `,
              ` — even after ${gapper} won ${role} over ${gapped}, `,
              ` — ${gapper} owned ${gapped} at 15 yet `,
            ]),
          ),
        ],
      })
    } else {
      insights.push({
        kind: 'lane_dom',
        priority: 70 + gap.gap / 100,
        segments: [
          segText(
            ledger.pick(`${id}-ld`, salt, [
              `, ${gapper} had the ${role} matchup vs ${gapped}`,
              ` — ${gapper} won the ${role} lane against ${gapped}`,
              ` with ${gapper} ahead in ${role} vs ${gapped}`,
            ]),
          ),
        ],
      })
    }
  }

  if (avgGd >= 400 && bucket.games.length >= 2) {
    insights.push({
      kind: 'early_lead',
      priority: 55 + avgGd / 200,
      segments: [
        segText(
          ledger.pick(`${id}-gd`, salt, [
            `, avg +${avgGd.toFixed(0)} gd@15 across the set`,
            ` — up big at 15 every game basically`,
            ` with early gold leads all series`,
          ]),
        ),
      ],
    })
  }

  const carry = players
    .filter((p) => p.won && p.team === dominant && p.kda >= 5 && p.dmgShare >= 28)
    .sort((a, b) => b.kda * 0.55 + b.dmgShare * 0.45 - (a.kda * 0.55 + a.dmgShare * 0.45))[0]

  if (carry) {
    insights.push({
      kind: 'hard_carry',
      priority: 80 + carry.kda,
      segments: [
        segText(
          ledger.pick(`${id}-hc`, salt, [
            ` — ${carry.name.toLowerCase()} hard carried on ${carry.champion.toLowerCase()} (${carry.kda.toFixed(1)} kda, ${carry.dmgShare.toFixed(0)}% dmg)`,
            `, ${carry.name.toLowerCase()} basically solo won on ${carry.champion.toLowerCase()} (${carry.kda.toFixed(1)} kda)`,
            ` — shoutout ${carry.name.toLowerCase()} (${carry.champion.toLowerCase()}, ${carry.kda.toFixed(1)} kda / ${carry.dmgShare.toFixed(0)}% dmg)`,
          ]),
        ),
      ],
    })
  }

  const rarePick = players
    .filter(
      (p) =>
        p.won &&
        p.team === dominant &&
        p.champion &&
        (weekCounts.get(p.champion) ?? 0) <= 2 &&
        p.kda >= 2.5,
    )
    .sort((a, b) => b.kda - a.kda)[0]

  if (rarePick) {
    const r = rarePick.role ? ROLE_CHAT[rarePick.role] : ''
    insights.push({
      kind: 'pocket_pick',
      priority: 65 + rarePick.kda,
      segments: [
        segText(
          ledger.pick(`${id}-pp`, salt, [
            ` — ${rarePick.name.toLowerCase()} whipped out ${rarePick.champion.toLowerCase()}${r ? ` ${r}` : ''} and it worked`,
            `, ${rarePick.name.toLowerCase()}'s ${rarePick.champion.toLowerCase()}${r ? ` ${r}` : ''} pocket pick paid off`,
            ` with a spicy ${rarePick.champion.toLowerCase()}${r ? ` ${r}` : ''} from ${rarePick.name.toLowerCase()}`,
          ]),
        ),
      ],
    })
  }

  const jgKp = players
    .filter((p) => p.won && p.team === dominant && p.role === 'jungle' && p.kp >= 75)
    .sort((a, b) => b.kp - a.kp)[0]

  if (jgKp) {
    insights.push({
      kind: 'jungle_kp',
      priority: 60 + jgKp.kp / 10,
      segments: [
        segText(
          ledger.pick(`${id}-jk`, salt, [
            ` — ${jgKp.name.toLowerCase()} was everywhere (${jgKp.kp.toFixed(0)}% kp)`,
            `, ${jgKp.name.toLowerCase()} had the map on a leash (${jgKp.kp.toFixed(0)}% kp)`,
          ]),
        ),
      ],
    })
  }

  const feeder = players
    .filter((p) => !p.won && p.kda < 1.2 && p.kda > 0)
    .sort((a, b) => a.kda - b.kda)[0]

  if (feeder) {
    insights.push({
      kind: 'feed',
      priority: 50,
      segments: [
        segText(
          ledger.pick(`${id}-fd`, salt, [
            ` — ${feeder.name.toLowerCase()} had a rough one on ${feeder.champion.toLowerCase()} (${feeder.kda.toFixed(1)} kda)`,
            `, ${feeder.name.toLowerCase()} inted out on ${feeder.champion.toLowerCase()}`,
            ` with ${feeder.name.toLowerCase()} feeding on ${feeder.champion.toLowerCase()}`,
          ]),
        ),
      ],
    })
  }

  const pop = players
    .filter((p) => p.won && p.team === dominant && p.kda >= 4.2)
    .sort((a, b) => b.kda - a.kda)[0]

  if (pop && (!carry || pop.name !== carry.name)) {
    insights.push({
      kind: 'popoff',
      priority: 58 + pop.kda,
      segments: [
        segText(
          ledger.pick(`${id}-po`, salt, [
            ` — ${pop.name.toLowerCase()} went off on ${pop.champion.toLowerCase()} (${pop.kda.toFixed(1)} kda)`,
            `, ${pop.name.toLowerCase()} was the best player on the rift (${pop.champion.toLowerCase()})`,
            ` with ${pop.name.toLowerCase()} popping on ${pop.champion.toLowerCase()}`,
          ]),
        ),
      ],
    })
  }

  return insights.sort((a, b) => b.priority - a.priority)
}

function summarizeSeries(
  bucket: SeriesBucket,
  teams: Team[],
  weekCounts: Map<string, number>,
  lineIndex: number,
  ledger: RecapLedger,
): WeeklyRecapLine | null {
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
  const firstLoss = vicWins > 0 ? ordered.findIndex((g) => g.winner === victim) : -1
  const reverseSweep = vicWins > 0 && domWins > vicWins && firstLoss === 0
  const blowout = domWins >= 2 && vicWins === 0
  const upset = domSplitWr + 8 < vicSplitWr

  const gap = findBestLaneGap(bucket)
  const segments = buildResultSegments(
    dominant,
    victim,
    domWins,
    vicWins,
    region,
    { reverseSweep, blowout, upset, domSplitWr, vicSplitWr },
    ledger,
    id,
    salt,
  )

  const insights = buildContextInsights(bucket, dominant, victim, gap, weekCounts, ledger, id, salt)
  for (const insight of insights) {
    if (ledger.claim(insight.kind)) {
      segments.push(...insight.segments)
      break
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
    const line = summarizeSeries(bucket, teams, weekCounts, i, ledger)
    if (line) lines.push(line)
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
