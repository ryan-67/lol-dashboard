// Layer 2 — Tool Decider.
//
// Decides WHERE to source data for an allowed prompt, then fetches it. Sources, in
// tiered priority:
//   1. Oracle's Elixir (oe_slices) — verified pro stats via deterministic analyst tools
//   2. RAG knowledge base (documents / pgvector) — patch/reddit/kalshi/liquipedia chunks
//   3. Web fallback (Tavily over a Leaguepedia/Liquipedia/gol.gg allowlist) — only when
//      OE + RAG can't cover the ask (career titles, roster gaps, fresh factual questions)
//
// Always assumes the CURRENT day/split/year (from client_now → WORLD_CONTEXT) unless the
// dashboard filters or the message name another. Returns raw evidence; cross-verification
// and RAG write-back happen in Layer 3 (synthesis), keeping fetch and trust separate.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAnalystContext, mergeToolResults } from "../helpers/analystTools.ts";
import { chartMarkdownBlock, runTeamCompare } from "../helpers/teamCompare.ts";
import { runPlayerCompare } from "../helpers/playerCompare.ts";
import { routeTools } from "../helpers/toolRouter.ts";
import { classifyIntent } from "../helpers/classify.ts";
import { sqlQuery, vectorSearch } from "../helpers/tools.ts";
import { searchTavilyWikiFirst, type TavilySearchIntent } from "../helpers/tavilySearch.ts";
import { isCareerQuestion, isRosterDepthQuestion } from "../helpers/scope.ts";
import {
  buildCurrentWorldContext,
  formatMentionedRosterBlock,
  lookupPlayersInMessage,
} from "../helpers/currentContext.ts";
import type { Evidence, GuardrailResult, HistoryMessage, ResolvedFilters } from "./types.ts";
import { detectAnalysisIntent } from "../helpers/prompts.ts";

const CAREER_ENTITY_STOPWORDS = new Set([
  "LCK", "LPL", "LEC", "LCS", "MSI", "Worlds", "World", "Championship", "Championships",
  "Title", "Titles", "League", "Legends", "How", "Many", "Does", "Do", "Have", "Has",
  "And", "Or", "The", "Respectively", "What", "About", "Who", "Win", "Won", "Career",
]);

/** Derive the championship terms a career question is about (LCK/Worlds/MSI/...). */
function careerTitleTerms(text: string): string {
  const t = text.toLowerCase();
  const terms: string[] = [];
  if (/\bworlds?\b|world championship/.test(t)) terms.push("World Championship");
  if (/\bmsi\b|mid-?season/.test(t)) terms.push("MSI");
  if (/\blck\b/.test(t)) terms.push("LCK title");
  if (/\blpl\b/.test(t)) terms.push("LPL title");
  if (/\blec\b/.test(t)) terms.push("LEC title");
  if (/\blcs\b/.test(t)) terms.push("LCS title");
  if (!terms.length) terms.push("championship titles");
  return terms.join(" ");
}

