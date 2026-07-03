import type { SeriesBrief } from '../../src/lib/weeklyRecap.ts'
import type { WeeklyRecapLine, WeeklyRecapSegment } from '../../src/lib/weeklyRecap.ts'
import { recapLineToText } from '../../src/lib/weeklyRecap.ts'
import { factsToPromptJson } from '../../src/lib/recapFacts.ts'
import { recapTeamTag } from '../../src/lib/recapTeamTag.ts'
import { teamSearchAbbreviation } from '../../src/lib/entities/entityMap.ts'
import { resolveTeamCanonicalName } from '../../src/lib/entities/slugs.ts'
import {
  buildRecapEntityGlossary,
  collectAllowedIgns,
  detectPlayerNameHallucination,
  glossaryToPromptJson,
} from '../../src/lib/recapEntityGlossary.ts'
import { generateRecapJson } from './openrouter.ts'

const WINNER_TOKEN = '{{WINNER}}'
const LOSER_TOKEN = '{{LOSER}}'

const SYSTEM_PROMPT = `You write tier-1 lolesports weekly recap blurbs for nucky.gg — sharp, opinionated, personality-forward.

Voice: lowercase, blunt, casual fan energy (twitch/reddit/x). NOT corporate broadcast. NOT formulaic template copy. Hot takes welcome. No emojis. Sound like an average lolesports fan in their early 20s — unhinged but still grounded in facts.

LENGTH (required): 3–5 full sentences, ~320–520 characters. Every recap must feel complete: tournament stakes, outcome, standout WITH role-correct stats, concern/bright spot, and advancement/elimination when facts.narrativeHints support it.

Your job:
1. Open with TOURNAMENT CONTEXT when available (facts.tournamentLabel + narrativeHints about play-in finals, advancement, elimination, next opponent). Example stakes: play-in finals sending a team home, advancing to bracket, reverse sweep sending a team to lower bracket.
2. State the series outcome with exact score from facts.score — vary verbs (dismantled, edged, reverse swept, survived, stole, hung on). NEVER use "rolled" / "rolling" / "keep rolling" / "another clean".
3. PRAISE standouts using facts.winnerStars / laneDuel / topCarry — cite ONLY role-correct stats from their notes.
4. Roast underperformers using facts.winnerConcerns / loserStinkers — role-correct stats only. Reserve "fraud" / "fraud watch" ONLY when fraudEligible is true. Never call a weak-side player a fraud.
5. Include loser bright spots when facts.loserBrightSpots has someone (e.g. solid dmg share in a loss).
6. Close with implications from narrativeHints when present (advances to face X, eliminated/sent home, continues in lower bracket). Do NOT invent next opponents or eliminations not in facts/RAG.
7. SERIES STREAKS ONLY: facts.victimSlump / facts.seriesStreak count completed Bo3/Bo5 series.

ROLE-SPECIFIC PERFORMANCE (critical — wrong metrics = failed recap):
- TOP: gd@15, csd@15, xpd@15. "heavily gapped" only if notes say so (typically |gd@15| ≥ 800). ~500 gold is a slight lane edge, NOT a stomp.
- JUNGLE / SUPPORT: kp %, k+a/min. Never judge them primarily on gd@15. Say "outjungled" for jungle, not "outlaned".
- MID / ADC (carries): dmg share %, dmg%/gold%, kda. NEVER say an ADC was "completely gapped" from gd@15 — bot lane gold is shared. GD@15 for ADC is at most a mild "bot was starved early" note when extreme (≤ -1000) and notes say so.
- Do NOT invent "pulled out the [champ]" lines unless facts.pocketPick is present (rare champ + low career games on it).

ENTITY RULES:
- [ENTITY_GLOSSARY] lists exact player ign and champion spellings for THIS series
- Player names: ONLY glossary igns, lowercase, exact spelling
- Champion names: exact glossary spelling, lowercase
- Team references: ONLY tokens {{WINNER}} and {{LOSER}}

Use ONLY numbers/stats from [FACTS]. RAG may add narrative stakes but cannot contradict facts.

Style examples (structure + vibe only — do NOT copy verbatim):
- "{{WINNER}} dismantled {{LOSER}} 3-0 in the msi play-in finals, advancing to the bracket stage and sending {{LOSER}} home. doran finally had a good series (+1087 gd@15, +21.7 csd@15), fighting back against fraud allegations and gapping morgan. oner popped off with 78% kp, while quid was the only bright spot for {{LOSER}} at 27% dmg share."
- "{{LOSER}} completely sold a 2-0 lead, getting reverse swept by {{WINNER}}. skewmond and labrov showcased synergy (72% kp / 0.42 k+a/min and 80% kp). creme tried his best with high damage numbers, but couldn't get it done. {{WINNER}} moves on in 2026 msi while {{LOSER}} continues through the lower bracket."

Output JSON only:
{ "narrative": "full recap with {{WINNER}} and {{LOSER}} tokens" }`

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function teamAliases(brief: SeriesBrief): Array<{ pattern: RegExp; token: string }> {
  const pairs = [
    { name: brief.facts.winner, token: WINNER_TOKEN },
    { name: brief.facts.loser, token: LOSER_TOKEN },
  ]
  const rules: Array<{ pattern: RegExp; token: string }> = []

  for (const { name, token } of pairs) {
    const canonical = resolveTeamCanonicalName(name)
    const tokens = new Set<string>([recapTeamTag(name), teamSearchAbbreviation(canonical)])
    for (const t of tokens) {
      if (t.length < 2) continue
      rules.push({ pattern: new RegExp(`\\b${escapeRegex(t)}\\b`, 'gi'), token })
    }
  }

  return rules.sort((a, b) => b.pattern.source.length - a.pattern.source.length)
}

