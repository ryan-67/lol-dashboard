import { CLASSIFICATION_SYSTEM_PROMPT } from "./prompts.ts";
import { completeOnce, type OpenRouterChatMessage } from "./openrouter.ts";

export interface IntentPlan {
  needs_sql: boolean;
  needs_vector: boolean;
  complexity: "simple" | "complex";
  reason: string;
}

const SQL_HINTS =
  /\b(winrate|kda|cs|gold|stats?|compare|rank|record|kills?|deaths?|assists?|mvp|damage|history|h2h|head.?to.?head|gd@?15|xpd@?15)\b/;
const VECTOR_HINTS =
  /\b(patch|meta|roster|rumou?r|reddit|kalshi|odds|betting|recent|news|draft|tournament|liquipedia|injury|upcoming)\b/;
const COMPLEX_HINTS = /\b(predict|prediction|who wins|breakdown|edge|favou?red|favorite)\b/;

function heuristic(question: string, needsSqlOverride = false, needsVectorOverride = false): IntentPlan {
  const q = question.toLowerCase();
  const needsSql = needsSqlOverride || SQL_HINTS.test(q) || COMPLEX_HINTS.test(q);
  const needsVector = needsVectorOverride || VECTOR_HINTS.test(q) || COMPLEX_HINTS.test(q);
  return {
    needs_sql: needsSql,
    needs_vector: needsVector,
    complexity: COMPLEX_HINTS.test(q) ? "complex" : "simple",
    reason: "heuristic fallback",
  };
}

function inferThreadBias(history: OpenRouterChatMessage[]): { preferSql: boolean; preferVector: boolean } {
  const userTurns = history.filter((m) => m.role === "user").slice(-8);
  const sqlHits = userTurns.reduce((acc, turn) => acc + (SQL_HINTS.test(turn.content.toLowerCase()) ? 1 : 0), 0);
  const vectorHits = userTurns.reduce((acc, turn) => acc + (VECTOR_HINTS.test(turn.content.toLowerCase()) ? 1 : 0), 0);
  return {
    preferSql: sqlHits > vectorHits && sqlHits >= 2,
    preferVector: vectorHits > sqlHits && vectorHits >= 2,
  };
}

export async function classifyIntent(
  apiKey: string,
  message: string,
  history: OpenRouterChatMessage[] = [],
): Promise<IntentPlan> {
  const q = message.toLowerCase();
  const keywordSql = SQL_HINTS.test(q);
  const keywordVector = VECTOR_HINTS.test(q);
  const fallbackBothSimple: IntentPlan = {
    needs_sql: true,
    needs_vector: true,
    complexity: "simple",
    reason: "classifier fallback",
  };

  if (keywordSql && !keywordVector) {
    return heuristic(message, true, false);
  }

  if (keywordVector && !keywordSql) {
    return heuristic(message, false, true);
  }

  const inDeepThread = history.length > 12;
  if (inDeepThread && !keywordSql && !keywordVector) {
    const bias = inferThreadBias(history);
    if (bias.preferSql) {
      return { needs_sql: true, needs_vector: false, complexity: "simple", reason: "deep-thread sql bias" };
    }
    if (bias.preferVector) {
      return { needs_sql: false, needs_vector: true, complexity: "simple", reason: "deep-thread vector bias" };
    }
  }

  try {
    const model = "google/gemini-1.5-flash";
    const prompt: OpenRouterChatMessage[] = [
      { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: "user", content: message },
    ];

    const raw = await completeOnce(apiKey, {
      model,
      messages: prompt,
      temperature: 0,
      max_tokens: 220,
    });

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return fallbackBothSimple;

    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      needs_sql: Boolean(parsed.needs_sql),
      needs_vector: Boolean(parsed.needs_vector),
      complexity: parsed.complexity === "complex" ? "complex" : "simple",
      reason: String(parsed.reason ?? "model"),
    };
  } catch {
    return fallbackBothSimple;
  }
}

export function pickFinalModel(plan: IntentPlan): string {
  return plan.complexity === "complex"
    ? "google/gemini-2.5-flash"
    : "google/gemini-1.5-flash";
}