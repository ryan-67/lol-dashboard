import type { OpenRouterChatMessage } from "./openrouter.ts";
import { MODEL_JSON } from "./models.ts";
import { completeOnce } from "./openrouter.ts";
import type { UsageTracker } from "./usageTracker.ts";
import { HISTORY_WINDOW } from "./historyWindow.ts";
import { resolveThreadIntent, shouldTreatAsLolesports } from "./threadIntent.ts";
import { isWorldsHistoryQuestion } from "./worldsHistory.ts";
import { isChampionMatchupAsk } from "./championMatchupTool.ts";
import { isAgentGreetingOnly, isAgentIdentityAsk } from "./agentIdentity.ts";
import { PLAYER_ALIASES } from "./playerExtract.ts";
import {
  isDatedMatchupRecap,
  isWeeklyLeagueRecapQuestion,
} from "./warehouseFacts.ts";

export type ConversationScope =
  | "off_topic"
  | "lolesports_chat"
  | "lolesports_general"
  | "lolesports_stats"
  | "lolesports_compare"
  | "lolesports_series";

export interface ScopePlan {
  scope: ConversationScope;
  needs_tools: boolean;
  needs_rag: boolean;
  needs_charts: boolean;
  needs_snapshot: boolean;
  reason: string;
}

const OFF_TOPIC =
  /\b(recipe|cook me|tax return|weather forecast|homework|write (?:me )?an essay|medical advice|legal advice|python code|javascript code|typescript|debug my|fix my code|stock market|crypto\b(?!\s*kalshi)|solve this math|calculate (?:the )?\d|algebra|calculus)\b/i;

const LOLESPORTS =
  /\b(lol|league of legends|lolesports|esports|lck|lpl|lec|lcs|lcp|cblol|msi|worlds|first stand|draft|champion|faker|chovy|t1|geng|gen\.?g|g2|dk|dplus|blg|tes|kt|hle|hanwha|drx|cloud9|c9|liquid|fearx|brion|playoffs|split|winrate|kda|matchup|series|roster|line-?up|patch|kalshi|liquipedia|nucky|standings|team|player|adc|fraudulent|fraud|azir|corki|baron|dragon|soul|jungles?|jungler|mid|top|support|bot lane|teamfight|macro|scaling|itemization|title|championship)\b/i;

/** Plain roster / lineup queries ("who is on DK?", "who jungles for Hanwha"). */
const ROSTER_QUERY =
  /\b(roster|line-?up|who(?:'s| is| are)?\s*(?:on|playing for|starting for)|who plays for|who(?:'s| is) starting|who (?:plays?|jungles?|mids?|adcs?|supports?|tops?) for)\b/i;

const STATS =
  /\b(winrate|win rate|kda|csd@?15|gd@?15|xpd@?15|dpm|stats?|rank|record|kills?|deaths?|assists?|damage|gd15|most picked|best|worst|who has|how is|objective|form|streak|dmg%|gold%|dmg share|gold share)\b/i;