function normalizeToTokens(narrative: string, brief: SeriesBrief): string {
  let out = narrative.trim()
  for (const { pattern, token } of teamAliases(brief)) {
    out = out.replace(pattern, token)
  }
  return out
}

function hydrateNarrative(narrative: string, brief: SeriesBrief): WeeklyRecapSegment[] {
  const normalized = normalizeToTokens(narrative, brief)
  const parts = normalized.split(/(\{\{WINNER\}\}|\{\{LOSER\}\})/g)
  const segments: WeeklyRecapSegment[] = []

  for (const part of parts) {
    if (!part) continue
    if (part === WINNER_TOKEN) {
      segments.push({
        kind: 'team',
        canonicalName: brief.facts.winner,
        label: recapTeamTag(brief.facts.winner),
      })
    } else if (part === LOSER_TOKEN) {
      segments.push({
        kind: 'team',
        canonicalName: brief.facts.loser,
        label: recapTeamTag(brief.facts.loser),
      })
    } else {
      segments.push({ kind: 'text', value: part })
    }
  }

  return mergeAdjacentText(segments)
}

function mergeAdjacentText(segments: WeeklyRecapSegment[]): WeeklyRecapSegment[] {
  const out: WeeklyRecapSegment[] = []
  for (const seg of segments) {
    const prev = out[out.length - 1]
    if (seg.kind === 'text' && prev?.kind === 'text') {
      prev.value += seg.value
    } else {
      out.push(seg)
    }
  }
  return out.filter((s) => s.kind !== 'text' || s.value.length > 0)
}

function parseNarrative(raw: unknown): string {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid LLM payload')
  const narrative = String((raw as { narrative?: string }).narrative ?? '').trim()
  if (!narrative) throw new Error('Missing narrative string')
  return narrative
}

const MIN_RECAP_CHARS = 300
const BANNED_OPENERS = /\b(rolled|keep rolling|another clean)\b/i

