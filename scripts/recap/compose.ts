import type { SeriesBrief } from '../../src/lib/weeklyRecap.ts'
import type { WeeklyRecapLine, WeeklyRecapSegment } from '../../src/lib/weeklyRecap.ts'
import { recapLineToText } from '../../src/lib/weeklyRecap.ts'
import { factsToPromptJson } from '../../src/lib/recapFacts.ts'
import { teamSearchAbbreviation } from '../../src/lib/entities/entityMap.ts'
import { resolveTeamCanonicalName } from '../../src/lib/entities/slugs.ts'
import { generateRecapJson } from './openrouter.ts'

const SYSTEM_PROMPT = `You write one-line tier-1 lolesports weekly recap summaries for nucky.gg.

Voice: lowercase, blunt, casual — like a sharp 20-something fan in 2026. twitch/reddit/x energy is fine. no corporate esports broadcaster tone. no emojis.

Rules:
- Use ONLY stats and facts from [FACTS] JSON. Never invent scores, stats, or player numbers.
- You may use [EXTERNAL_CONTEXT] for narrative/historical/community vibe (reddit threads, storylines) but do not contradict [FACTS].
- Must mention the exact series score from facts.score.
- One or two sentences max. ~220 characters target unless the series needs more.
- Use team abbreviations in team segments (T1, G2, BLG, C9, etc.) not full org names in labels.
- For jungle matchups use "outjungled" (never "outlaned") when describing GD@15/jungle advantages; use "outlaned" for top/mid/bot/support only. facts.laneDuel.advantageVerb is authoritative when present.

Output JSON only:
{
  "segments": [
    { "kind": "text", "value": "..." },
    { "kind": "team", "canonicalName": "Exact Canonical Team Name", "label": "TAG" },
    ...
  ]
}

Include inline team segments wherever a team is referenced so logos render. alternate text and team segments naturally.`

function teamTag(name: string): string {
  const canonical = resolveTeamCanonicalName(name)
  const mapped = teamSearchAbbreviation(canonical)
  if (mapped !== canonical && mapped.length <= 6) return mapped.toUpperCase()
  return canonical.split(/\s+/)[0]?.toUpperCase() ?? canonical.toUpperCase()
}

function normalizeSegments(raw: unknown, brief: SeriesBrief): WeeklyRecapSegment[] {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid segments payload')
  const segments = (raw as { segments?: unknown }).segments
  if (!Array.isArray(segments) || !segments.length) throw new Error('Missing segments array')

  const out: WeeklyRecapSegment[] = []
  for (const seg of segments) {
    if (!seg || typeof seg !== 'object') continue
    const kind = (seg as { kind?: string }).kind
    if (kind === 'text') {
      const value = String((seg as { value?: string }).value ?? '')
      if (value) out.push({ kind: 'text', value })
    } else if (kind === 'team') {
      const canonicalName = resolveTeamCanonicalName(
        String((seg as { canonicalName?: string }).canonicalName ?? ''),
      )
      const label =
        String((seg as { label?: string }).label ?? '').trim() || teamTag(canonicalName)
      out.push({ kind: 'team', canonicalName, label: label.toUpperCase() })
    }
  }
  if (!out.length) throw new Error('No valid segments parsed')

  const plain = out.map((s) => (s.kind === 'text' ? s.value : s.label)).join('')
  if (!plain.includes(brief.facts.score.replace('-', '')) && !plain.includes(brief.facts.score)) {
    // allow "3-1" or partial — warn only
    console.warn(`  score ${brief.facts.score} not found verbatim in: ${plain}`)
  }
  return out
}

export async function generateAiRecapLine(
  brief: SeriesBrief,
  ragContext: string,
  model?: string,
): Promise<{ line: WeeklyRecapLine; plainText: string; model: string }> {
  const factsJson = factsToPromptJson(brief.facts)
  const userPrompt = `[FACTS]
${factsJson}

[EXTERNAL_CONTEXT]
${ragContext || '(none — stats only)'}

Write the recap for ${brief.facts.winner} vs ${brief.facts.loser} (${brief.facts.score}, ${brief.league}).`

  const raw = await generateRecapJson(SYSTEM_PROMPT, userPrompt, model)
  const parsed = JSON.parse(raw) as unknown
  const segments = normalizeSegments(parsed, brief)
  const line: WeeklyRecapLine = {
    id: brief.seriesId,
    date: brief.date,
    dateLabel: brief.dateLabel,
    segments,
  }
  return {
    line,
    plainText: recapLineToText(line),
    model: model ?? process.env.RECAP_LLM_MODEL ?? 'google/gemini-2.0-flash-001',
  }
}

export function briefToTemplateLine(brief: SeriesBrief): WeeklyRecapLine {
  return brief.templateLine
}
