import type { ReactNode } from 'react'
import type { Champion, Player } from '../hooks/useDashboardData'
import type { WeeklyRecapSegment } from './weeklyRecap'
import EntityLink from '../components/entities/EntityLink'
import { teamSearchAbbreviation } from './entities/entityMap'
import { resolveTeamCanonicalName } from './entities/slugs'

export type RecapEntityKind = 'player' | 'team' | 'champion'

export interface RecapEntityPattern {
  kind: RecapEntityKind
  pattern: string
  canonicalName: string
  player?: Player
  caseSensitive: boolean
}

/** Common English words that must not become entity links when matched case-insensitively. */
const RECAP_LINK_STOPWORDS = new Set([
  'on',
  'up',
  'in',
  'is',
  'it',
  'as',
  'at',
  'be',
  'do',
  'go',
  'or',
  'to',
  'so',
  'no',
  'an',
  'am',
  'we',
  'he',
  'if',
  'my',
  'by',
  'of',
  'vs',
  'the',
  'and',
  'for',
  'but',
  'out',
  'off',
  'yet',
  'had',
  'has',
  'was',
  'are',
  'all',
  'any',
  'can',
  'did',
  'get',
  'got',
  'how',
  'its',
  'let',
  'may',
  'new',
  'now',
  'old',
  'our',
  'own',
  'put',
  'run',
  'say',
  'see',
  'set',
  'too',
  'try',
  'use',
  'way',
  'who',
  'why',
  'win',
  'won',
  'top',
  'mid',
  'bot',
  'jg',
])

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isShortTag(value: string): boolean {
  return value.length <= 4 && /^[A-Z0-9]+$/.test(value)
}

function isEligiblePlayerName(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.length < 3) return false
  if (RECAP_LINK_STOPWORDS.has(lower)) return false
  return true
}

function isEligibleTeamTag(tag: string): boolean {
  if (isShortTag(tag)) {
    return tag.length >= 2 && !RECAP_LINK_STOPWORDS.has(tag.toLowerCase())
  }
  if (tag.length < 3) return false
  return !RECAP_LINK_STOPWORDS.has(tag.toLowerCase())
}

function isEligibleChampionName(name: string): boolean {
  return name.length >= 3 && !RECAP_LINK_STOPWORDS.has(name.toLowerCase())
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

/** Build link patterns only for entities that actually appear in this recap text. */
export function buildRecapEntityPatternsForText(
  text: string,
  players: Player[],
  champions: Champion[],
  teams: string[],
): RecapEntityPattern[] {
  if (!text.trim()) return []

  const patterns: RecapEntityPattern[] = []
  const seen = new Set<string>()

  const add = (pattern: RecapEntityPattern) => {
    const key = `${pattern.kind}:${pattern.pattern.toLowerCase()}`
    if (seen.has(key)) return
    if (!patternMatchesText(pattern, text)) return
    seen.add(key)
    patterns.push(pattern)
  }

  for (const player of players) {
    if (!isEligiblePlayerName(player.name)) continue
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

export function recapTeamsForLine(line: { score: { winner: string; loser: string }; segments: WeeklyRecapSegment[] }): string[] {
  const names = new Set<string>([line.score.winner, line.score.loser])
  for (const seg of line.segments) {
    if (seg.kind === 'team') names.add(seg.canonicalName)
  }
  return [...names]
}
