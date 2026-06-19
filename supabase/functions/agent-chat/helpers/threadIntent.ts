import type { OpenRouterChatMessage } from "./openrouter.ts";

const LOLESPORTS_SIGNAL =
  /\b(lol|league of legends|lolesports|esports|lck|lpl|lec|lcs|msi|worlds|draft|champion|faker|chovy|t1|geng|gen\.?g|g2|winrate|kda|matchup|series|roster|patch|adc|mid|jungle|support|fraudulent|fraud|standings|playoffs|split|team|player|nucky|title|championship|trophy)\b/i;

/** User is correcting / redefining the prior answer's terms. */
const CLARIFICATION =
  /\b(doesn'?t count|does not count|don'?t count|isn'?t a top|not a top|not what i|that'?s wrong|that is wrong|i mean|i meant|by that i mean|top team refers|exclude|not including|re-?answer|try again|wrong team|bottom team|mid-?table|actually)\b/i;

/** Explicit pivot markers — strong signal the user is continuing the prior topic. */
const PARALLEL_MARKER =
  /^(?:and|ok|okay|now)\b|\b(what about|how about|and how about|and what about)\b/i;

/** User asks about roster depth / subs as a follow-up. */
const ROSTER_FOLLOW_UP =
  /\b(sub|subs|substitute|backup|back-?up|bench|stand-?in|reserve|who else (?:played|was)|didn'?t they have|who was the (?:sub|backup|other))\b/i;

const TEAM_ENTITY =
  /\b(gen\.?g|t1|hle|hanwha|drx|kt|dk|dplus|blg|bilibili|tes|top esports|g2|cloud9|liquid|dn\s*soop|freecs|deokdam|ruler|gumayusi|peyz|chovy|faker|zeus|oner|keria|canyon|knight|caps)\b/i;

/**
 * Self-contained new questions — they carry their own topic, so they must be
 * classified on their own merits, NOT inherited from the prior turn. Without this,
 * "what happened in the last T1 vs Gen.G series?" would inherit a prior "compare X and Y"
 * topic and wrongly draw a radar chart.
 */
const FRESH_TOPIC =
  /\b(what happened|series|recap|game by game|who won|which team won|winner of|world champion|roster|line-?up|standings|schedule|when does|favored|favou?rite to win|odds|titles?|championships?)\b/i;

export type FollowUpType = "none" | "clarification" | "parallel" | "roster_follow_up";

export interface ThreadIntent {
  effectiveMessage: string;
  isFollowUp: boolean;
  isClarification: boolean;
  followUpType: FollowUpType;
  inheritedTopic: string | null;
  threadLolesports: boolean;
  priorUserQuestion: string | null;
}

function historyHasLolesports(history: OpenRouterChatMessage[]): boolean {
  return history.some(
    (m) => (m.role === "user" || m.role === "assistant") && LOLESPORTS_SIGNAL.test(m.content),
  );
}

function mentionsThreadEntities(message: string, history: OpenRouterChatMessage[]): boolean {
  if (!TEAM_ENTITY.test(message)) return false;
  const recentText = history
    .slice(-6)
    .map((m) => m.content)
    .join(" ");
  return TEAM_ENTITY.test(recentText);
}

function lastUserQuestion(history: OpenRouterChatMessage[]): string | null {
  const users = history.filter((m) => m.role === "user");
  return users.length ? users[users.length - 1]!.content : null;
}

function lastAssistantSnippet(history: OpenRouterChatMessage[]): string {
  const assistant = [...history].reverse().find((m) => m.role === "assistant");
  if (!assistant?.content) return "";
  return assistant.content.slice(0, 600);
}

function detectFollowUpType(
  message: string,
  history: OpenRouterChatMessage[],
): FollowUpType {
  if (history.length < 2) return "none";
  const trimmed = message.trim();

  if (ROSTER_FOLLOW_UP.test(trimmed)) return "roster_follow_up";
  if (CLARIFICATION.test(trimmed)) return "clarification";

  // A self-contained new question (its own topic + an entity) is NOT a pivot of the
  // prior turn — classify it fresh so it doesn't inherit the wrong scope/chart.
  if (FRESH_TOPIC.test(trimmed) && TEAM_ENTITY.test(trimmed)) return "none";

  const isShort = trimmed.length < 60;
  const hasOwnVerb = /\b(is|are|has|have|won|plays?|played|do|does|why|how many|what'?s the)\b/i.test(
    trimmed,
  );

  // Explicit pivot markers ("how about faker?", "and DK?") are parallel even if short.
  if (PARALLEL_MARKER.test(trimmed)) return "parallel";

  // Bare entity mention with no question verb ("faker?", "ruler") → parallel pivot.
  if (isShort && !hasOwnVerb && mentionsThreadEntities(trimmed, history)) return "parallel";

  return "none";
}

export function resolveThreadIntent(
  message: string,
  history: OpenRouterChatMessage[] = [],
): ThreadIntent {
  const threadLolesports = LOLESPORTS_SIGNAL.test(message) || historyHasLolesports(history);
  const priorUserQuestion = lastUserQuestion(history);
  const followUpType = detectFollowUpType(message, history);

  const isFollowUp = followUpType !== "none" && Boolean(priorUserQuestion) && threadLolesports;

  if (!isFollowUp || !priorUserQuestion) {
    return {
      effectiveMessage: message,
      isFollowUp: false,
      isClarification: false,
      followUpType: "none",
      inheritedTopic: null,
      threadLolesports,
      priorUserQuestion: null,
    };
  }

  if (followUpType === "clarification") {
    const effectiveMessage = [
      `[FOLLOW_UP — refine prior answer using updated criteria below]`,
      `Original question: ${priorUserQuestion}`,
      `Your prior answer (summary): ${lastAssistantSnippet(history)}`,
      `User refinement: ${message}`,
      `Re-run analysis with the refinement applied. If they redefine terms (e.g. "top team" = top 4-5 in standings), use that definition.`,
    ].join("\n");

    return {
      effectiveMessage,
      isFollowUp: true,
      isClarification: true,
      followUpType,
      inheritedTopic: priorUserQuestion,
      threadLolesports: true,
      priorUserQuestion,
    };
  }

  // parallel / roster_follow_up — keep the SAME topic, swap the entity. Do NOT use
  // "refine prior answer" framing (that caused wrong tools + random radar charts).
  const effectiveMessage = [
    `[FOLLOW_UP — continue the same topic for a new entity]`,
    `Continuing prior topic: "${priorUserQuestion}".`,
    `User now asks about: ${message}`,
    `Answer the SAME kind of question (same metric/topic) for the new entity. Do not switch to a different stat.`,
  ].join("\n");

  return {
    effectiveMessage,
    isFollowUp: true,
    isClarification: false,
    followUpType,
    inheritedTopic: priorUserQuestion,
    threadLolesports: true,
    priorUserQuestion,
  };
}

export function shouldTreatAsLolesports(message: string, history: OpenRouterChatMessage[]): boolean {
  const intent = resolveThreadIntent(message, history);
  return intent.threadLolesports || intent.isFollowUp;
}
