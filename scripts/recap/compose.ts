import type { SeriesBrief } from '../../src/lib/weeklyRecap.ts'
import type { WeeklyRecapLine, WeeklyRecapSegment } from '../../src/lib/weeklyRecap.ts'
import { isScoreOnlyBrief, recapLineToText } from '../../src/lib/weeklyRecap.ts'
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

Voice: lowercase, blunt, casual fan energy (twitch/reddit/x). NOT corporate broadcast. NOT formulaic template copy. Hot takes welcome. No emojis. Sound like an average lolesports fan in their early 20s — unhinged but still grounded in facts. Vary sentence openings and structure across series so recaps never sound copy-pasted.

LENGTH (required): 3–5 full sentences, ~320–520 characters. Every recap must feel complete: series arc + outcome, standout WITH role-correct stats, concern/bright spot, and schedule/tournament implication when facts support it.

SERIES ARC (required when facts.gameSequence is non-empty):
- Read facts.gameSequence (winner POV, e.g. LWLWW) and facts.seriesArc / narrativeHints "series arc: …".
- Name the arc naturally: reverse sweep, blew a 2-0 lead, back-and-forth, dropped game 1 then closed, clean sweep, went the distance 3-2, got stomped game 1 but won 2-1, etc.
- Do NOT invent arcs that contradict gameSequence.

