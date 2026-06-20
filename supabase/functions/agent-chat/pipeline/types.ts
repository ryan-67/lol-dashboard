// Shared contracts for nuckyAI's 3-layer pipeline.
//
//   Layer 1  Guardrail Router  — pipeline/guardrail.ts  (cheap refusal gate)
//   Layer 2  Tool Decider      — pipeline/toolDecider.ts (decide + fetch evidence)
//   Layer 3  Synthesis         — pipeline/synthesis.ts   (cross-verify + generate + write-back)
//
// Each layer takes a typed input and returns a typed output. Conversation history
// (`HistoryMessage[]`) threads through every layer so follow-ups stay coherent.

import type { ScopePlan } from "../helpers/scope.ts";
import type { ThreadIntent } from "../helpers/threadIntent.ts";
import type { IntentPlan } from "../helpers/classify.ts";
import type { TavilyResult, TavilySearchIntent } from "../helpers/tavilySearch.ts";
import type { AnalysisIntent } from "../helpers/prompts.ts";

export interface ImageAttachment {
  /** HTTPS URL or data:image/...;base64,... */
  url: string;
  mimeType?: string;
  name?: string;
}

export interface HistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface MentionedPlayer {
  name: string;
}

/** Filters coming from the dashboard UI (league/split/year scoping). */
export interface ResolvedFilters {
  league: string;
  split: string | undefined;
  year: string | undefined;
  rosterSplitHint: string | undefined;
}

// ---- Layer 1: Guardrail Router ----

export interface GuardrailResult {
  /** false → hard refusal; orchestrator streams `refusal` and stops. */
  allowed: boolean;
  refusal: string;
  scope: ScopePlan;
  thread: ThreadIntent;
  /** message rewritten with thread context for downstream tool/RAG queries. */
  queryForTools: string;
}

// ---- Layer 2: Tool Decider ----

/** Which data planes the decider chose to pull from (for logging/telemetry). */
export interface SourceTrace {
  oracleElixir: boolean;
  rag: boolean;
  web: boolean;
  schedule: boolean;
  kalshi: boolean;
  sentiment: boolean;
}

export interface Evidence {
  // routing flags
  scope: ScopePlan;
  thread: ThreadIntent;
  plan: IntentPlan;
  careerIntent: boolean;
  rosterDepthIntent: boolean;
  subjectiveIntent: boolean;
  playerChampionIntent: boolean;
  chatOnly: boolean;

  // grounded context
  worldBlock: string;
  mentionedRosterBlock: string;
  mentionedPlayers: MentionedPlayer[];
  matchStats: Record<string, unknown>;
  externalContext: string;
  hasWebVerifiedChunk: boolean;

  // compare chart (streamed before synthesis text)
  chartPrefix: string;
  isCompare: boolean;

  // web fetch (raw — verified in Layer 3)
  webSnippets: TavilyResult[];
  webFactQuery: string;
  webEntities: string[];
  webSearchIntent: TavilySearchIntent;

  /** Reddit/community snippets — opinion only, never fact write-back. */
  sentimentSnippets: TavilyResult[];
  sentimentContext: string;

  /** Live Kalshi market block for synthesis (empty if none). */
  kalshiOddsBlock: string;

  // synthesis mode
  analysisIntent: AnalysisIntent;
  resolvedSplit: string;
  league: string;
  year: string | undefined;

  sources: SourceTrace;
}

// ---- Layer 3: Synthesis ----

export interface SynthesisResult {
  /** full assistant text (chart prefix + model answer) for persistence. */
  assistantText: string;
}
