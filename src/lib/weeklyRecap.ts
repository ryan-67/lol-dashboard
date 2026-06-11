import type { Player, PlayerGameLog, Team } from '../hooks/useDashboardData'
import { normalizePosition, type RoleKey } from './playerRadar'
import { findTeamByName } from './teamAnalytics'

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

const ROLE_CHAT: Record<RoleKey, string> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'mid',
  adc: 'bot',
  support: 'support',
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function inWindow(log: PlayerGameLog, window: WeeklyRecapWindow): boolean {
  const d = parseDate(log.date)
  if (!d) return false
  return d >= window.start && d <= window.end
}

function shortTeam(name: string): string {
  const compact = name.replace(/\s+esports$/i, '').replace(/\s+gaming$/i, '')
  if (compact.length <= 14) return compact.toLowerCase()
  return compact.split(/\s+/)[0]?.toLowerCase() ?? name.toLowerCase()
}

function teamLeague(teams: Team[], name: string): string {
  const t = findTeamByName(teams, name)
  return (t?.league ?? 'LCK').toLowerCase()
}

function hashKey(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0
  }
  return h
}

function pickVariant<T>(key: string, salt: number, variants: T[]): T {
  return variants[(hashKey(key) + salt) % variants.length]!
}

function segText(value: string): WeeklyRecapSegment {
  return { kind: 'text', value }
}

function segTeam(canonicalName: string, label?: string): WeeklyRecapSegment {
  return { kind: 'team', canonicalName, label: label ?? shortTeam(canonicalName) }
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
  return [...map.values()].sort((a, b) => b.games.length - a.games.length)
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

function laneGapPhrase(gap: LaneGapInfo, favorsSeriesWinner: boolean, salt: number): WeeklyRecapSegment[] {
  const role = ROLE_CHAT[gap.role]
  const gapper = gap.gapper.toLowerCase()
  const gapped = gap.gapped.toLowerCase()

  if (favorsSeriesWinner) {
    const variants = [
      ` while ${gapper} diffed ${gapped} in ${role}`,
      ` with ${gapper} owning the ${role} lane vs ${gapped}`,
      ` — ${gapper} had ${gapped} in a vice in ${role}`,
    ]
    return [segText(pickVariant(gap.gapper, salt, variants))]
  }

  const variants = [
    `despite ${gapper} gapping ${gapped} in ${role}, `,
    `even with ${gapper} styling on ${gapped} in ${role}, `,
    `${gapper} won ${role} vs ${gapped} but `,
  ]
  return [segText(pickVariant(gap.gapper, salt + 3, variants))]
}

function championBeat(
  series: SeriesBucket,
  dominant: string,
  weekCounts: Map<string, number>,
  salt: number,
): WeeklyRecapSegment[] | null {
  const candidates = series.games.flatMap((g) => g.players)

  const oneVnine = candidates
    .filter((p) => p.won && p.team === dominant && p.kda >= 5 && p.dmgShare >= 26)
    .sort((a, b) => b.kda * 0.6 + b.dmgShare * 0.4 - (a.kda * 0.6 + a.dmgShare * 0.4))[0]

  if (oneVnine) {
    const variants = [
      ` ${oneVnine.name.toLowerCase()} straight 1v9'd on ${oneVnine.champion.toLowerCase()} (${oneVnine.kda.toFixed(1)} kda)`,
      ` ${oneVnine.name.toLowerCase()} hard 1v9'd the ${oneVnine.champion.toLowerCase()} (${oneVnine.kda.toFixed(1)} kda, ${oneVnine.dmgShare.toFixed(0)}% dmg)`,
      ` shoutout ${oneVnine.name.toLowerCase()} — literal 1v9 on ${oneVnine.champion.toLowerCase()}`,
    ]
    return [segText(pickVariant(oneVnine.name, salt + 7, variants))]
  }

  const rarePick = candidates
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
    const role = rarePick.role ? ROLE_CHAT[rarePick.role] : ''
    const variants = [
      ` ${rarePick.name.toLowerCase()} pulled out the ${rarePick.champion.toLowerCase()}${role ? ` ${role}` : ''} and it cooked`,
      ` ${rarePick.name.toLowerCase()} whipped out ${rarePick.champion.toLowerCase()}${role ? ` ${role}` : ''} — rare pick W`,
      ` credit ${rarePick.name.toLowerCase()} for the ${rarePick.champion.toLowerCase()}${role ? ` ${role}` : ''} pocket pick`,
    ]
    return [segText(pickVariant(rarePick.name, salt + 11, variants))]
  }

  const inter = candidates
    .filter((p) => !p.won && p.kda < 1.3 && p.kda > 0)
    .sort((a, b) => a.kda - b.kda)[0]

  if (inter) {
    const variants = [
      ` ${inter.name.toLowerCase()} inted on ${inter.champion.toLowerCase()} (${inter.kda.toFixed(1)} kda) and paid for it`,
      ` ${inter.name.toLowerCase()} ran it down on ${inter.champion.toLowerCase()} — classic int game`,
    ]
    return [segText(pickVariant(inter.name, salt + 13, variants))]
  }

  const popOff = candidates
    .filter((p) => p.won && p.team === dominant && p.kda >= 4.5)
    .sort((a, b) => b.kda - a.kda)[0]

  if (popOff) {
    const variants = [
      ` ${popOff.name.toLowerCase()} popped off on ${popOff.champion.toLowerCase()} (${popOff.kda.toFixed(1)} kda)`,
      ` ${popOff.name.toLowerCase()} was unkillable on ${popOff.champion.toLowerCase()}`,
      ` ${popOff.name.toLowerCase()} had ${popOff.champion.toLowerCase()} on lock (${popOff.kda.toFixed(1)} kda)`,
    ]
    return [segText(pickVariant(popOff.name, salt + 17, variants))]
  }

  return null
}

