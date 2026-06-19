import type { IntentPlan } from "./classify.ts";
import { isSeriesPlayerQuestion } from "./seriesAnalysis.ts";

export function isRosterQuestion(message: string): boolean {
  return (
    /\b(roster|lineup|players? on|who(?:'s| is| are) on|who plays for|members on)\b/i.test(message) ||
    /\b(what|which|name|list|tell me).{0,50}\bplayers?\b/i.test(message)
  );
}
export function isRosterOnlyQuestion(message: string): boolean {
  return isRosterQuestion(message) &&
    !/\b(compare|vs|versus|winrate|win\s*rate|stats?|kda|graph|chart|reddit|schedule)\b/i.test(message);
}

export function isTeamWinrateChartQuestion(message: string): boolean {
  const hasWinrate = /\bwin\s*rates?\b/i.test(message);
  const hasGraph = /\b(line\s*graph|line\s*chart|chart|graph|plot|timeline|over time)\b/i.test(message);
  return hasWinrate && hasGraph;
}

export function isScheduleQuestion(message: string): boolean {
  return /\b(schedule|this week|upcoming|next match|plays|match today|bracket|when|what'?s on)\b/i.test(
    message,
  );
}

export function isRedditQuestion(message: string): boolean {
  return /\b(reddit|community|thread|post.?match|discussion)\b/i.test(message);
}

export function isChampionPoolCompareQuestion(message: string): boolean {
  return (
    /\b(champion\s*pool|champ\s*pool|champion\s*pools|champ\s*pools|pool\s*breakdown|pick\s*pool)\b/i.test(
      message,
    ) &&
    /\b(compare|vs\.?|versus)\b/i.test(message)
  );
}

export function isCompareQuestion(message: string): boolean {
  return /\b(compare|radar|vs\.?|versus)\b/i.test(message) &&
    !isRosterQuestion(message);
}

/** Last/latest matchup recap — "what happened in the last t1 vs geng series?" */
export function isSeriesRecapQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  if (!/\b(vs\.?|versus|against)\b/i.test(lower)) return false;

  const wantsRecap =
    /\b(what happened|what went down|how did|who won|recap|tell me about|breakdown|go over)\b/i.test(lower);
  const wantsLast = /\b(last|latest|most recent|recent)\b/i.test(lower);
  const wantsSeries = /\b(series|matchup|match|playoffs|bo[135])\b/i.test(lower);

  return wantsRecap && (wantsLast || wantsSeries);
}

export function isSeriesQuestion(message: string): boolean {
  return isSeriesPlayerQuestion(message) || isSeriesRecapQuestion(message);
}

/** MSI/Worlds/First Stand qualification — narrative/RAG only, not OE stats. */
export function isEventQualificationQuestion(message: string): boolean {
  return (
    /\b(msi|worlds|first stand)\b/i.test(message) &&
    /\b(qualif|qualified|qualifying|seed|seeding|attend|going to|who made|which teams)\b/i.test(message)
  );
}

export function eventQualificationRagQuery(message: string): string {
  const year = message.match(/\b(20\d{2})\b/)?.[1] ?? String(new Date().getUTCFullYear());
  return `MSI ${year} qualified teams LCK LPL LEC LCS qualification standings`;
}

export function eventQualificationFallbackAnswer(message: string): string {
  const year = message.match(/\b(20\d{2})\b/)?.[1] ?? String(new Date().getUTCFullYear());
  const event = /\bworlds\b/i.test(message)
    ? "worlds"
    : /\bfirst stand\b/i.test(message)
    ? "first stand"
    : "msi";
  return `don't have indexed qualification data for ${event} ${year} yet — check back after spring playoffs wrap or once liquipedia is indexed.`;
}

export interface QueryMode {
  kind: "roster" | "chart" | "schedule" | "reddit" | "compare" | "general";
  skipCompare: boolean;
  heuristicPlan: IntentPlan | null;
  maxTokens: number;
}

function plan(
  kind: QueryMode["kind"],
  skipCompare: boolean,
  heuristicPlan: IntentPlan,
): QueryMode {
  return {
    kind,
    skipCompare,
    heuristicPlan,
    maxTokens: heuristicPlan.max_tokens ?? 900,
  };
}

export function detectQueryMode(message: string): QueryMode {
  if (isRosterOnlyQuestion(message)) {
    return plan("roster", true, {
      needs_sql: false,
      needs_vector: false,
      complexity: "simple",
      reason: "roster",
      max_tokens: 320,
    });
  }

  if (isTeamWinrateChartQuestion(message)) {
    return plan("chart", true, {
      needs_sql: false,
      needs_vector: false,
      complexity: "simple",
      reason: "team_winrate_chart",
      max_tokens: 220,
    });
  }

  if (isSeriesQuestion(message)) {
    return plan("general", true, {
      needs_sql: false,
      needs_vector: false,
      complexity: "simple",
      reason: "series_recap",
      max_tokens: 900,
    });
  }

  if (isEventQualificationQuestion(message)) {
    return plan("general", true, {
      needs_sql: false,
      needs_vector: true,
      complexity: "simple",
      reason: "event_qualification",
      max_tokens: 450,
    });
  }

  if (isScheduleQuestion(message)) {
    return plan("schedule", true, {
      needs_sql: false,
      needs_vector: false,
      complexity: "simple",
      reason: "schedule_lookup",
      max_tokens: 550,
    });
  }

  if (isRedditQuestion(message)) {
    return {
      kind: "reddit",
      skipCompare: !isCompareQuestion(message),
      heuristicPlan: {
        needs_sql: false,
        needs_vector: true,
        complexity: "simple",
        reason: "reddit_narrative",
        max_tokens: 700,
      },
      maxTokens: 700,
    };
  }

  if (isCompareQuestion(message)) {
    return {
      kind: "compare",
      skipCompare: false,
      heuristicPlan: null,
      maxTokens: 900,
    };
  }

  return {
    kind: "general",
    skipCompare: false,
    heuristicPlan: null,
    maxTokens: 900,
  };
}
