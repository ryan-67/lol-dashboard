import type { SeriesBrief } from '../../src/lib/weeklyRecap.ts'
import type { WeeklyRecapLine, WeeklyRecapSegment } from '../../src/lib/weeklyRecap.ts'
import {
  buildFallbackRecapShell,
  extractRecapShellSegments,
  recapLineToText,
} from '../../src/lib/weeklyRecap.ts'
import { factsToPromptJson } from '../../src/lib/recapFacts.ts'
import { teamSearchAbbreviation } from '../../src/lib/entities/entityMap.ts'
import { resolveTeamCanonicalName } from '../../src/lib/entities/slugs.ts'
import { generateRecapJson } from './openrouter.ts'

const SYSTEM_PROMPT = `You write the stat/context clause for tier-1 lolesports weekly recap lines on nucky.gg.

The UI already renders team logos, names, score, and league. You ONLY write the trailing detail clause.

Voice: lowercase, blunt, casual — like a sharp 20-something fan in 2026. twitch/reddit/x energy is fine. no corporate esports broadcaster tone. no emojis.

Rules:
- Use ONLY stats and facts from [FACTS] JSON. Never invent scores, stats, or player numbers.
- You may use [EXTERNAL_CONTEXT] for narrative/historical/community vibe but do not contradict [FACTS].
- Do NOT mention team names, org names, or team abbreviations (no HLE, T1, BLG, etc.) — refer to players by lowercase ign.
- Do NOT repeat the series score or league — those are already shown.
- One sentence, ~120–180 characters. Stats + vibe, not a play-by-play.
- For jungle matchups use "outjungled" (never "outlaned"); for lanes use "outlaned". facts.laneDuel.advantageVerb is authoritative.

Output JSON only:
{ "detail": "your clause here without leading dash" }

Example detail: "zeka's ryze was a menace (8.6 kda avg) and delight outlaned keria every game"`

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function teamTokens(brief: SeriesBrief): string[] {
  const names = [brief.facts.winner, brief.facts.loser, brief.teamA, brief.teamB]
  const tokens = new Set<string>()
  for (const name of names) {
    const canonical = resolveTeamCanonicalName(name)
    tokens.add(canonical.toLowerCase())
    tokens.add(teamSearchAbbreviation(canonical).toLowerCase())
    for (const word of canonical.split(/\s+/)) {
      if (word.length >= 2) tokens.add(word.toLowerCase())
    }
  }
  return [...tokens].sort((a, b) => b.length - a.length)
}

function sanitizeDetail(detail: string, brief: SeriesBrief): string {
  let out = detail.trim().replace(/^[—–\-:\s]+/, '')
  for (const token of teamTokens(brief)) {
    if (token.length < 2) continue
    out = out.replace(new RegExp(`\\b${escapeRegex(token)}\\b`, 'gi'), '')
  }
  out = out.replace(new RegExp(`\\b${escapeRegex(brief.facts.score)}\\b`, 'g'), '')
  out = out.replace(/\(\s*(lck|lpl|lec|lcs)\s*\)/gi, '')
  out = out.replace(/\s{2,}/g, ' ').replace(/^[,.\s—–-]+/, '').trim()
  return out
}

function shellSegments(brief: SeriesBrief): WeeklyRecapSegment[] {
  const shell = extractRecapShellSegments(brief.templateLine, brief.facts.score)
  const hasScore = shell.some(
    (s) => s.kind === 'text' && s.value.includes(brief.facts.score),
  )
  return hasScore && shell.length >= 2 ? shell : buildFallbackRecapShell(brief)
}

function assembleAiRecapLine(brief: SeriesBrief, detailRaw: string): WeeklyRecapLine {
  const segments = shellSegments(brief)
  const detail = sanitizeDetail(detailRaw, brief)
  if (detail) segments.push({ kind: 'text', value: ` — ${detail}` })

  return {
    id: brief.seriesId,
    date: brief.date,
    dateLabel: brief.dateLabel,
    segments,
  }
}

function parseDetail(raw: unknown, brief: SeriesBrief): string {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid LLM payload')
  const detail = String((raw as { detail?: string }).detail ?? '').trim()
  if (!detail) throw new Error('Missing detail string')
  return detail
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

Write ONLY the detail clause for ${brief.facts.winner} vs ${brief.facts.loser} (${brief.facts.score}, ${brief.facts.league}). Teams and score are rendered separately — do not include them.`

  const raw = await generateRecapJson(SYSTEM_PROMPT, userPrompt, model)
  const parsed = JSON.parse(raw) as unknown
  const detail = parseDetail(parsed, brief)
  const line = assembleAiRecapLine(brief, detail)
  return {
    line,
    plainText: recapLineToText(line),
    model: model ?? process.env.RECAP_LLM_MODEL ?? 'google/gemini-2.5-flash-lite',
  }
}

export function briefToTemplateLine(brief: SeriesBrief): WeeklyRecapLine {
  return brief.templateLine
}