const OPINION =
  /\b(fraudulent|fraud|frauds?|bum|bums|inters?|trash|dogshit|dog shit|ass|garbage|overrated|underrated|goat|1v9|cosplay|flop|grief|griefing|exposed|malding|bad at|good at|notorious|weak at|weak on|strong at|strong on|mid on|refuses? to pick|won't pick|never picks?)\b/i;

/** Common pro-play champions — used to route player+champion performance takes to stats tools. */
const PRO_CHAMPION =
  /\b(azir|corki|orianna|syndra|ahri|ksante|rumble|gnar|jayce|yone|akali|sylas|viktor|taliyah|annie|ryze|mel|aurora|varus|ezreal|jinx|kaisa|xayah|aphelios|zeri|smolder|lucian|caitlyn|ashe|jhin|kalista|senna|miss fortune|mf|thresh|nautilus|rell|leona|rakan|lulu|nami|braum|blitzcrank|maokai|sejuani|vi|wukong|jarvan|lee sin|graves|nidalee|kindred|viego|nocturne|poppy|ornn|sion|aatrox|camille|gwen|fiora|yasuo|irelia|galio|twisted fate|tf|lux|zoe|vex|neeko|hwei|ambessa)\b/i;

const COMPARE =
  /\b(compare|vs\.?|versus|radar|head.?to.?head|h2h|matchup analysis|lane matchup)\b/i;

const SERIES =
  /\b(series|game by game|bo[135]|last (?:gen|t1|g2|match)|recent (?:series|match)|reverse sweep|sweep)\b/i;

function isSeriesScopeMessage(message: string): boolean {
  if (isWeeklyLeagueRecapQuestion(message)) return false;
  if (isDatedMatchupRecap(message)) return true;
  if (SERIES.test(message) && /\b(vs\.?|versus|against)\b/i.test(message)) return true;
  return false;
}

const GENERAL_ESPORTS =
  /\b(qualif|msi|worlds|bracket|roster|transfer|rumou?r|patch notes|reddit|kalshi|odds|betting|who won|tournament|play.?in|schedule|when does|plays next|favorite to win|prediction)\b/i;

const CHART =
  /\b(chart|graph|visual|radar|line graph|compare)\b/i;

/** Pure game knowledge — no DB/RAG needed */
const GAME_THEORY =
  /\b(why is|why are|why does|why do|how does|how do|explain|what makes|good into|bad into|strong into|weak into|counter(?:s|ing)?|win condition|scaling|power spike|teamfight|lane state|wave management|draft logic|itemization|synergy|when to pick|when should|matchups? between|enchanter|engage|poke comp|front to back|side lane|weak side|split push|zone control|setup comp)\b/i;

const STAT_NUMBERS =
  /\b(kda|winrate|win rate|gd@?15|csd@?15|dpm|dmg%|gold%|this split|ranking|stats? for|record|most picked)\b/i;

/** Career / historical achievements + historical results — not in OE, needs RAG/web. */
const CAREER =
  /\b(titles?|championships?|trophy|trophies|how many .*(?:won|win|titles?|championships?|worlds?|msi)|lck titles?|lpl titles?|worlds? (?:wins?|titles?|won)|msi (?:wins?|titles?)|career|all-?pro|mvp award|hall of fame|legacy|how many times|(?:who|which team|what team) won\b|winner of\b|won (?:worlds?|msi|the world championship)\b|world champions?\b)\b/i;

/** Roster depth / substitutes. */
const ROSTER_DEPTH =
  /\b(subs?|substitute|backup|back-?up|bench|stand-?in|reserve|role depth|depth chart|who else (?:played|was)|split time)\b/i;

/** Exported for orchestration — career questions must hit RAG/web, never training memory. */
export function isCareerQuestion(message: string): boolean {
  if (!CAREER.test(message)) return false;
  if (STAT_NUMBERS.test(message)) return false;
  return true;
}

/** Exported for orchestration — roster depth questions need tools, never charts. */
export function isRosterDepthQuestion(message: string): boolean {
  return ROSTER_DEPTH.test(message);
}

/** Player + champion performance take ("knight's azir is dogshit") — needs champ-specific stats. */
export function isPlayerChampionPerformanceAsk(message: string): boolean {
  if (!PRO_CHAMPION.test(message)) return false;
  if (OPINION.test(message)) return true;
  if (/\b(winrate|win rate|stats?|record|games on|pick rate|how is|how's|how many games)\b/i.test(message)) {
    return true;
  }
  return /\b(knight|faker|chovy|canyon|oner|zeus|keria|peyz|gumayusi|ruler|caps)\b/i.test(message) ||
    /\b([A-Z][a-z]+(?:'s)?\s+(?:on\s+)?(?:azir|corki|orianna|syndra|ahri))\b/.test(message);
}

/** Exported for classifyIntent — skip data fetches for theory questions */
export function isGameTheoryQuestion(message: string): boolean {
  if (!GAME_THEORY.test(message)) return false;
  if (COMPARE.test(message) && /\b(vs\.?|versus|compare|radar)\b/i.test(message)) return false;
  // Champ vs champ with pro H2H available — use tools/charts, not pure theory.
  if (isChampionMatchupAsk(message)) return false;
  if (SERIES.test(message)) return false;
  if (OPINION.test(message)) return false;
  if (STAT_NUMBERS.test(message)) return false;
  if (STATS.test(message) && STAT_NUMBERS.test(message)) return false;
  return true;
}

function heuristicScope(message: string): ScopePlan {
  // Agent identity / pure greetings — chat only, no tools/charts (and never entity-extract "nuc").
  if (isAgentIdentityAsk(message) || isAgentGreetingOnly(message)) {
    return {
      scope: "lolesports_chat",
      needs_tools: false,
      needs_rag: false,
      needs_charts: false,
      needs_snapshot: false,
      reason: "agent identity / greeting — chat only",
    };
  }

  // Weekly league recaps ("what happened in LCK this week?") need warehouse
  // results + upcoming — not a two-team series recap and never a radar.
  if (isWeeklyLeagueRecapQuestion(message)) {
    return {
      scope: "lolesports_general",
      needs_tools: true,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: "weekly league recap — warehouse schedule/results",
    };
  }

  // SERIES is checked BEFORE compare: "what happened in T1 vs Gen.G series?" contains
  // "vs" but is a recap, not a radar comparison. Compare only wins without series intent.
  if (isSeriesScopeMessage(message)) {
    return {
      scope: "lolesports_series",
      needs_tools: true,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: "series heuristic",
    };
  }

  if (COMPARE.test(message) || (CHART.test(message) && /\b(team|player)\b/i.test(message))) {
    return {
      scope: "lolesports_compare",
      needs_tools: true,
      needs_rag: /\b(reddit|patch|odds)\b/i.test(message),
      needs_charts: true,
      needs_snapshot: false,
      reason: "compare heuristic",
    };
  }

  if (isChampionMatchupAsk(message)) {
    return {
      scope: "lolesports_stats",
      needs_tools: true,
      needs_rag: false,
      needs_charts: true,
      needs_snapshot: false,
      reason: "champion matchup H2H — champ_matchups artifact",
    };
  }

  if (isGameTheoryQuestion(message)) {
    return {
      scope: "lolesports_chat",
      needs_tools: false,
      needs_rag: false,
      needs_charts: false,
      needs_snapshot: false,
      reason: "game theory — baseline knowledge only",
    };
  }

  // Worlds winner / Finals MVP historical lists — verified lookup + wiki fallback.
  if (isWorldsHistoryQuestion(message)) {
    return {
      scope: "lolesports_general",
      needs_tools: true,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: "worlds history — verified lookup + RAG/web",
    };
  }

  // Career / titles: not in OE. Needs RAG (and web fallback). No charts.
  if (isCareerQuestion(message)) {
    return {
      scope: "lolesports_general",
      needs_tools: false,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: "career/history — RAG + web fallback",
    };
  }

  // Roster depth / subs: deterministic tools, never a compare chart.
  if (isRosterDepthQuestion(message)) {
    return {
      scope: "lolesports_stats",
      needs_tools: true,
      needs_rag: false,
      needs_charts: false,
      needs_snapshot: false,
      reason: "roster depth / subs — tools, no chart",
    };
  }

  // Plain roster / lineup query: deterministic team_roster tool, no chart.
  if (ROSTER_QUERY.test(message)) {
    return {
      scope: "lolesports_stats",
      needs_tools: true,
      needs_rag: false,
      needs_charts: false,
      needs_snapshot: false,
      reason: "roster query — team_roster tool, no chart",
    };
  }

  if (isPlayerChampionPerformanceAsk(message)) {
    return {
      scope: "lolesports_stats",
      needs_tools: true,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: "player+champion performance — champ stats + gol.gg fallback",
    };
  }

  if (STATS.test(message) || OPINION.test(message)) {
    return {
      scope: "lolesports_stats",
      needs_tools: true,
      needs_rag: OPINION.test(message),
      needs_charts: false,
      needs_snapshot: false,
      reason: OPINION.test(message) ? "opinion/stats heuristic" : "stats heuristic",
    };
  }

  if (GENERAL_ESPORTS.test(message)) {
    const needsTools =
      /\b(winrate|kda|stats?|rank|record|schedule|when does|plays next|roster|who(?:'s| is) on|lineup|most picked)\b/i
        .test(message);
    return {
      scope: "lolesports_general",
      needs_tools: needsTools,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: needsTools ? "general esports + stats" : "general esports — RAG only",
    };
  }

  return {
    scope: "lolesports_chat",
    needs_tools: false,
    needs_rag: false,
    needs_charts: false,
    needs_snapshot: false,
    reason: "casual lolesports chat",
  };
}

const SCOPE_SYSTEM = `Classify a user message for nucky, a League of Legends esports analyst agent.
Respond ONLY with compact JSON:
{
  "scope": "off_topic" | "lolesports_chat" | "lolesports_general" | "lolesports_stats" | "lolesports_compare" | "lolesports_series",
  "needs_tools": boolean,
  "needs_rag": boolean,
  "needs_charts": boolean,
  "reason": "short string"
}

Rules:
- off_topic ONLY for clearly unrelated topics (recipes, homework, coding, math) with NO lolesports thread context
- lolesports_chat: game theory, champion matchups, macro/draft logic, casual fan talk — needs_tools FALSE, needs_rag FALSE
  examples: "why is azir good into corki?", "explain enchanter vs engage bot lane", "what's the win condition for poke comps"
- lolesports_stats: numeric stats, rankings, fraud/roast takes — needs_tools TRUE
- lolesports_compare: entity comparisons with charts — needs_tools TRUE
- lolesports_general: tournament news, patch notes, rumors — needs_rag TRUE; needs_tools TRUE only if asking for specific stats/schedules/rosters
- follow-ups refining a prior answer → lolesports_stats, needs_tools true
- never mark off_topic when conversation history is about lolesports`;

export async function classifyScope(
  apiKey: string,
  message: string,
  history: OpenRouterChatMessage[] = [],
  usageTracker?: UsageTracker,
): Promise<ScopePlan> {
  // Identity / greeting always wins — even mid-thread ("what can you do?").
  if (isAgentIdentityAsk(message) || isAgentGreetingOnly(message)) {
    return heuristicScope(message);
  }

  const thread = resolveThreadIntent(message, history);

  if (thread.isFollowUp) {
    // Roster follow-ups ("who was the sub jungler?") → tools, never a chart.
    if (thread.followUpType === "roster_follow_up") {
      return {
        scope: "lolesports_stats",
        needs_tools: true,
        needs_rag: false,
        needs_charts: false,
        needs_snapshot: false,
        reason: "roster follow-up — depth tools, no chart",
      };
    }

    // Parallel ("how about faker?") → inherit prior topic's scope (career→career, etc.).
    // Clarification ("I meant standings") → refine prior answer (stats-leaning).
    const inheritBasis =
      thread.followUpType === "parallel" && thread.inheritedTopic
        ? `${thread.inheritedTopic}\n${message}`
        : thread.effectiveMessage;
    const refined = heuristicScope(inheritBasis);

    // Don't force charts on follow-ups unless the user explicitly asks to compare now.
    const allowChart = COMPARE.test(message) && /\b(vs\.?|versus|compare|radar)\b/i.test(message);

    return {
      scope: refined.scope === "lolesports_chat" ? "lolesports_general" : refined.scope,
      needs_tools: refined.needs_tools,
      needs_rag: refined.needs_rag,
      needs_charts: allowChart && refined.needs_charts,
      needs_snapshot: false,
      reason: `conversation follow-up (${thread.followUpType})`,
    };
  }

  if (OFF_TOPIC.test(message) && !shouldTreatAsLolesports(message, history)) {
    return {
      scope: "off_topic",
      needs_tools: false,
      needs_rag: false,
      needs_charts: false,
      needs_snapshot: false,
      reason: "off-topic",
    };
  }

  const mentionsKnownPlayer = Object.keys(PLAYER_ALIASES).some((alias) =>
    new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(message)
  ) ||
    Object.values(PLAYER_ALIASES).some((name) =>
      new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(message)
    );

  // Short player asks ("Ice stats", "Inspired form") often lack league/team keywords —
  // still treat as LoL when we know the handle or the ask is clearly a stats/compare query.
  if (
    !LOLESPORTS.test(message) &&
    !STATS.test(message) &&
    !COMPARE.test(message) &&
    !SERIES.test(message) &&
    !ROSTER_QUERY.test(message) &&
    !mentionsKnownPlayer &&
    !shouldTreatAsLolesports(message, history)
  ) {
    return {
      scope: "off_topic",
      needs_tools: false,
      needs_rag: false,
      needs_charts: false,
      needs_snapshot: false,
      reason: "no lolesports signal",
    };
  }

  // Worlds winner/MVP lists — verified lookup, not generic career RAG-only path.
  if (isWorldsHistoryQuestion(message)) {
    return {
      scope: "lolesports_general",
      needs_tools: true,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: "worlds history override — verified lookup + RAG/web",
    };
  }

  // Career / titles routing is deterministic — never let the LLM re-route it to
  // stat tools (titles aren't in OE; they come from RAG/web). Runs regardless of
  // history so mid-conversation career questions don't dump current-split stats.
  if (isCareerQuestion(message)) {
    return {
      scope: "lolesports_general",
      needs_tools: false,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: "career/history override — RAG + web fallback",
    };
  }

  if (isWeeklyLeagueRecapQuestion(message)) {
    return {
      scope: "lolesports_general",
      needs_tools: true,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: "weekly league recap override — warehouse, no chart",
    };
  }

  // Series recaps are deterministic too — never let the LLM turn "what happened in
  // T1 vs Gen.G series?" into a compare radar just because it contains "vs".
  if (isSeriesScopeMessage(message) && !/\b(compare|radar|head.?to.?head|h2h)\b/i.test(message)) {
    return {
      scope: "lolesports_series",
      needs_tools: true,
      needs_rag: true,
      needs_charts: false,
      needs_snapshot: false,
      reason: "series recap override — no chart",
    };
  }

  const quick = heuristicScope(thread.effectiveMessage);

  if (history.length < 2) {
    return quick;
  }

  try {
    const contextMessages: OpenRouterChatMessage[] = history.slice(-HISTORY_WINDOW).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 800),
    }));

    const raw = await completeOnce(apiKey, {
      model: MODEL_JSON,
      messages: [
        { role: "system", content: SCOPE_SYSTEM },
        ...contextMessages,
        { role: "user", content: message },
      ],
      temperature: 0,
      max_tokens: 180,
    }, usageTracker);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return quick;

    const parsed = JSON.parse(raw.slice(start, end + 1));
    const scope = String(parsed.scope ?? quick.scope) as ConversationScope;
    const validScopes: ConversationScope[] = [
      "off_topic",
      "lolesports_chat",
      "lolesports_general",
      "lolesports_stats",
      "lolesports_compare",
      "lolesports_series",
    ];

    const resolvedScope = validScopes.includes(scope) ? scope : quick.scope;
    if (resolvedScope === "off_topic" && shouldTreatAsLolesports(message, history)) {
      return { ...quick, reason: "overrode off_topic — active lolesports thread" };
    }

    const modelScope = resolvedScope === "off_topic" ? quick.scope : resolvedScope;
    const needsTools = Boolean(parsed.needs_tools ?? quick.needs_tools);
    const needsRag = Boolean(parsed.needs_rag ?? quick.needs_rag);

    // Model sometimes over-fetches — trust heuristics for pure theory
    if (isGameTheoryQuestion(message) && modelScope === "lolesports_chat") {
      return {
        scope: "lolesports_chat",
        needs_tools: false,
        needs_rag: false,
        needs_charts: false,
        needs_snapshot: false,
        reason: "game theory override",
      };
    }

    return {
      scope: modelScope,
      needs_tools: needsTools,
      needs_rag: needsRag,
      needs_charts: Boolean(parsed.needs_charts ?? quick.needs_charts),
      needs_snapshot: false,
      reason: String(parsed.reason ?? "model"),
    };
  } catch {
    return quick;
  }
}

const OFF_TOPIC_REFUSALS = [
  "i just analyze league games man, not doing your homework.",
  "that's outside my lane bro — hit me with a draft or pro play question.",
  "nah i'm nucky, not a general assistant. league esports only.",
];

export function offTopicRefusal(): string {
  const idx = Math.floor(Math.random() * OFF_TOPIC_REFUSALS.length);
  return OFF_TOPIC_REFUSALS[idx]!;
}
