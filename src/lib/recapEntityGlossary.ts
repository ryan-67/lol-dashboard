import type { SeriesFacts } from './recapFacts'
import { recapTeamTag } from './recapTeamTag'

export interface RecapEntityGlossary {
  players: Array<{ ign: string; teamAbbr: string; role: string | null }>
  champions: string[]
}

/** Exact ign / champion spellings for this series — prevents LLM morphing names like Perfect → perfecting. */
export function buildRecapEntityGlossary(facts: SeriesFacts): RecapEntityGlossary {
  const byKey = new Map<string, RecapEntityGlossary['players'][number]>()
  const champions = new Set<string>()

  const ingest = (name: string, team: string, role: string | null, champs?: string[]) => {
    const ign = name.trim()
    if (!ign) return
    const key = `${team}|${ign.toLowerCase()}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        ign: ign.toLowerCase(),
        teamAbbr: recapTeamTag(team),
        role,
      })
    }
    for (const c of champs ?? []) {
      if (c) champions.add(c.toLowerCase())
    }
  }

  const pools = [
    facts.winnerStars,
    facts.winnerConcerns,
    facts.loserBrightSpots,
    facts.loserStinkers,
  ]
  for (const pool of pools) {
    for (const p of pool) {
      ingest(p.name, p.team, p.role, p.champions)
    }
  }
  if (facts.topCarry) {
    ingest(facts.topCarry.name, facts.topCarry.team, facts.topCarry.role, facts.topCarry.champions)
  }
  if (facts.laneDuel) {
    ingest(facts.laneDuel.dominator, facts.winner, facts.laneDuel.role)
    ingest(facts.laneDuel.victim, facts.loser, facts.laneDuel.role)
  }
  for (const p of facts.participants ?? []) {
    ingest(p.ign, p.team, p.role, p.champions)
  }

  return {
    players: [...byKey.values()].sort((a, b) => a.ign.localeCompare(b.ign)),
    champions: [...champions].sort((a, b) => a.localeCompare(b)),
  }
}

export function glossaryToPromptJson(glossary: RecapEntityGlossary): string {
  return JSON.stringify(glossary, null, 2)
}

const NAME_SUFFIXES = ['ing', 'ed', 'er', 'ers', 's', 'es', 'ly']

/** Detect morphological hallucinations (e.g. perfect → perfecting). Returns error message or null. */
export function detectPlayerNameHallucination(
  narrative: string,
  allowedIgns: string[],
): string | null {
  const allowed = new Set(allowedIgns.map((n) => n.toLowerCase()))
  const words = narrative.toLowerCase().match(/\b[a-z][a-z0-9']+\b/g) ?? []

  for (const word of words) {
    if (allowed.has(word)) continue
    for (const suffix of NAME_SUFFIXES) {
      if (!word.endsWith(suffix) || word.length <= suffix.length + 2) continue
      const stem = word.slice(0, -suffix.length)
      if (allowed.has(stem)) {
        return `"${word}" looks like a mangled form of player ign "${stem}" — use exact ign only`
      }
    }
  }
  return null
}

export function collectAllowedIgns(facts: SeriesFacts): string[] {
  const glossary = buildRecapEntityGlossary(facts)
  return glossary.players.map((p) => p.ign)
}
