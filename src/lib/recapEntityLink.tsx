import type { ReactNode } from 'react'
import type { Champion, Player } from '../hooks/useDashboardData'
import type { WeeklyRecapSegment } from './weeklyRecap'
import EntityLink from '../components/entities/EntityLink'
import { teamSearchAbbreviation } from './entities/entityMap'
import { resolveTeamCanonicalName, teamMatchesCanonical } from './entities/slugs'
import { SERIES_GAP_DAYS } from './seriesGrouping'

export type RecapEntityKind = 'player' | 'team' | 'champion'

export interface RecapEntityPattern {
  kind: RecapEntityKind
  pattern: string
  canonicalName: string
  player?: Player
  caseSensitive: boolean
}

export interface RecapLinkAllowlist {
  players: Map<string, Player> // lower(name) → player
  champions: Set<string> // lower(champion name)
  teams: Set<string> // lower(canonical team)
}

/**
 * Common English words / ambiguous tokens that must never become entity links,
 * even when a pro player/champ/team shares the name (ice, aiming, ace, …).
 */
const RECAP_LINK_STOPWORDS = new Set([
  'on', 'up', 'in', 'is', 'it', 'as', 'at', 'be', 'do', 'go', 'or', 'to', 'so',
  'no', 'an', 'am', 'we', 'he', 'if', 'my', 'by', 'of', 'vs', 'the', 'and', 'for',
  'but', 'out', 'off', 'yet', 'had', 'has', 'was', 'are', 'all', 'any', 'can',
  'did', 'get', 'got', 'how', 'its', 'let', 'may', 'new', 'now', 'old', 'our',
  'own', 'put', 'run', 'say', 'see', 'set', 'too', 'try', 'use', 'way', 'who',
  'why', 'win', 'won', 'top', 'mid', 'bot', 'jg',
  // Prose / common words that collide with igns or champ names
  'ice', 'cold', 'form', 'gap', 'lead', 'edge', 'core', 'king', 'queen', 'ghost',
  'angel', 'devil', 'beast', 'wolf', 'bear', 'fish', 'bird', 'rain', 'snow',
  'fire', 'wind', 'star', 'moon', 'sun', 'dark', 'light', 'hope', 'fate', 'luck',
  'time', 'life', 'home', 'away', 'back', 'down', 'over', 'only', 'even', 'still',
  'just', 'also', 'very', 'much', 'more', 'most', 'best', 'last', 'next', 'early',
  'late', 'clean', 'hard', 'soft', 'free', 'open', 'close', 'high', 'low', 'big',
  'small', 'main', 'side', 'map', 'lane', 'pick', 'ban', 'draft', 'series', 'game',
  'match', 'round', 'stage', 'final', 'finals', 'aiming', 'ace', 'aim', 'pass',
  'pass', 'show', 'maker', 'perfect', 'smile', 'peace', 'power', 'force', 'flash',
  'rush', 'swift', 'quick', 'slow', 'fast', 'true', 'false', 'real', 'fake',
  'good', 'bad', 'great', 'fine', 'okay', 'sure', 'well', 'here', 'there', 'then',
  'than', 'them', 'they', 'this', 'that', 'with', 'from', 'into', 'onto', 'upon',
  'about', 'after', 'before', 'under', 'above', 'again', 'once', 'every', 'each',
  'both', 'few', 'many', 'some', 'such', 'same', 'other', 'another', 'while',
  'where', 'when', 'what', 'which', 'whose', 'whom', 'being', 'been', 'done',
  'made', 'make', 'take', 'took', 'came', 'come', 'went', 'gone', 'keep', 'kept',
  'left', 'right', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'seventh', 'eighth', 'ninth', 'tenth', 'one', 'two', 'three', 'four', 'five',
  'six', 'seven', 'eight', 'nine', 'ten', 'hundred', 'thousand', 'million',
  'half', 'full', 'empty', 'none', 'zero', 'plus', 'minus', 'less', 'least',
  'enough', 'almost', 'always', 'never', 'often', 'sometimes', 'usually',
  'probably', 'maybe', 'perhaps', 'actually', 'really', 'pretty', 'quite',
  'rather', 'almost', 'already', 'still', 'yet', 'soon', 'later', 'today',
  'week', 'month', 'year', 'season', 'split', 'patch', 'meta', 'comp', 'team',
  'player', 'champ', 'champion', 'role', 'support', 'jungle', 'carry', 'adc',
])

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isPureNumber(value: string): boolean {
  return /^\d+$/.test(value.trim())
}

function isShortTag(value: string): boolean {
  return value.length <= 4 && /^[A-Z0-9]+$/.test(value)
}