function summarizeSeries(
  bucket: SeriesBucket,
  teams: Team[],
  weekCounts: Map<string, number>,
  lineIndex: number,
): WeeklyRecapLine | null {
  const { teamA, teamB, games } = bucket
  if (!games.length) return null

  const id = seriesKey(teamA, teamB)
  const salt = lineIndex * 17 + hashKey(id)

  const winsA = games.filter((g) => g.winner === teamA).length
  const winsB = games.length - winsA
  const dominant = winsA >= winsB ? teamA : teamB
  const victim = dominant === teamA ? teamB : teamA
  const domWins = Math.max(winsA, winsB)
  const vicWins = Math.min(winsA, winsB)

  const region = teamLeague(teams, dominant)
  const domSplitWr = splitWinrate(teams, dominant)
  const vicSplitWr = splitWinrate(teams, victim)
  const upset = domSplitWr + 8 < vicSplitWr

  const ordered = [...games].sort((a, b) => a.date.localeCompare(b.date))
  const firstLoss = vicWins > 0 ? ordered.findIndex((g) => g.winner === victim) : -1
  const reverseSweep = vicWins > 0 && domWins > vicWins && firstLoss === 0
  const blowout = domWins >= 2 && vicWins === 0

  const gap = findBestLaneGap(bucket)
  const gapFavorsWinner = gap ? gap.gapperTeam === dominant : false
  const gapFavorsLoser = gap ? gap.gapperTeam !== dominant : false

  const segments: WeeklyRecapSegment[] = []

  if (gapFavorsLoser && gap) {
    segments.push(...laneGapPhrase(gap, false, salt))
  }

  if (reverseSweep && domWins >= 2) {
    const openers = [
      () => [
        segTeam(dominant),
        segText(` reverse swept `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins} this week — still a legit squad in ${region}`),
      ],
      () => [
        segTeam(dominant),
        segText(` clawed back vs `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins} and look fine in ${region}`),
      ],
      () => [
        segTeam(dominant),
        segText(` took the reverse ${domWins}-${vicWins} over `),
        segTeam(victim),
        segText(` in ${region}`),
      ],
    ]
    const pick = pickVariant(id, salt, openers)
    segments.push(...pick())
  } else if (blowout && domWins >= 3) {
    const variants = [
      () => [
        segTeam(victim),
        segText(` got bodied by `),
        segTeam(dominant),
        segText(` ${domWins}-0 this week`),
      ],
      () => [
        segTeam(dominant),
        segText(` smoked `),
        segTeam(victim),
        segText(` ${domWins}-0 — free week in ${region}`),
      ],
      () => [
        segTeam(dominant),
        segText(` ran the `),
        segTeam(victim),
        segText(` series ${domWins}-0 in ${region}`),
      ],
    ]
    segments.push(...pickVariant(id, salt + 1, variants)())
  } else if (blowout) {
    const variants = [
      () => [
        segTeam(dominant),
        segText(` swept `),
        segTeam(victim),
        segText(` ${domWins}-0 on the week`),
      ],
      () => [
        segTeam(dominant),
        segText(` handled `),
        segTeam(victim),
        segText(` ${domWins}-0 in ${region}`),
      ],
    ]
    segments.push(...pickVariant(id, salt + 2, variants)())
  } else if (upset) {
    segments.push(
      segTeam(dominant),
      segText(` (${domSplitWr.toFixed(0)}% wr) upset `),
      segTeam(victim),
      segText(` (${vicSplitWr.toFixed(0)}%) ${domWins}-${vicWins} — didn't see that coming`),
    )
  } else {
    const variants = [
      () => [
        segTeam(dominant),
        segText(` edged `),
        segTeam(victim),
        segText(` ${domWins}-${vicWins} in ${region} this week`),
      ],
      () => [
        segTeam(dominant),
        segText(` took the week ${domWins}-${vicWins} vs `),
        segTeam(victim),
        segText(` in ${region}`),
      ],
      () => [
        segTeam(dominant),
        segText(` vs `),
        segTeam(victim),
        segText(` ends ${domWins}-${vicWins} for the week (${region})`),
      ],
    ]
    segments.push(...pickVariant(id, salt + 4, variants)())
  }

  if (gapFavorsWinner && gap) {
    segments.push(...laneGapPhrase(gap, true, salt))
  }

  const champ = championBeat(bucket, dominant, weekCounts, salt)
  if (champ) segments.push(...champ)

  return { id, segments }
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
  const lines: WeeklyRecapLine[] = []

  for (let i = 0; i < series.length; i++) {
    const bucket = series[i]!
    if (bucket.games.length < 1) continue
    const line = summarizeSeries(bucket, teams, weekCounts, i)
    if (line) lines.push(line)
  }

  return lines.slice(0, 8)
}

/** Flat text for search / fallback */
export function recapLineToText(line: WeeklyRecapLine): string {
  return line.segments
    .map((s) => (s.kind === 'text' ? s.value : s.label))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
