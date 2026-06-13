import type { ReactNode } from 'react'
import type { Champion, Player } from '../hooks/useDashboardData'
import EntityLink from '../components/entities/EntityLink'
import { resolveTeamCanonicalName } from './entities/slugs'
import { recapTeamTag } from './recapTeamTag'

export type RecapEntityKind = 'player' | 'team' | 'champion'

export interface RecapEntityPattern {
  kind: RecapEntityKind
  pattern: string
  canonicalName: string
  player?: Player
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Longest-match entity patterns for recap text linkification. */
export function buildRecapEntityPatterns(
  players: Player[],
  champions: Champion[],
  teams: string[],
): RecapEntityPattern[] {
  const patterns: RecapEntityPattern[] = []
  const seen = new Set<string>()

  for (const player of players) {
    const key = `player:${player.name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    patterns.push({
      kind: 'player',
      pattern: player.name,
      canonicalName: player.name,
      player,
    })
  }

  for (const champ of champions) {
    const key = `champion:${champ.name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    patterns.push({
      kind: 'champion',
      pattern: champ.name,
      canonicalName: champ.name,
    })
  }

  for (const team of teams) {
    const canonical = resolveTeamCanonicalName(team)
    const variants = new Set([canonical, recapTeamTag(canonical)])
    for (const word of canonical.split(/\s+/)) {
      if (word.length >= 3) variants.add(word)
    }
    for (const variant of variants) {
      const key = `team:${variant.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      patterns.push({
        kind: 'team',
        pattern: variant,
        canonicalName: canonical,
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
  if (!text) return []

  const out: ReactNode[] = []
  let cursor = 0
  let partIndex = 0

  while (cursor < text.length) {
    let hit: { start: number; end: number; pattern: RecapEntityPattern; matched: string } | null =
      null

    for (const pattern of patterns) {
      const re = new RegExp(`\\b${escapeRegex(pattern.pattern)}\\b`, 'i')
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
