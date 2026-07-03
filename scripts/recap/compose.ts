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

LENGTH (required): 3–4 full sentences, ~280–420 characters. Every recap must feel complete — stakes, outcome, at least one standout WITH a stat, and at least one roast/concern WITH a stat when facts support it. One-liner recaps are rejected.

Your job:
1. Open with VARIED stakes/context — never default to "rolled", "rolling", or "keep rolling". Rotate: clinched, dismantled, edged, survived, stole, ran through, hung on, reverse swept, etc.
2. State the series outcome with exact score from facts.score
3. PRAISE standouts using facts.winnerStars / laneDuel / topCarry — cite role-relevant stats from their notes (NOT default KDA for every player)
4. Roast underperformers bluntly — facts.winnerConcerns, facts.loserStinkers, facts.leadBlownBy. Use varied slang: "stinker", "trolling", "gapped", "bum", "inting", "lose-con", "got exposed". Reserve "fraud" / "fraud watch" ONLY for players where fraudEligible is true in facts (top-tier roster / expected star playing poorly). Never call a weak-side or low-expectation player a fraud — use "stinker" or "gapped" instead.
5. When facts.narrativeHints mention early-game competitiveness or @15 leads thrown, weave that in
6. SERIES STREAKS ONLY: facts.victimSlump / facts.seriesStreak count completed Bo3/Bo5 series — never individual game loss streaks
7. Optional closing implication when natural — don't force it

BANNED CLICHÉS (do not use): "rolled", "rolling", "keep rolling", "another clean" as a formula opener.

ENTITY RULES (critical):
- [ENTITY_GLOSSARY] lists exact player ign and champion spellings for THIS series
- Player names: use ONLY ign strings from glossary, lowercase, exact spelling — never conjugate, pluralize, or morph
- Champion names: exact glossary spelling, lowercase
- Team references: use ONLY tokens {{WINNER}} and {{LOSER}}

ROLE-SPECIFIC STATS (cite from facts.*.notes — do NOT lean on KDA alone):
- top: gd@15, xpd@15, cs@15 diff
- jungle: kp % and k+a/min — say "outjungled" never "outlaned"
- mid/adc: dmg share %, dmg%/gold%
- support: kp % and k+a/min

Use ONLY numbers/stats from [FACTS]. RAG may add narrative stakes but cannot contradict facts.

Style examples (structure + vibe only — do NOT copy phrases verbatim):
- "{{WINNER}} punched their MSI ticket with a {{LOSER}} 3-1 — zeka owned mid every map (+420 gd@15 avg) while gumayusi got exposed bot (-180 gd@15) on a roster that otherwise looks unbeatable"
- "wild reverse sweep as {{LOSER}} blew a 2-0 lead — {{WINNER}} stole games 3-5 behind canyon's map control (78% kp). brokenblade got gapped top but it didn't matter once late game hit"

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

const MIN_RECAP_CHARS = 240
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
    `Write the full recap for this ${brief.facts.league} series. Winner={{WINNER}} (${brief.facts.winnerAbbr}), Loser={{LOSER}} (${brief.facts.loserAbbr}), score ${brief.facts.score}.
Must include {{WINNER}} and {{LOSER}} at least once each. Minimum 3 sentences (~280+ chars).
Call out at least one standout AND one concern/stinker when facts support it — each with a role-relevant stat from facts.*.notes.
"fraud" only when a player's fraudEligible is true in [FACTS].`,
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
