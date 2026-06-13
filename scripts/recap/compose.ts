import type { SeriesBrief } from '../../src/lib/weeklyRecap.ts'
import type { WeeklyRecapLine, WeeklyRecapSegment } from '../../src/lib/weeklyRecap.ts'
import { recapLineToText } from '../../src/lib/weeklyRecap.ts'
import { factsToPromptJson } from '../../src/lib/recapFacts.ts'
import { recapTeamTag } from '../../src/lib/recapTeamTag.ts'
import { teamSearchAbbreviation } from '../../src/lib/entities/entityMap.ts'
import { resolveTeamCanonicalName } from '../../src/lib/entities/slugs.ts'
import { generateRecapJson } from './openrouter.ts'

const WINNER_TOKEN = '{{WINNER}}'
const LOSER_TOKEN = '{{LOSER}}'

const SYSTEM_PROMPT = `You write tier-1 lolesports weekly recap one-liners for nucky.gg — sharp, opinionated, personality-forward.

Voice: lowercase, blunt, casual fan energy (twitch/reddit/x). NOT corporate broadcast. NOT formulaic template copy. Hot takes welcome. No emojis.

Your job: one cohesive recap (2–3 sentences, ~250–380 chars) that:
1. Opens with STAKES / CONTEXT when [EXTERNAL_CONTEXT] supports it (MSI qualification, title race, slump, revenge, playoffs) — cite only if RAG/context mentions it
2. States the series outcome clearly with exact score from facts.score
3. PRAISE standouts using facts.winnerStars / laneDuel / topCarry — cite real stats & champs from facts
4. BLUNTLY call out underperformers — facts.winnerConcerns (won but int'd), facts.loserStinkers, facts.leadBlownBy choke jobs. Be direct ("stinker", "lost lane every game", "might be the weak point")
5. Optional closing question or implication when natural

Team references: use ONLY the tokens {{WINNER}} and {{LOSER}} (never raw team names or abbrevs). UI renders logos from these tokens.
Player names: lowercase ign only.
Jungle: "outjungled" never "outlaned". Use facts.laneDuel.advantageVerb when relevant.
Use ONLY numbers/stats from [FACTS]. RAG may add narrative stakes but cannot contradict facts.

Style examples (structure + vibe only):
- "{{WINNER}} continues their good form, taking down {{LOSER}} 3-1 to qualify for MSI 2026 - zeka had great series, outlaning faker every game and having massive carry performances on ryze and yone. gumayusi lost lane every game tho - he might be the only weak point in this dominant {{WINNER}} team"
- "{{WINNER}} looks like title contenders once again, sweeping {{LOSER}} 3-0 despite tarzan outjungling xun in games 1 and 2. knight's ahri looks unstoppable yet again (13.7 kda)"
- "messy series as {{LOSER}} choke a 2-0 lead, getting reverse swept by {{WINNER}} - showmaker tried his best but siwoo and smash had some stinker performances"

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
    const tokens = new Set<string>([
      canonical,
      recapTeamTag(name),
      teamSearchAbbreviation(canonical),
      ...canonical.split(/\s+/),
    ])
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
        label: brief.facts.winnerAbbr,
      })
    } else if (part === LOSER_TOKEN) {
      segments.push({
        kind: 'team',
        canonicalName: brief.facts.loser,
        label: brief.facts.loserAbbr,
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

function validateLine(segments: WeeklyRecapSegment[], brief: SeriesBrief): void {
  const plain = segments.map((s) => (s.kind === 'text' ? s.value : s.label)).join('')
  if (!plain.includes(brief.facts.score)) {
    console.warn(`  score ${brief.facts.score} not found in: ${plain}`)
  }
  const teamSegs = segments.filter((s) => s.kind === 'team')
  if (teamSegs.length < 2) {
    throw new Error('Narrative missing team tokens — need {{WINNER}} and {{LOSER}}')
  }
}

export async function generateAiRecapLine(
  brief: SeriesBrief,
  ragContext: string,
  model?: string,
): Promise<{ line: WeeklyRecapLine; plainText: string; model: string }> {
  const factsJson = factsToPromptJson(brief.facts)
  const userPrompt = `[FACTS]
${factsJson}

[EXTERNAL_CONTEXT — reddit threads, liquipedia, standings/playoffs narrative; use for stakes/implications only]
${ragContext || '(none — lean on facts.narrativeHints and stats)'}

Write the full recap for this ${brief.facts.league} series. Winner={{WINNER}} (${brief.facts.winnerAbbr}), Loser={{LOSER}} (${brief.facts.loserAbbr}), score ${brief.facts.score}.
Must include {{WINNER}} and {{LOSER}} at least once each. Call out at least one standout AND one concern/stinker when facts support it.`

  const raw = await generateRecapJson(SYSTEM_PROMPT, userPrompt, model)
  const parsed = JSON.parse(raw) as unknown
  const narrative = parseNarrative(parsed)
  const segments = hydrateNarrative(narrative, brief)
  validateLine(segments, brief)

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
    model: model ?? process.env.RECAP_LLM_MODEL ?? 'google/gemini-2.5-flash',
  }
}

export function briefToTemplateLine(brief: SeriesBrief): WeeklyRecapLine {
  return brief.templateLine
}
