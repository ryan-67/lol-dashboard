import { CLASSIFICATION_SYSTEM_PROMPT } from "./prompts.ts";
import { isGameTheoryQuestion } from "./scope.ts";
import { MODEL_COMPLEX, MODEL_JSON, MODEL_SIMPLE } from "./models.ts";
import { completeOnce, type OpenRouterChatMessage } from "./openrouter.ts";

export interface IntentPlan {
  needs_sql: boolean;
  needs_vector: boolean;
  complexity: "simple" | "complex";
  reason: string;
}

const SQL_HINTS =
  /\b(winrate|kda|cs|gold diff|stats?|compare|rank|record|kills?|deaths?|assists?|mvp|damage share|dmg%|gold%|history|h2h|head.?to.?head|gd@?15|xpd@?15|overrated|underrated|split stats|most picked|best|worst|fraudulent|fraud)\b/i;
const VECTOR_HINTS =
  /\b(patch notes|meta shift|roster move|rumou?r|reddit|kalshi|odds|betting|recent news|tournament result|liquipedia|injury|upcoming|schedule|bracket|playoffs|msi qualif|worlds qualif|favorite to win|prediction)\b/i;
const COMPLEX_HINTS = /\b(predict|prediction|who wins|breakdown|edge|favou?red|favorite to win)\b/i;

function heuristic(question: string, needsSqlOverride = false, needsVectorOverride = false): IntentPlan {
  const needsSql = needsSqlOverride || SQL_HINTS.test(question);
  const needsVector = needsVectorOverride || VECTOR_HINTS.test(question);
  return {
    needs_sql: needsSql,
    needs_vector: needsVector,
    complexity: COMPLEX_HINTS.test(question) ? "complex" : "simple",
    reason: "heuristic fallback",
  };
}

function inferThreadBias(history: OpenRouterChatMessage[]): { preferSql: boolean; preferVector: boolean } {
  const userTurns = history.filter((m) => m.role === "user").slice(-8);
  const sqlHits = userTurns.reduce((acc, turn) => acc + (SQL_HINTS.test(turn.content) ? 1 : 0), 0);
  const vectorHits = userTurns.reduce((acc, turn) => acc + (VECTOR_HINTS.test(turn.content) ? 1 : 0), 0);
  return {
    preferSql: sqlHits > vectorHits && sqlHits >= 2,
    preferVector: vectorHits > sqlHits && vectorHits >= 2,
  };
}

export async function classifyIntent(
  apiKey: string,
  message: string,
  history: OpenRouterChatMessage[] = [],
  options: { needsTools?: boolean; needsRag?: boolean } = {},
): Promise<IntentPlan> {
  if (isGameTheoryQuestion(message)) {
    return {
      needs_sql: false,
      needs_vector: false,
      complexity: "simple",
      reason: "game theory — no data fetch",
    };
  }

  if (options.needsTools === false && options.needsRag === false) {
    return {
      needs_sql: false,
      needs_vector: false,
      complexity: "simple",
      reason: "scope: chat only",
    };
  }

  const keywordSql = SQL_HINTS.test(message);
  const keywordVector = VECTOR_HINTS.test(message);

  if (keywordSql && !keywordVector) {
    return heuristic(message, true, false);
  }

  if (keywordVector && !keywordSql) {
    return heuristic(message, false, true);
  }

  if (!keywordSql && !keywordVector) {
    const inDeepThread = history.length > 8;
    if (inDeepThread) {
      const bias = inferThreadBias(history);
      if (bias.preferSql && options.needsTools !== false) {
        return { needs_sql: true, needs_vector: false, complexity: "simple", reason: "deep-thread sql bias" };
      }
      if (bias.preferVector && options.needsRag !== false) {
        return { needs_sql: false, needs_vector: true, complexity: "simple", reason: "deep-thread vector bias" };
      }
    }
    if (options.needsTools === false) {
      return {
        needs_sql: false,
        needs_vector: options.needsRag === true,
        complexity: "simple",
        reason: "no stat keywords — skip sql",
      };
    }
  }

  try {
    const contextMessages: OpenRouterChatMessage[] = history.slice(-12).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 600),
    }));

    const raw = await completeOnce(apiKey, {
      model: MODEL_JSON,
      messages: [
        { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
        ...contextMessages,
        { role: "user", content: message },
      ],
      temperature: 0,
      max_tokens: 220,
    });

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return heuristic(message, keywordSql, keywordVector);
    }

    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      needs_sql: Boolean(parsed.needs_sql),
      needs_vector: Boolean(parsed.needs_vector),
      complexity: parsed.complexity === "complex" ? "complex" : "simple",
      reason: String(parsed.reason ?? "model"),
    };
  } catch {
    return heuristic(message, keywordSql, keywordVector);
  }
}

export function pickFinalModel(plan: IntentPlan): string {
  return plan.complexity === "complex" ? MODEL_COMPLEX : MODEL_SIMPLE;
}