/** Resolve the player/team names a career question is asking about (handles "X and Y"). */
function buildCareerEntities(
  message: string,
  inheritedTopic: string | null,
  mentioned: Array<{ name: string }>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  };
  for (const p of mentioned) add(p.name);
  const text = `${message} ${inheritedTopic ?? ""}`;
  for (const token of text.match(/\b[A-Z][a-zA-Z][a-zA-Z.'-]*\b/g) ?? []) {
    if (!CAREER_ENTITY_STOPWORDS.has(token)) add(token);
  }
  return out.slice(0, 4);
}

const PATCH_HINTS =
  /\b(patch notes?|patch \d|meta shift|balance|nerf|buff|item change|champion changes?)\b/i;
const TOURNAMENT_HINTS =
  /\b(bracket|tournament format|groups? stage|swiss|single.?elim|double.?elim|play.?in|msi format|worlds format|first stand format|qualification format|seeding rules?)\b/i;
const ROSTER_WEB_HINTS =
  /\b(roster|lineup|transfer|signed|joined|left|sub(?:stitute)?|backup player|who (?:is|are) on|who plays for)\b/i;

function detectWebSearchIntent(
  message: string,
  inheritedTopic: string | null,
  careerIntent: boolean,
  rosterDepthIntent: boolean,
): TavilySearchIntent {
  const text = `${message} ${inheritedTopic ?? ""}`;
  if (careerIntent) return "career";
  if (rosterDepthIntent || ROSTER_WEB_HINTS.test(text)) return "roster";
  if (PATCH_HINTS.test(text)) return "patch";
  if (TOURNAMENT_HINTS.test(text)) return "tournament";
  return "general";
}

/** Build Leaguepedia/Liquipedia-targeted queries for Tavily (not raw chat text). */
function buildWikiQueries(
  intent: TavilySearchIntent,
  message: string,
  thread: GuardrailResult["thread"],
  webEntities: string[],
  league: string,
  split: string,
): string[] {
  const baseQuery =
    thread.isFollowUp && thread.inheritedTopic
      ? `${message} (context: ${thread.inheritedTopic})`
      : message;
  const scopeSuffix = league && league !== "ALL" ? ` ${league}` : "";
  const splitSuffix = split ? ` ${split}` : "";

  switch (intent) {
    case "career": {
      const careerTopic = careerTitleTerms(`${message} ${thread.inheritedTopic ?? ""}`);
      return webEntities.length
        ? webEntities.map(
            (e) => `${e} League of Legends esports ${careerTopic} liquipedia leaguepedia`,
          )
        : [`${baseQuery} League of Legends esports ${careerTopic} liquipedia leaguepedia`];
    }
    case "roster":
      return webEntities.length
        ? webEntities.map(
            (e) => `${e} League of Legends esports current roster${scopeSuffix}${splitSuffix} liquipedia leaguepedia`,
          )
        : [`${baseQuery} League of Legends esports roster${scopeSuffix}${splitSuffix} liquipedia leaguepedia`];
    case "patch":
      return [
        `${baseQuery} League of Legends patch notes liquipedia leaguepedia`,
        `League of Legends patch notes recent changes liquipedia`,
      ];
    case "tournament":
      return [
        `${baseQuery} League of Legends esports tournament format bracket liquipedia leaguepedia`,
        `${baseQuery} League of Legends esports schedule results liquipedia`,
      ];
    default:
      return [`${baseQuery} League of Legends esports liquipedia leaguepedia`];
  }
}

/** Extract team/player tokens for roster/career wiki searches. */
function buildWebEntities(
  message: string,
  inheritedTopic: string | null,
  mentioned: Array<{ name: string }>,
  intent: TavilySearchIntent,
): string[] {
  if (intent === "career") {
    return buildCareerEntities(message, inheritedTopic, mentioned);
  }
  if (intent === "roster") {
    const out = buildCareerEntities(message, inheritedTopic, mentioned);
    if (out.length) return out;
    // Team acronyms / names from message (T1, Gen.G, DK, etc.)
    const teams =
      `${message} ${inheritedTopic ?? ""}`.match(
        /\b(?:T1|Gen\.?G|G2|DK|DRX|HLE|KT|BLG|TES|JDG|WBG|C9|TL|FNC|100T|GAM|PSG)\b/gi,
      ) ?? [];
    return [...new Set(teams.map((t) => t.trim()))].slice(0, 4);
  }
  return [];
}

function externalCoversIntent(intent: TavilySearchIntent, externalContext: string): boolean {
  const ctx = externalContext.toLowerCase();
  if (!ctx.trim()) return false;
  switch (intent) {
    case "career":
      return /web_verified/i.test(externalContext) ||
        /\b(title|championship|worlds|won \d|msi)\b/.test(ctx);
    case "roster":
      return /\b(roster|lineup|substitute|sub|joined|transferred|plays for)\b/.test(ctx);
    case "patch":
      return /\b(patch|nerf|buff|balance|changes)\b/.test(ctx);
    case "tournament":
      return /\b(bracket|format|groups|swiss|playoffs|qualif|seeding)\b/.test(ctx);
    default:
      return ctx.length > 120;
  }
}

export interface DecideDeps {
  serviceClient: SupabaseClient;
  openrouterApiKey: string;
  tavilyApiKey: string;
  message: string;
  history: HistoryMessage[];
  guardrail: GuardrailResult;
  filters: ResolvedFilters;
  clientNow?: string;
}

export async function decideAndFetch(deps: DecideDeps): Promise<Evidence> {
  const { serviceClient, openrouterApiKey, tavilyApiKey, message, history, guardrail, filters } =
    deps;
  const { scope, thread, queryForTools } = guardrail;

  // --- Current-day grounding: WORLD_CONTEXT defaults to "now" unless filters override ---
  const currentCtx = await buildCurrentWorldContext(
    serviceClient,
    deps.clientNow,
    filters.rosterSplitHint,
  );
  const worldBlock = currentCtx.worldBlock;
  let resolvedSplit = filters.split ?? currentCtx.split;

  const mentionedPlayers = lookupPlayersInMessage(
    thread.isFollowUp ? queryForTools : message,
    currentCtx.playerTeamIndex,
  );
  const mentionedRosterBlock = formatMentionedRosterBlock(mentionedPlayers);

  // --- Intent flags (career/roster are never answered from current-split OE stats) ---
  const inheritedCareer = thread.inheritedTopic ? isCareerQuestion(thread.inheritedTopic) : false;
  const careerIntent = isCareerQuestion(message) || (thread.isFollowUp && inheritedCareer);
  const rosterDepthIntent =
    isRosterDepthQuestion(message) || thread.followUpType === "roster_follow_up";

  const runTools = scope.needs_tools && !careerIntent;
  const runRag = scope.needs_rag;

  const sources = { oracleElixir: false, rag: false, web: false, schedule: false };
  let matchStats: Record<string, unknown> = {};
  let externalContext = "";
  let chartPrefix = "";
  let isCompare = false;
  let analystToolNames: string[] = [];
  let hasWebVerifiedChunk = false;

  // ---- Source 1: Oracle's Elixir deterministic tools ----
  if (runTools) {
    const analystCtx = await buildAnalystContext(
      serviceClient,
      queryForTools,
      filters.league,
      filters.split,
      { includeSnapshot: false, widenForSeries: scope.scope === "lolesports_series" },
    );
    matchStats = mergeToolResults(analystCtx);
    analystToolNames = analystCtx.tools.map((t) => t.tool);
    if (analystToolNames.length) sources.oracleElixir = true;
    if (analystToolNames.includes("schedule_lookup")) sources.schedule = true;
    if (analystCtx.tools[0]?.data?.split) {
      resolvedSplit = String(analystCtx.tools[0].data.split);
    }

    // Compare radar only on explicit compare intent — never on roster/sub/career follow-ups.
    const compareIntentText = `${message} ${thread.inheritedTopic ?? ""}`;
    const hasCompareIntent = /\b(compare|vs\.?|versus|radar|head.?to.?head|h2h)\b/i.test(
      compareIntentText,
    );
    const blockChart =
      thread.followUpType === "roster_follow_up" ||
      isRosterDepthQuestion(message) ||
      isCareerQuestion(message);
    const wantsCompare =
      !blockChart && (scope.scope === "lolesports_compare" || hasCompareIntent);

    if (wantsCompare) {
      const teamCompare = await runTeamCompare(
        serviceClient,
        queryForTools,
        filters.league,
        filters.split,
      );
      const playerCompare = teamCompare
        ? null
        : await runPlayerCompare(serviceClient, queryForTools, filters.league, filters.split);
      const compareResult = teamCompare ?? playerCompare;
      if (compareResult) {
        matchStats.compare = compareResult.data;
        isCompare = true;
        chartPrefix = `${chartMarkdownBlock(compareResult.chart)}\n\n`;
        resolvedSplit = String(compareResult.data.split ?? resolvedSplit);
      }
    }
  }

  // ---- Intent plan (drives SQL/vector + final model choice) ----
  const route = routeTools(queryForTools, analystToolNames);
  const plan = await classifyIntent(openrouterApiKey, queryForTools, history, {
    needsTools: runTools,
    needsRag: runRag,
  });

  if (plan.needs_sql && runTools && !isCompare && !route.skipSql) {
    const sql = await sqlQuery(serviceClient, openrouterApiKey, queryForTools);
    if (sql.ok) {
      matchStats.sql = sql.data;
      sources.oracleElixir = true;
    }
  }

  // ---- Source 2: RAG knowledge base (career/roster always vector-search) ----
  const forceVector = careerIntent || rosterDepthIntent;
  if (
    (runRag &&
      (plan.needs_vector ||
        forceVector ||
        /\b(favorite|favou?rite|odds|kalshi|prediction)\b/i.test(message))) ||
    forceVector
  ) {
    const isOdds = /\b(odds|kalshi|favorite|favou?rite|prediction)\b/i.test(message);
    const vectorRoute = isOdds
      ? { ...route.vector, filterSource: "kalshi" as string | null }
      : careerIntent || rosterDepthIntent
      ? {
          ...route.vector,
          filterSource: route.vector.filterSource ?? "liquipedia",
          filterKind: route.vector.filterKind ?? (rosterDepthIntent ? "team" : "player"),
        }
      : route.vector;
    const vec = await vectorSearch(serviceClient, openrouterApiKey, queryForTools, vectorRoute);
    if (vec.ok) {
      const chunks =
        (vec.data as Array<{ content: string; source: string; title?: string }> | undefined) ?? [];
      hasWebVerifiedChunk = chunks.some((c) => c.source === "web_verified");
      externalContext = chunks
        .map((c) => `[${c.source}${c.title ? ` — ${c.title}` : ""}] ${c.content}`)
        .join("\n\n");
      if (chunks.length) sources.rag = true;
    }
  }

  const chatOnly =
    scope.scope === "lolesports_chat" && !runTools && !runRag && !externalContext;

  // ---- Source 3: Web fallback (Tavily) — wiki-first; verify in Layer 3 ----
  const hasExternal = externalContext.trim().length > 0;
  const hasUsefulStats = Object.keys(matchStats).length > 0;
  const factualGeneral = scope.scope === "lolesports_general";
  const webSearchIntent = detectWebSearchIntent(
    message,
    thread.inheritedTopic,
    careerIntent,
    rosterDepthIntent,
  );
  const patchIntent = webSearchIntent === "patch";
  const tournamentIntent = webSearchIntent === "tournament";
  const rosterWebIntent = webSearchIntent === "roster";

  const needWeb =
    Boolean(tavilyApiKey) &&
    !chatOnly &&
    scope.scope !== "lolesports_chat" &&
    (
      (careerIntent && !hasWebVerifiedChunk) ||
      (rosterDepthIntent && !analystToolNames.includes("team_role_depth") && !hasExternal) ||
      (rosterWebIntent && !externalCoversIntent("roster", externalContext)) ||
      (patchIntent && !externalCoversIntent("patch", externalContext)) ||
      (tournamentIntent && !externalCoversIntent("tournament", externalContext)) ||
      (factualGeneral && !hasExternal && !hasUsefulStats)
    );

  let webSnippets: Evidence["webSnippets"] = [];
  let webFactQuery = "";
  let webEntities: string[] = [];

  if (needWeb) {
    webEntities = buildWebEntities(
      message,
      thread.inheritedTopic,
      mentionedPlayers,
      webSearchIntent,
    );
    const queries = buildWikiQueries(
      webSearchIntent,
      message,
      thread,
      webEntities,
      filters.league,
      resolvedSplit,
    ).slice(0, 4);

    webSnippets = (
      await Promise.all(
        queries.map((q) => searchTavilyWikiFirst(tavilyApiKey, q, { maxResults: 6 })),
      )
    ).flat();

    // Dedupe + cap; wiki domains already ranked first by searchTavilyWikiFirst.
    const seen = new Set<string>();
    webSnippets = webSnippets.filter((s) => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    }).slice(0, 12);

    webFactQuery = webEntities.length
      ? `${message} — ${webSearchIntent}: ${webEntities.join(", ")}`
      : `${message} — ${webSearchIntent} (League of Legends esports)`;
    if (webSnippets.length) sources.web = true;
  }

  const analysisIntent = detectAnalysisIntent(
    message,
    scope.scope,
    Object.keys(matchStats).length > 0,
  );

  return {
    scope,
    thread,
    plan,
    careerIntent,
    rosterDepthIntent,
    chatOnly,
    worldBlock,
    mentionedRosterBlock,
    mentionedPlayers,
    matchStats,
    externalContext,
    hasWebVerifiedChunk,
    chartPrefix,
    isCompare,
    webSnippets,
    webFactQuery,
    webEntities,
    webSearchIntent,
    analysisIntent,
    resolvedSplit,
    league: filters.league,
    year: filters.year,
    sources,
  };
}
