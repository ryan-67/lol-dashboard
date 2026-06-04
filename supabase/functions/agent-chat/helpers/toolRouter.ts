export interface VectorSearchPlan {
  filterSource: string | null;
  filterKind: string | null;
  matchCount: number;
}

export interface ToolRoutePlan {
  /** Skip fragile LLM-generated SQL when deterministic tools already cover the ask */
  skipSql: boolean;
  vector: VectorSearchPlan;
  reason: string;
}

const PATCH_HINTS = /\b(patch|meta shift|balance|nerf|buff|item change)\b/i;
const REDDIT_HINTS = /\b(reddit|community|thread|post.?match|discussion|meme)\b/i;
const KALSHI_HINTS = /\b(kalshi|odds|betting|line|market|implied)\b/i;
const SCHEDULE_HINTS = /\b(schedule|bracket|playoffs|upcoming|next match|when do|fixture)\b/i;
const PLAYER_HINTS = /\b(player|faker|chovy|canyon|oner|roster|transfer)\b/i;
const TEAM_HINTS = /\b(team|t1|geng|gen\.?g|g2|cloud9|liquid)\b/i;
const MATCH_HINTS = /\b(match|game \d|series|bo[135]|draft|vod)\b/i;

function inferContentKind(message: string): string | null {
  if (SCHEDULE_HINTS.test(message)) return "schedule";
  if (PATCH_HINTS.test(message)) return "patch";
  if (MATCH_HINTS.test(message)) return "match";
  if (PLAYER_HINTS.test(message)) return "player";
  if (TEAM_HINTS.test(message)) return "team";
  return null;
}

function inferSourceFilter(message: string): string | null {
  if (KALSHI_HINTS.test(message)) return "kalshi";
  if (REDDIT_HINTS.test(message)) return "reddit";
  if (PATCH_HINTS.test(message)) return "patch_notes";
  if (SCHEDULE_HINTS.test(message) || PLAYER_HINTS.test(message) || TEAM_HINTS.test(message) || MATCH_HINTS.test(message)) {
    return "liquipedia";
  }
  return null;
}

/** Deterministic analyst tools that satisfy common stat questions without SQL */
const SQL_COVERING_TOOLS = new Set([
  "matchup_lookup",
  "player_rankings",
  "champion_meta",
  "team_form",
  "lane_matchup",
  "stat_snapshot",
]);

export function routeTools(message: string, analystToolNames: string[]): ToolRoutePlan {
  const ranDeterministic = analystToolNames.filter((t) => SQL_COVERING_TOOLS.has(t));
  const hasCompareIntent = /\b(compare|vs|versus)\b/i.test(message);
  const hasStatIntent = /\b(winrate|kda|stats?|rank|record|h2h|head.?to.?head|form|meta|champion)\b/i.test(message);

  const skipSql =
    ranDeterministic.length >= 1 &&
    (hasStatIntent || hasCompareIntent) &&
    !/\b(custom|sql|raw query|every player with)\b/i.test(message);

  const filterKind = inferContentKind(message);
  const filterSource = inferSourceFilter(message);

  return {
    skipSql,
    vector: {
      filterSource,
      filterKind,
      matchCount: filterSource || filterKind ? 8 : 10,
    },
    reason: skipSql
      ? `deterministic tools: ${ranDeterministic.join(", ")}`
      : "sql or vector fallback",
  };
}
