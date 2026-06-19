import type { OpenRouterChatMessage } from "./openrouter.ts";

/** Messages loaded from DB and passed to the synthesis model */
export const HISTORY_WINDOW = 20;

/** Cap per-turn size so 20 turns fit comfortably in context */
export const MAX_HISTORY_MESSAGE_CHARS = 1400;

export function trimConversationHistory(
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  limit = HISTORY_WINDOW,
): OpenRouterChatMessage[] {
  return history
    .slice(-limit)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content:
        m.content.length > MAX_HISTORY_MESSAGE_CHARS
          ? `${m.content.slice(0, MAX_HISTORY_MESSAGE_CHARS)}…`
          : m.content,
    }));
}
