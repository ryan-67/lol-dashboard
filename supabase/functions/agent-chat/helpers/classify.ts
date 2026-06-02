import { CLASSIFICATION_SYSTEM_PROMPT } from "./prompts.ts";
import { completeOnce, type OpenRouterChatMessage } from "./openrouter.ts";

export interface IntentPlan {
  needs_sql: boolean;
  needs_vector: boolean;
  complexity: "simple" | "complex";
  reason: string;
}

function heuristic(question: string): IntentPlan {
  const q = question.toLowerCase();
  const sqlHints = /(winrate|kda|csd|gd@?15|xpd@?15|history|h2h|head.?to.?head|compare|stats?|record)/;
  const vectorHints = /(patch|meta|rumor|reddit|liquipedia|odds|kalshi|news|injury|roster|upcoming)/;
  const complexHints = /(predict|prediction|who wins|draft|breakdown|edge|favored|favorite)/;

  const needsSql = sqlHints.test(q) || complexHints.test(q);
  const needsVector = vectorHints.test(q) || complexHints.test(q);
  return {
    needs_sql: needsSql,
    needs_vector: needsVector,
    complexity: complexHints.test(q) ? "complex" : "simple",
    reason: "heuristic fallback",
  };
}

export async function classifyIntent(apiKey: string, message: string): Promise<IntentPlan> {
  const fallback = heuristic(message);

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
    if (start === -1 || end === -1) return fallback;

    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      needs_sql: Boolean(parsed.needs_sql),
      needs_vector: Boolean(parsed.needs_vector),
      complexity: parsed.complexity === "complex" ? "complex" : "simple",
      reason: String(parsed.reason ?? "model"),
    };
  } catch {
    return fallback;
  }
}

export function pickFinalModel(plan: IntentPlan): string {
  return plan.complexity === "complex"
    ? "anthropic/claude-sonnet-4"
    : "google/gemini-1.5-flash";
}