/** Names that are too ambiguous to ever auto-link (common words, numbers, tiny tokens). */
function isAmbiguousIdentityName(name: string): boolean {
  const lower = name.toLowerCase().trim()
  if (!lower) return true
  if (isPureNumber(lower)) return true
  if (lower.length < 3) return true
  if (RECAP_LINK_STOPWORDS.has(lower)) return true
  // Single-letter + digits (e.g. "a1") or tiny alnum tags that collide with prose/stats.
  if (/^\d/.test(lower)) return true
  return false
}

function isEligiblePlayerName(name: string): boolean {
  return !isAmbiguousIdentityName(name)
}

function isEligibleTeamTag(tag: string): boolean {
  if (isPureNumber(tag)) return false
  if (isShortTag(tag)) {
    return tag.length >= 2 && !RECAP_LINK_STOPWORDS.has(tag.toLowerCase())
  }
  if (tag.length < 3) return false
  return !RECAP_LINK_STOPWORDS.has(tag.toLowerCase())
}

function isEligibleChampionName(name: string): boolean {
  return !isAmbiguousIdentityName(name)
}

function patternMatchesText(pattern: RecapEntityPattern, text: string): boolean {
  const flags = pattern.caseSensitive ? '' : 'i'
  const re = new RegExp(`\\b${escapeRegex(pattern.pattern)}\\b`, flags)
  return re.test(text)
}

function patternRegex(pattern: RecapEntityPattern): RegExp {
  const flags = pattern.caseSensitive ? 'g' : 'gi'
  return new RegExp(`\\b${escapeRegex(pattern.pattern)}\\b`, flags)
}

