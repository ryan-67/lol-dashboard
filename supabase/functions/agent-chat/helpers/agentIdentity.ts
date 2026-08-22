/**
 * Agent self-name helpers.
 *
 * Users often write "hey nucky …" — that greets the product, not LEC mid laner "nuc".
 * Entity extractors must strip/mask agent self-mentions before matching short player names.
 */

/** Whole-word agent self-name (nucky / nuckyai / nucky.gg) plus common typos. */
const NUCKY_CANON = "nucky(?:ai|\\.gg)?";
const NUCKY_TYPO = "nucy|nucki|nuky|nuckky|nuckyy";
const NUCKY_ANY = `(?:${NUCKY_CANON}|${NUCKY_TYPO})`;

export const AGENT_SELF_NAME_RE = new RegExp(
  `\\b(?:hey\\s+|hi\\s+|yo\\s+|hello\\s+|sup\\s+|ok\\s+)?${NUCKY_ANY}\\b`,
  "gi",
);

const AGENT_IDENTITY_ASK =
  /\b(who are you|what are you|what(?:'s| is) your name|tell me about yourself|about yourself|what can you do|what do you do|how can you help|your (?:capabilities|features)|introduce yourself)\b/i;

const GREETING_ONLY = new RegExp(
  `^(?:hey|hi|yo|hello|sup|good\\s+(?:morning|afternoon|evening))(?:\\s+${NUCKY_ANY})?[.!\\?\\s]*$`,
  "i",
);

/** "hey nucky, how are you" — greet + smalltalk, no analysis ask. */
const AGENT_SMALLTALK = new RegExp(
  `\\b(?:hey|hi|yo|hello|sup)\\s+${NUCKY_ANY}\\b[,!]?\\s*(?:how are you|how'?s it going|what'?s up|whats up|hru)\\b`,
  "i",
);

/**
 * Mask agent self-mentions so substring player matches (e.g. "nuc" ⊂ "nucky") cannot fire.
 * Preserves message length roughly by replacing with spaces.
 */
export function stripAgentSelfMentions(message: string): string {
  return message.replace(AGENT_SELF_NAME_RE, (m) => " ".repeat(m.length));
}

/** True when the user is asking who nucky is / what nucky can do. */
export function isAgentIdentityAsk(message: string): boolean {
  const cleaned = stripAgentSelfMentions(message).trim();
  if (AGENT_IDENTITY_ASK.test(message)) return true;
  // "nucky what can you do" after strip still has the ask
  if (AGENT_IDENTITY_ASK.test(cleaned)) return true;
  return false;
}

/** Pure greeting / smalltalk with no analysis ask ("hi nucky", "hey nucky how are you"). */
export function isAgentGreetingOnly(message: string): boolean {
  const trimmed = message.trim();
  return GREETING_ONLY.test(trimmed) || AGENT_SMALLTALK.test(trimmed);
}

const NUCKY_TYPO_TOKEN = /\b(nucy|nucki|nuky|nuckky|nuckyy)\b/i;

/** Greeting that misspells the agent name ("hi nucy") — not a player ask. */
export function isNuckyTypoGreeting(message: string): boolean {
  const trimmed = message.trim();
  if (!isAgentGreetingOnly(trimmed)) return false;
  return NUCKY_TYPO_TOKEN.test(trimmed) && !/\bnucky(?:ai|\.gg)?\b/i.test(trimmed);
}

export function formatNuckyTypoGreeting(message: string): string {
  const typo = message.match(NUCKY_TYPO_TOKEN)?.[1]?.toLowerCase() ?? "nucy";
  return `who's ${typo}? i'm nucky — hit me with a LoL esports question.`;
}

/** Word-boundary token mention on a message with agent self-name already stripped. */
export function messageMentionsPlayerToken(message: string, token: string): boolean {
  const haystack = stripAgentSelfMentions(message);
  const t = token.trim().toLowerCase();
  if (!t) return false;
  // Never treat the agent name itself as a player token.
  if (t === "nucky" || t === "nuckyai" || t === "nucky.gg" || t === "nucy" || t === "nucki") {
    return false;
  }
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:[^a-z0-9_]|$)`, "i");
  return re.test(haystack);
}

export const AGENT_CAPABILITIES_BLURB = `I'm nucky — a LoL esports analyst agent for nucky.gg.

I know:
- current + historical tier-1 form (LCK / LPL / LEC / LCS + First Stand, MSI, EWC, Worlds)
- player/team power scores and role-aware rankings from the nucky prediction model
- matchup / H2H stats, champion lane matchups, draft/style context
- series lean / win-prob packets grounded in that model (not generic chatbot vibes)

I can:
- look up stats and answer current-form questions
- compare players/teams (with charts when useful)
- break down matchups, frauds/overrated takes, and role-context performance
- give predictions / who's favored with model-backed reasoning
- answer general LoL esports facts (titles, history) when I can verify them

I only do League esports — hit me with a player, team, series, or draft question.`;
