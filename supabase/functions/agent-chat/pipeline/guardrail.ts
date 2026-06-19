// Layer 1 — Guardrail Router.
//
// A fast, lightweight gate that aggressively refuses anything that isn't League of
// Legends esports BEFORE any expensive routing/LLM/tool calls run. This is the cost
// firewall: a clearly off-topic prompt costs ~one regex test, not an LLM round-trip.
//
// Flow:
//   1. Resolve thread intent (cheap regex) so follow-ups in an active LoL thread pass.
//   2. Hard denylist pass — coding/homework/math/recipes/etc. → instant in-character refusal.
//   3. Otherwise hand off to the nuanced scope classifier (which itself only spends an
//      LLM call on ambiguous in-thread cases) and refuse if it lands on off_topic.

import { classifyScope, offTopicRefusal } from "../helpers/scope.ts";
import { resolveThreadIntent, shouldTreatAsLolesports } from "../helpers/threadIntent.ts";
import type { GuardrailResult, HistoryMessage } from "./types.ts";

/**
 * Aggressive off-topic denylist — the stuff nucky should never spend tokens on.
 * Broader than scope.ts's OFF_TOPIC so the cheapest path catches the obvious cases.
 */
const HARD_OFFTOPIC =
  /\b(recipe|cook|bake|cooking|homework|essay|write (?:me|my|a|an)\b|coding|code review|debug|stack ?trace|python|javascript|typescript|java\b|c\+\+|sql query for|leetcode|algorithm|calculus|algebra|integral|derivative|equation|solve for|medical|symptom|diagnos|legal advice|lawyer|tax(?:es)?|mortgage|stock|crypto|bitcoin|resume|cover letter|translate|poem|lyrics|girlfriend|relationship advice|weather|horoscope|dating)\b/i;

/** Strong LoL signal — if present we never hard-refuse, even alongside denylist noise. */
const LOL_SIGNAL =
  /\b(lol|league of legends|lolesports|esports|lck|lpl|lec|lcs|lcp|cblol|msi|worlds|first stand|draft|champion|jungle|mid|adc|support|top lane|bot lane|baron|dragon|teamfight|macro|faker|chovy|t1|gen\.?g|geng|hle|kt|drx|dk|dplus|blg|tes|g2|fnatic|c9|cloud9|patch|meta|roster|split|playoffs|winrate|kda)\b/i;

export async function runGuardrail(
  apiKey: string,
  message: string,
  history: HistoryMessage[],
): Promise<GuardrailResult> {
  const thread = resolveThreadIntent(message, history);

  // Fast path: obvious off-topic with no LoL signal and no active LoL thread → refuse
  // immediately. No scope LLM call, no tools, no RAG. This is the main cost saver.
  const inLolThread = shouldTreatAsLolesports(message, history);
  if (HARD_OFFTOPIC.test(message) && !LOL_SIGNAL.test(message) && !inLolThread) {
    return {
      allowed: false,
      refusal: offTopicRefusal(),
      // minimal scope stub; downstream never runs when allowed=false
      scope: {
        scope: "off_topic",
        needs_tools: false,
        needs_rag: false,
        needs_charts: false,
        needs_snapshot: false,
        reason: "guardrail hard denylist",
      },
      thread,
      queryForTools: thread.effectiveMessage,
    };
  }

  // Nuanced routing — scope classifier handles in-thread refusals and data-need flags.
  const scope = await classifyScope(apiKey, message, history);
  if (scope.scope === "off_topic") {
    return {
      allowed: false,
      refusal: offTopicRefusal(),
      scope,
      thread,
      queryForTools: thread.effectiveMessage,
    };
  }

  return {
    allowed: true,
    refusal: "",
    scope,
    thread,
    queryForTools: thread.effectiveMessage,
  };
}