function parseDate(value: string): number {
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * Players and champions who actually played in this series (same matchup, near the series date).
 * Only these identities are eligible for recap linkify — never the full roster/catalog.
 */
export function buildRecapLinkAllowlist(
  line: {
    date: string
    score: { winner: string; loser: string }
    segments: WeeklyRecapSegment[]
  },
  players: Player[],
): RecapLinkAllowlist {
  const teams = recapTeamsForLine(line)
  const teamSet = new Set(teams.map((t) => resolveTeamCanonicalName(t).toLowerCase()))
  const seriesDate = parseDate(line.date)
  const playerMap = new Map<string, Player>()
  const champions = new Set<string>()

  for (const p of players) {
    const pTeam = resolveTeamCanonicalName(p.team).toLowerCase()
    if (!teamSet.has(pTeam)) continue

    for (const g of p.gameLog ?? []) {
      const gDate = parseDate(g.date)
      if (!gDate || !seriesDate) continue
      const dayGap = Math.abs(gDate - seriesDate) / (24 * 60 * 60 * 1000)
      if (dayGap > SERIES_GAP_DAYS) continue

      const opp = g.opponent
      if (!opp) continue
      const oppCanon = resolveTeamCanonicalName(opp).toLowerCase()
      // Must be a game against the other series team.
      if (!teamSet.has(oppCanon) || oppCanon === pTeam) continue

      playerMap.set(p.name.toLowerCase(), p)
      if (g.champion) champions.add(g.champion.toLowerCase())
    }
  }

  // Fallback: if game-log matching found nobody (sparse logs), allow non-ambiguous
  // roster players on the two teams only — still never stopwords/numbers.
  if (!playerMap.size) {
    for (const p of players) {
      if (!teams.some((t) => teamMatchesCanonical(p.team, t))) continue
      if (!isEligiblePlayerName(p.name)) continue
      playerMap.set(p.name.toLowerCase(), p)
    }
  }

  return {
    players: playerMap,
    champions,
    teams: teamSet,
  }
}

/** Build link patterns only for allowlisted series participants that appear in text. */
export function buildRecapEntityPatternsForText(
  text: string,
  players: Player[],
  champions: Champion[],
  teams: string[],
  allowlist?: RecapLinkAllowlist,
): RecapEntityPattern[] {
  if (!text.trim()) return []

  const patterns: RecapEntityPattern[] = []
  const seen = new Set<string>()
  const teamSet =
    allowlist?.teams ??
    new Set(teams.map((t) => resolveTeamCanonicalName(t).toLowerCase()))

  const add = (pattern: RecapEntityPattern) => {
    const key = `${pattern.kind}:${pattern.pattern.toLowerCase()}`
    if (seen.has(key)) return
    if (!patternMatchesText(pattern, text)) return
    seen.add(key)
    patterns.push(pattern)
  }

  if (allowlist) {
    for (const [lower, player] of allowlist.players) {
      if (!isEligiblePlayerName(player.name)) continue
      add({
        kind: 'player',
        pattern: player.name,
        canonicalName: player.name,
        player,
        caseSensitive: false,
      })
      // Also allow exact lower ign as written in recaps.
      if (lower !== player.name.toLowerCase()) {
        add({
          kind: 'player',
          pattern: lower,
          canonicalName: player.name,
          player,
          caseSensitive: false,
        })
      }
    }

    for (const champName of allowlist.champions) {
      const catalog = champions.find((c) => c.name.toLowerCase() === champName)
      const display = catalog?.name ?? champName
      if (!isEligibleChampionName(display)) continue
      add({
        kind: 'champion',
        pattern: display,
        canonicalName: display,
        caseSensitive: false,
      })
    }
  } else {
    // Legacy path: team-scoped players only, never ambiguous names.
    for (const player of players) {
      if (!isEligiblePlayerName(player.name)) continue
      const playerTeam = resolveTeamCanonicalName(player.team).toLowerCase()
      if (teamSet.size && !teamSet.has(playerTeam)) continue
      add({
        kind: 'player',
        pattern: player.name,
        canonicalName: player.name,
        player,
        caseSensitive: false,
      })
    }

    for (const champ of champions) {
      if (!isEligibleChampionName(champ.name)) continue
      add({
        kind: 'champion',
        pattern: champ.name,
        canonicalName: champ.name,
        caseSensitive: false,
      })
    }
  }

  for (const team of teams) {
    const canonical = resolveTeamCanonicalName(team)
    const abbrev = teamSearchAbbreviation(canonical)

    if (canonical.length >= 5 && !RECAP_LINK_STOPWORDS.has(canonical.toLowerCase())) {
      add({
        kind: 'team',
        pattern: canonical,
        canonicalName: canonical,
        caseSensitive: false,
      })
    }

    if (isEligibleTeamTag(abbrev) && abbrev.toLowerCase() !== canonical.toLowerCase()) {
      add({
        kind: 'team',
        pattern: abbrev,
        canonicalName: canonical,
        // Short tags (T1, G2) must match case to avoid linking random "t1" prose.
        caseSensitive: isShortTag(abbrev),
      })
    }
  }

  return patterns.sort((a, b) => b.pattern.length - a.pattern.length)
}

export function linkifyRecapText(
  text: string,
  patterns: RecapEntityPattern[],
  allPlayers: Player[],
  keyPrefix: string,
): ReactNode[] {
  if (!text || !patterns.length) return [text]

  const out: ReactNode[] = []
  let cursor = 0
  let partIndex = 0

  while (cursor < text.length) {
    let hit: {
      start: number
      end: number
      pattern: RecapEntityPattern
      matched: string
    } | null = null

    for (const pattern of patterns) {
      const re = patternRegex(pattern)
      const sub = text.slice(cursor)
      const match = re.exec(sub)
      if (!match) continue
      const start = cursor + match.index
      const end = start + match[0].length
      // Never link pure numeric matches (stats like "13", "3-0" fragments).
      if (isPureNumber(match[0])) continue
      if (
        !hit ||
        start < hit.start ||
        (start === hit.start && match[0].length > hit.matched.length)
      ) {
        hit = { start, end, pattern, matched: match[0] }
      }
    }

    if (!hit) {
      out.push(text.slice(cursor))
      break
    }

    if (hit.start > cursor) {
      out.push(text.slice(cursor, hit.start))
    }

    const p = hit.pattern
    const linkKey = `${keyPrefix}-${partIndex++}`

    if (p.kind === 'player') {
      out.push(
        <EntityLink
          key={linkKey}
          type="player"
          name={p.canonicalName}
          player={p.player}
          allPlayers={allPlayers}
          showIcon={false}
          className="overview-recap-entity-link"
        >
          {hit.matched}
        </EntityLink>,
      )
    } else if (p.kind === 'champion') {
      out.push(
        <EntityLink
          key={linkKey}
          type="champion"
          name={p.canonicalName}
          showIcon={false}
          className="overview-recap-entity-link"
        >
          {hit.matched}
        </EntityLink>,
      )
    } else {
      out.push(
        <EntityLink
          key={linkKey}
          type="team"
          name={p.canonicalName}
          showIcon={false}
          className="overview-recap-entity-link"
        >
          {hit.matched}
        </EntityLink>,
      )
    }

    cursor = hit.end
  }

  return out
}

export function recapTeamsForLine(line: {
  score: { winner: string; loser: string }
  segments: WeeklyRecapSegment[]
}): string[] {
  const names = new Set<string>([line.score.winner, line.score.loser])
  for (const seg of line.segments) {
    if (seg.kind === 'team') names.add(seg.canonicalName)
  }
  return [...names]
}