function validateLine(segments: WeeklyRecapSegment[], brief: SeriesBrief, narrative: string): void {
  const plain = segments.map((s) => (s.kind === 'text' ? s.value : s.label)).join('')
  if (!plain.includes(brief.facts.score)) {
    console.warn(`  score ${brief.facts.score} not found in: ${plain}`)
  }
  const teamSegs = segments.filter((s) => s.kind === 'team')
  if (teamSegs.length < 2) {
    throw new Error('Narrative missing team tokens — need {{WINNER}} and {{LOSER}}')
  }

  if (plain.replace(/\s+/g, ' ').trim().length < MIN_RECAP_CHARS) {
    throw new Error(
      `Recap too short (${plain.length} chars) — need 3–4 sentences (~${MIN_RECAP_CHARS}+ chars) with standout + concern stats`,
    )
  }

  if (BANNED_OPENERS.test(narrative)) {
    throw new Error('Recap uses banned cliché opener (rolled/rolling/another clean) — vary the opening')
  }

  const nameErr = detectPlayerNameHallucination(narrative, collectAllowedIgns(brief.facts))
  if (nameErr) throw new Error(nameErr)

  const fraudUsed = /\bfraud\b/i.test(narrative)
  if (fraudUsed) {
    const allPlayers = [
      ...brief.facts.winnerStars,
      ...brief.facts.winnerConcerns,
      ...brief.facts.loserStinkers,
      ...brief.facts.loserBrightSpots,
    ]
    const anyEligible = allPlayers.some((p) => p.fraudEligible)
    const notesMentionFraud = allPlayers.some((p) =>
      p.notes.some((n) => /fraud watch/i.test(n)),
    )
    if (!anyEligible && !notesMentionFraud) {
      throw new Error(
        'Used "fraud" but no player has fraudEligible=true — use stinker/gapped for weak-side players',
      )
    }
  }
}

function buildUserPrompt(brief: SeriesBrief, ragContext: string, correction?: string): string {
  const factsJson = factsToPromptJson(brief.facts)
  const glossaryJson = glossaryToPromptJson(buildRecapEntityGlossary(brief.facts))

  const parts = [
    `[FACTS]
${factsJson}`,
    `[ENTITY_GLOSSARY — exact spellings only; never alter player igns]
${glossaryJson}`,
    `[EXTERNAL_CONTEXT — reddit threads, liquipedia, standings/playoffs narrative; use for stakes/implications only]
${ragContext || '(none — lean on facts.narrativeHints and stats)'}`,
  ]

  if (correction) {
    parts.push(`[CORRECTION — previous draft rejected]
${correction}`)
  }

  parts.push(
    `Write the full recap for this ${brief.facts.tournamentLabel ?? brief.facts.league} series. Winner={{WINNER}} (${brief.facts.winnerAbbr}), Loser={{LOSER}} (${brief.facts.loserAbbr}), score ${brief.facts.score}.
Must include {{WINNER}} and {{LOSER}} at least once each. Minimum 3–4 sentences (~320+ chars).
Use tournament/advancement/elimination hints from facts.narrativeHints when present.
Call out at least one standout AND one concern or loser bright spot — each with ROLE-CORRECT stats from facts.*.notes (top=gd@15, jg/sup=kp, mid/adc=dmg share — never "gapped" an ADC from gd@15).
"fraud" only when a player's fraudEligible is true. Only mention rare pocket picks if facts.pocketPick is set.`,
  )

  return parts.join('\n\n')
}

export async function generateAiRecapLine(
  brief: SeriesBrief,
  ragContext: string,
  model?: string,
): Promise<{ line: WeeklyRecapLine; plainText: string; model: string }> {
  const resolvedModel = model ?? process.env.RECAP_LLM_MODEL ?? 'google/gemini-2.5-flash'
  let correction: string | undefined
  let lastErr: Error | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const userPrompt = buildUserPrompt(brief, ragContext, correction)
      const raw = await generateRecapJson(SYSTEM_PROMPT, userPrompt, resolvedModel)
      const parsed = JSON.parse(raw) as unknown
      const narrative = parseNarrative(parsed)
      const segments = hydrateNarrative(narrative, brief)
      validateLine(segments, brief, narrative)

      const line: WeeklyRecapLine = {
        id: brief.seriesId,
        date: brief.date,
        dateLabel: brief.dateLabel,
        segments,
        score: {
          winner: brief.facts.winner,
          loser: brief.facts.loser,
          winnerAbbr: brief.facts.winnerAbbr,
          loserAbbr: brief.facts.loserAbbr,
          score: brief.facts.score,
        },
      }
      return {
        line,
        plainText: recapLineToText(line),
        model: resolvedModel,
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      correction = lastErr.message
      if (attempt === 0) console.warn(`  recap validation retry: ${correction}`)
    }
  }

  throw lastErr ?? new Error('AI recap generation failed')
}

export function briefToTemplateLine(brief: SeriesBrief): WeeklyRecapLine {
  return brief.templateLine
}