Your job:
1. Open with either SERIES ARC or TOURNAMENT/SCHEDULE CONTEXT (facts.tournamentLabel + narrativeHints). For regular season (facts.isBracketEvent=false): talk week/split form and upcoming schedule — NEVER invent "lower bracket" / "upper bracket" / "eliminated" / "sent home".
2. State the series outcome with exact score from facts.score — vary verbs (dismantled, edged, reverse swept, survived, stole, hung on, 1v9'd through). NEVER use "rolled" / "rolling" / "keep rolling" / "another clean".
3. PRAISE standouts using facts.winnerStars / laneDuel / topCarry / modelScore notes — cite ONLY role-correct stats from their notes. Prefer model score callouts when present ("model score 78/100").
4. Roast underperformers using facts.winnerConcerns / loserStinkers — role-correct stats only. Use slang when earned: fraud, inting, exposed, hard-carry, 1v9 — but "fraud" ONLY when fraudEligible is true AND matchup context says favored/top-tier side. NEVER fraud significant underdogs.
5. Include loser bright spots when facts.loserBrightSpots has someone.
6. Close with implications from narrativeHints when present:
   - Bracket events: advances / next faces X / eliminated / drops to lower bracket ONLY if hints explicitly say so.
   - Regular season: bounce-back next week / faces X next from scheduleContext — never bracket language.
   CRITICAL: Never say a team is "going home", "sent home", "eliminated", or "lower bracket" unless narrativeHints explicitly say so AND facts.isBracketEvent is true.
7. SERIES STREAKS: facts.victimSlump / facts.seriesStreak are ALREADY scoped to this tournament/split only. Never invent longer streaks from other leagues/playoffs. If streak is 0 or 1, do not mention a streak.

ROLE-SPECIFIC PERFORMANCE (critical — wrong metrics = failed recap):
- TOP: gd@15, csd@15, xpd@15, dmg%/gold%. "heavily gapped" only if notes say so (typically |gd@15| ≥ 800). ~500 gold is a slight lane edge, NOT a stomp. Respect matchup context — Sion into Vayne being down CS is not automatically fraud.
- JUNGLE / SUPPORT: kp %, k+a/min. Never judge them primarily on gd@15. Say "outjungled" for jungle, not "outlaned". Support negative KDA is normal for engage — do NOT roast supports for dying unless notes force it.
- MID: cs/xp/gold @15 + dmg share / dmg%/gold%. Still a 1v1 lane — lane + damage both matter.
- ADC: dpm/dmg share / dmg%/gold% first (THE carry role). NEVER say an ADC was "completely gapped" from gd@15 — bot lane gold is shared. Extreme bot gd@15 is at most "bot was starved early".
- Highlight extraordinary KDA only when notes call it out (e.g. inting 0/10 vibes or unkillable 10+ kda) — and never for supports on the negative side.
- Do NOT invent "pulled out the [champ]" / "whipped out [champ]" lines unless facts.pocketPick is present.

ENTITY RULES:
- [ENTITY_GLOSSARY] lists exact player ign and champion spellings for THIS series
- Player names: ONLY glossary igns, lowercase, exact spelling
- Champion names: exact glossary spelling, lowercase
- Team references: ONLY tokens {{WINNER}} and {{LOSER}}

Use ONLY numbers/stats from [FACTS]. RAG may add narrative stakes but cannot contradict facts. Skip inventing 0% dmg / 0.00 k+a/min — if a note is missing or zeroed, pick another note.

Style examples (structure + vibe only — do NOT copy verbatim; vary openings):
- "{{WINNER}} reverse swept {{LOSER}} 3-2 after going down 0-2 in the msi upper bracket. oner was everywhere (78% kp), while doran finally showed up (+900 gd@15). {{LOSER}}'s mid was exposed at 18% dmg share. {{WINNER}} advances; {{LOSER}} drops to the lower bracket — not going home yet."
- "week 11 lck: {{WINNER}} edged {{LOSER}} 2-1 after getting stomped game 1 (sequence LWW). chovy hard-carried at 32% dmg share / 1.25 dmg%/gold%. {{LOSER}}'s top got gapped early but it's regular season — they bounce back vs kt next."
- "{{WINNER}} 3-0 swept {{LOSER}} in lpl summer. gala went 1v9 (model score 81/100, 34% dmg). {{LOSER}}'s jungle was ghosting at 41% kp. no bracket stakes — just another week of form."

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
const MIN_RECAP_CHARS_SCORE_ONLY = 180
const BANNED_OPENERS = /\b(rolled|keep rolling|another clean)\b/i

function validateLine(segments: WeeklyRecapSegment[], brief: SeriesBrief, narrative: string): void {
  const scoreOnly = isScoreOnlyBrief(brief)
  const plain = segments.map((s) => (s.kind === 'text' ? s.value : s.label)).join('')
  if (!plain.includes(brief.facts.score)) {
    console.warn(`  score ${brief.facts.score} not found in: ${plain}`)
  }
  const teamSegs = segments.filter((s) => s.kind === 'team')
  if (teamSegs.length < 2) {
    throw new Error('Narrative missing team tokens — need {{WINNER}} and {{LOSER}}')
  }

  const minChars = scoreOnly ? MIN_RECAP_CHARS_SCORE_ONLY : MIN_RECAP_CHARS
  if (plain.replace(/\s+/g, ' ').trim().length < minChars) {
    throw new Error(
      scoreOnly
        ? `Recap too short (${plain.length} chars) — need ~${minChars}+ chars with score + tournament stakes`
        : `Recap too short (${plain.length} chars) — need 3–4 sentences (~${minChars}+ chars) with standout + concern stats`,
    )
  }

  if (BANNED_OPENERS.test(narrative)) {
    throw new Error('Recap uses banned cliché opener (rolled/rolling/another clean) — vary the opening')
  }

  // Score-only (Cito, no OE box scores): no player stats / fraud language.
  if (scoreOnly) {
    if (/\b(gd@15|csd@15|xpd@15|dmg share|kda|kp %|fraud)\b/i.test(narrative)) {
      throw new Error('Score-only recap must not invent player stats or fraud language (wait for OE)')
    }
  } else {
    const nameErr = detectPlayerNameHallucination(narrative, collectAllowedIgns(brief.facts))
    if (nameErr) throw new Error(nameErr)
  }

  const fraudUsed = !scoreOnly && /\bfraud\b/i.test(narrative)
  if (fraudUsed) {
    const allPlayers = [
      ...brief.facts.winnerStars,
      ...brief.facts.winnerConcerns,
      ...brief.facts.loserStinkers,
      ...brief.facts.loserBrightSpots,
    ]
    const eligible = allPlayers.filter((p) => p.fraudEligible)
    if (!eligible.length) {
      throw new Error(
        'Used "fraud" but no player has fraudEligible=true — underdogs / weak-side players are never fraud',
      )
    }
    // Fraud must attach to an eligible player name, not a random underdog.
    const mentionsEligible = eligible.some((p) =>
      new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(narrative),
    )
    if (!mentionsEligible) {
      throw new Error(
        'Fraud language must name a fraudEligible player (favored/top-tier side only)',
      )
    }
    // Explicitly reject fraud on known underdog names in this series.
    const ineligible = allPlayers.filter((p) => !p.fraudEligible)
    for (const p of ineligible) {
      const re = new RegExp(
        `\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^.\\n]{0,48}fraud`,
        'i',
      )
      if (re.test(narrative)) {
        throw new Error(
          `Do not put ${p.name} on fraud watch — they are not on the favored/top-tier side`,
        )
      }
    }
  }

  const stakes = tournamentStakeHints(brief)
  if (stakes.length && brief.facts.isBracketEvent) {
    const label = brief.facts.tournamentLabel ?? ''
    const mentionsEvent =
      !/MSI|Worlds|First Stand/i.test(label) ||
      new RegExp(label.replace(/\s+/g, '\\s+'), 'i').test(narrative) ||
      /\b(msi|worlds|first stand)\b/i.test(narrative)
    const hasStakeLanguage =
      /\b(eliminat|advances?|play-?in|bracket|sent home|goes home|next (?:faces?|round|up)|qualification|lower bracket|main bracket|reverse swept|blew a 2-0)\b/i.test(
        narrative,
      )
    if (!mentionsEvent) {
      throw new Error(`Recap must name the event (${label || 'MSI/Worlds/First Stand'})`)
    }
    if (!hasStakeLanguage && stakes.some((s) => /eliminat|advances?|play-?in|bracket|next faces?/i.test(s))) {
      throw new Error(
        'Missing required tournament stakes (advancement / elimination / next opponent / play-in / bracket)',
      )
    }
  }

  // Regular season must never invent bracket language.
  if (brief.facts.isBracketEvent === false) {
    if (/\b(lower bracket|upper bracket|sent home|going home|eliminated from)\b/i.test(narrative)) {
      throw new Error(
        'Regular-season recap must not use bracket/elimination language (lower/upper bracket, sent home, eliminated)',
      )
    }
  }

  // Carry roles must not be described as "completely gapped" from lane gold.
  if (/\b(completely gapped|heavily gapped|gapped every)\b/i.test(narrative)) {
    const adcNames = [
      ...brief.facts.winnerStars,
      ...brief.facts.winnerConcerns,
      ...brief.facts.loserStinkers,
      ...brief.facts.loserBrightSpots,
    ]
      .filter((p) => p.role === 'adc')
      .map((p) => p.name.toLowerCase())
    for (const name of adcNames) {
      const re = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.\\n]{0,40}gapped`, 'i')
      if (re.test(narrative)) {
        throw new Error(
          `Do not say ADC ${name} was "gapped" from gd@15 — use dmg share / dmg%/gold% instead`,
        )
      }
    }
  }
}

function tournamentStakeHints(brief: SeriesBrief): string[] {
  // Only enforce bracket stakes for true bracket events.
  if (brief.facts.isBracketEvent === false) {
    return (brief.facts.narrativeHints ?? []).filter((h) =>
      /\b(schedule:|series arc:|game sequence|reverse swept|blew a 2-0|back-and-forth)\b/i.test(h),
    )
  }
  const hints = (brief.facts.narrativeHints ?? []).filter((h) =>
    /\b(eliminat|advances?|play-?in|bracket|sent home|next faces?|qualification|lower bracket|tournament:|reverse swept|blew a 2-0|series arc:)\b/i.test(
      h,
    ),
  )
  const label = brief.facts.tournamentLabel ?? ''
  if (/MSI|Worlds|First Stand/i.test(label) && !hints.some((h) => /tournament:/i.test(h))) {
    hints.unshift(`tournament: ${label} — name this event in the recap`)
  }
  return hints
}

function buildUserPrompt(brief: SeriesBrief, ragContext: string, correction?: string): string {
  const scoreOnly = isScoreOnlyBrief(brief)
  const factsJson = factsToPromptJson(brief.facts)
  const glossaryJson = glossaryToPromptJson(buildRecapEntityGlossary(brief.facts))
  const stakes = tournamentStakeHints(brief)

  const parts = [
    `[FACTS]
${factsJson}`,
    scoreOnly
      ? `[DATA_SOURCE]
Cito schedule only — OE box scores not available yet. Do NOT invent player names, champions, gd@15, kp, dmg share, or fraud language. Focus on score, tournament stakes, and narrativeHints.`
      : `[ENTITY_GLOSSARY — exact spellings only; never alter player igns]
${glossaryJson}`,
    `[EXTERNAL_CONTEXT — reddit threads, liquipedia, standings/playoffs narrative; use for stakes/implications only]
${ragContext || '(none — lean on facts.narrativeHints and stats)'}`,
  ]

  if (stakes.length) {
    parts.push(
      brief.facts.isBracketEvent
        ? `[TOURNAMENT_STAKES — REQUIRED in the recap opening or closing]
${stakes.map((s) => `- ${s}`).join('\n')}
You MUST weave at least one of these stakes into the recap (advancement, elimination, next opponent, play-in finals, bracket). Do not ignore this block.`
        : `[SERIES / SCHEDULE CONTEXT — use when relevant]
${stakes.map((s) => `- ${s}`).join('\n')}
Regular season: mention series arc and/or next opponent. NEVER invent lower/upper bracket or elimination.`,
    )
  }

  if (correction) {
    parts.push(`[CORRECTION — previous draft rejected]
${correction}`)
  }

  if (scoreOnly) {
    parts.push(
      `Write a 2–3 sentence recap for this ${brief.facts.tournamentLabel ?? brief.facts.league} series. Winner={{WINNER}} (${brief.facts.winnerAbbr}), Loser={{LOSER}} (${brief.facts.loserAbbr}), score ${brief.facts.score}.
Must include {{WINNER}} and {{LOSER}} at least once each. ~180–360 chars.
Lean on tournament stakes / narrativeHints. No player names. No invented stats.`,
    )
  } else {
    parts.push(
      `Write the full recap for this ${brief.facts.tournamentLabel ?? brief.facts.league} series. Winner={{WINNER}} (${brief.facts.winnerAbbr}), Loser={{LOSER}} (${brief.facts.loserAbbr}), score ${brief.facts.score}.
Must include {{WINNER}} and {{LOSER}} at least once each. Minimum 3–4 sentences (~320+ chars).
${brief.facts.gameSequence ? `REQUIRED: acknowledge series arc from gameSequence=${brief.facts.gameSequence} (seriesArc=${brief.facts.seriesArc}).` : ''}
${brief.facts.isBracketEvent ? (stakes.length ? 'REQUIRED: include tournament stakes from [TOURNAMENT_STAKES].' : 'If narrativeHints include tournament context, include it.') : 'REGULAR SEASON: no lower/upper bracket / eliminated / sent home language. Use scheduleContext if present.'}
Call out at least one standout AND one concern or loser bright spot — each with ROLE-CORRECT stats from facts.*.notes (top=gd@15, jg/sup=kp, mid/adc=dmg share — never "gapped" an ADC from gd@15). Prefer modelScore notes when present.
"fraud" ONLY when fraudEligible is true on a FAVORED/top-tier player — never fraud underdogs (see matchup context / power ranks in narrativeHints).
Series streaks in facts are tournament-scoped only — do not invent LEC/LCK playoff streaks for an MSI recap.
Only mention "pulled out [champ]" if facts.pocketPick is set.
Vary structure — do not start every recap the same way.`,
    )
  }

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
