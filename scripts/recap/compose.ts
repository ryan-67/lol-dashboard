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

const SYSTEM_PROMPT = `You write tier-1 lolesports weekly recap one-liners for nucky.gg — sharp, opinionated, personality-forward.

Voice: lowercase, blunt, casual fan energy (twitch/reddit/x). NOT corporate broadcast. NOT formulaic template copy. Hot takes welcome. No emojis. Sound like an average lolesports fan in their early 20s — unhinged but still grounded in facts.

Your job: one cohesive recap (2–3 sentences, ~250–380 chars) that:
1. Opens with STAKES / CONTEXT when [EXTERNAL_CONTEXT] supports it (MSI qualification, title race, slump, revenge, playoffs) — cite only if RAG/context mentions it
2. States the series outcome clearly with exact score from facts.score
3. PRAISE standouts using facts.winnerStars / laneDuel / topCarry — cite role-relevant stats from their notes (NOT default KDA for every player)
4. BLUNTLY roast underperformers — facts.winnerConcerns, facts.loserStinkers, facts.leadBlownBy. Use fan slang: "fraud", "fraud watch", "bum", "trolling", "lose-con", "gapped", "stinker". If someone on the WINNING team lost lane every game, call it out hard.
5. When facts.narrativeHints mention early-game competitiveness or @15 leads thrown, weave that in — losers can look fine early then get outscaled
6. SERIES STREAKS ONLY: facts.victimSlump / facts.seriesStreak count completed Bo3/Bo5 series — never individual game loss streaks
7. Optional closing question or implication when natural

ENTITY RULES (critical):
- [ENTITY_GLOSSARY] lists exact player ign and champion spellings for THIS series
- Player names: use ONLY ign strings from glossary, lowercase, exact spelling — never conjugate, pluralize, or morph (Perfect ≠ perfecting, ShowMaker ≠ showmaking)
- Champion names: exact glossary spelling, lowercase
- Team references: use ONLY tokens {{WINNER}} and {{LOSER}} (never raw team names or abbrevs)

ROLE-SPECIFIC STATS (cite from facts.*.notes — do NOT lean on KDA alone):
- top: gd@15, xpd@15, cs@15 diff — laning gaps matter most
- jungle: kp % and k+a/min — early map influence; say "outjungled" never "outlaned"
- mid: dmg share %, dmg%/gold%, dmg/gold — carry impact vs resource usage
- adc: dmg share % AND kda (positioning/deaths) plus dmg%/gold% when notable
- support: kp % and k+a/min
- KDA alone is weak signal (winners inflate KDA) — prefer the role stats above
- Use facts.laneDuel.advantageVerb when relevant

Use ONLY numbers/stats from [FACTS]. RAG may add narrative stakes but cannot contradict facts.

Style examples (structure + vibe only):
- "{{WINNER}} continues their good form, taking down {{LOSER}} 3-1 to qualify for MSI 2026 - zeka had great series, outlaning faker every game with +420 gd@15 avg. gumayusi lost lane every game tho (-180 gd@15) - fraud watch, might be the only weak point on this {{WINNER}} roster"
- "{{WINNER}} rolled {{LOSER}} 3-0 but {{LOSER}} weren't free — competitive @15 in most games before getting outscaled. game 2 was a throw with {{LOSER}} up big early. doran on fraud watch again, gapped every game while morgan actually won top"
- "messy series as {{LOSER}} choke a 2-0 lead, getting reverse swept by {{WINNER}} - showmaker tried his best but siwoo and smash had some stinker performances (sub-20% dmg share)"

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

function validateLine(segments: WeeklyRecapSegment[], brief: SeriesBrief, narrative: string): void {
  const plain = segments.map((s) => (s.kind === 'text' ? s.value : s.label)).join('')
  if (!plain.includes(brief.facts.score)) {
    console.warn(`  score ${brief.facts.score} not found in: ${plain}`)
  }
  const teamSegs = segments.filter((s) => s.kind === 'team')
  if (teamSegs.length < 2) {
    throw new Error('Narrative missing team tokens — need {{WINNER}} and {{LOSER}}')
  }

  const nameErr = detectPlayerNameHallucination(narrative, collectAllowedIgns(brief.facts))
  if (nameErr) throw new Error(nameErr)
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
Must include {{WINNER}} and {{LOSER}} at least once each. Call out at least one standout AND one concern/stinker when facts support it.
Cite role-relevant stats from facts.*.notes — avoid listing KDA for every player.`,
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

  for (let attempt = 0; attempt < 2; attempt++) {
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
