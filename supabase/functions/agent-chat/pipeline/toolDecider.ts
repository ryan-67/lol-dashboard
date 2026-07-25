// Layer 2 — Tool Decider.
//
// Decides WHERE to source data for an allowed prompt, then fetches it. Sources, in
// tiered priority:
//   1. Oracle's Elixir (oe_slices) — verified pro stats via deterministic analyst tools
//   2. RAG knowledge base (documents / pgvector) — patch/reddit/kalshi/liquipedia chunks
//   3. CitoAPI — structured esports data (transfers, rankings, trends, schedule, meta)
//   4. Web fallback (Tavily) — only when OE + RAG + Cito cannot cover the ask
//
// Always assumes the CURRENT day/split/year (from client_now → WORLD_CONTEXT) unless the
// dashboard filters or the message name another. Returns raw evidence; cross-verification
// and RAG write-back happen in Layer 3 (synthesis), keeping fetch and trust separate.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAnalystContext, mergeToolResults } from "../helpers/analystTools.ts";
import { chartMarkdownBlock, runTeamCompare } from "../helpers/teamCompare.ts";
import { runPlayerCompare } from "../helpers/playerCompare.ts";
import { runChampionMatchupLookup } from "../helpers/championMatchupTool.ts";
import { routeTools } from "../helpers/toolRouter.ts";
import { classifyIntent } from "../helpers/classify.ts";
import { sqlQuery, vectorSearch } from "../helpers/tools.ts";
import {
  formatSnippetsAsContext,
  searchTavilyMetaFirst,
  searchTavilySentiment,
  searchTavilyStatsFirst,
  searchTavilyWikiFirst,
  type TavilySearchIntent,
} from "../helpers/tavilySearch.ts";
import { fetchEsportsMarketOdds, isOddsQuestion } from "../helpers/kalshi.ts";
import {
  buildPredictionPacket,
  isMlAnalysisQuestion,
} from "../helpers/predictionPacket.ts";
import { isAgentIdentityAsk, isAgentGreetingOnly } from "../helpers/agentIdentity.ts";
import { isCareerQuestion, isPlayerChampionPerformanceAsk, isRosterDepthQuestion } from "../helpers/scope.ts";
import {
  isPlayerWorldsTitleQuestion,
  isWorldsHistoryQuestion,
  lookupWorldsHistory,
} from "../helpers/worldsHistory.ts";
import {
  buildCurrentWorldContext,
  formatMentionedRosterBlock,
  lookupPlayersInMessage,
} from "../helpers/currentContext.ts";
import type { Evidence, GuardrailResult, HistoryMessage, ResolvedFilters } from "./types.ts";
import type { UsageTracker } from "../helpers/usageTracker.ts";
import { detectAnalysisIntent } from "../helpers/prompts.ts";
import { parseDraftExtractionBlock } from "../helpers/draftTypes.ts";
import { fetchDraftAnalysisContext } from "../helpers/draftContextFetch.ts";
import { detectCitoIntent, fetchCitoContext, type CitoVerifiedFact } from "../helpers/citoSearch.ts";
import { hasSufficientKnowledge } from "../helpers/knowledgeCoverage.ts";

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
const STATS_HEAVY_HINTS =
  /\b(build|builds|item|items|rune|runes|skill order|pro build|pick rate|ban rate|pick.?ban|most picked|most banned|historical stats|career stats|stats page)\b/i;
const MATCHUP_META_HINTS =
  /\b(matchup|counter|good into|bad into|lane vs|patch meta|meta pick|tier list|win rate|wr%)\b/i;
const SUBJECTIVE_HINTS =
  /\b(clutch|goat|greatest|best player|best (?:mid|top|jungle|adc|support|laner)|of all time|all.?time|top 5|ever|legacy|hall of fame|debate|narrative|storyline)\b/i;

export function isSubjectiveDebate(message: string): boolean {
  return SUBJECTIVE_HINTS.test(message);
}

function oeSampleIsThin(matchStats: Record<string, unknown>): boolean {
  const keys = Object.keys(matchStats);
  if (!keys.length) return true;
  const blob = JSON.stringify(matchStats);
  if (/\"games\":\s*[0-4]\b/.test(blob)) return true;
  if (/\"gamesPlayed\":\s*[0-4]\b/.test(blob)) return true;
  if (/\"sampleSize\":\s*[0-9]\b/.test(blob)) return true;
  return false;
}

function detectWebSearchIntent(
  message: string,
  inheritedTopic: string | null,
  careerIntent: boolean,
  rosterDepthIntent: boolean,
  subjectiveIntent: boolean,
  matchStats: Record<string, unknown>,
): TavilySearchIntent {
  const text = `${message} ${inheritedTopic ?? ""}`;
  if (subjectiveIntent) return "subjective";
  if (careerIntent) return "career";
  if (rosterDepthIntent || ROSTER_WEB_HINTS.test(text)) return "roster";
  if (STATS_HEAVY_HINTS.test(text)) return "stats";
  if (PATCH_HINTS.test(text)) return "patch";
  if (TOURNAMENT_HINTS.test(text)) return "tournament";
  if (MATCHUP_META_HINTS.test(text) && oeSampleIsThin(matchStats)) return "matchup";
  if (MATCHUP_META_HINTS.test(text)) return "meta";
  return "general";
}

/** Build domain-targeted Tavily queries (not raw chat text). */
function buildTavilyQueries(
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
      if (/\b(worlds|world championship|finals mvp)\b/i.test(message)) {
        return [
          "League of Legends World Championship winners finals MVP list liquipedia",
          "Worlds season 8 2018 through 2025 champion finals MVP liquipedia leaguepedia",
        ];
      }
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
    case "stats":
      return webEntities.length
        ? webEntities.map((e) => `${e} League of Legends pro player stats gol.gg pick ban build`)
        : [`${baseQuery} League of Legends esports pro stats gol.gg pick ban build${scopeSuffix}`];
    case "matchup":
    case "meta":
      return [
        `${baseQuery} League of Legends champion matchup patch meta u.gg leagueofgraphs`,
        `${baseQuery} pro play pick rate gol.gg${scopeSuffix}`,
      ];
    case "patch":
      return [
        `${baseQuery} League of Legends patch notes liquipedia u.gg`,
        `League of Legends patch notes recent changes liquipedia leagueofgraphs`,
      ];
    case "tournament":
      return [
        `${baseQuery} League of Legends esports tournament format bracket liquipedia leaguepedia`,
        `${baseQuery} League of Legends esports schedule results liquipedia`,
      ];
    case "subjective":
      return webEntities.length
        ? webEntities.map((e) => `${e} League of Legends esports reddit GOAT clutch greatest debate`)
        : [`${baseQuery} League of Legends esports reddit community GOAT clutch greatest debate`];
    default:
      return [`${baseQuery} League of Legends esports liquipedia leaguepedia`];
  }
}

async function runIntentSearch(
  tavilyApiKey: string,
  intent: TavilySearchIntent,
  query: string,
): Promise<import("../helpers/tavilySearch.ts").TavilyResult[]> {
  switch (intent) {
    case "stats":
      return searchTavilyStatsFirst(tavilyApiKey, query, { maxResults: 6 });
    case "matchup":
    case "meta":
    case "patch":
      return searchTavilyMetaFirst(tavilyApiKey, query, { maxResults: 6 });
    default:
      return searchTavilyWikiFirst(tavilyApiKey, query, { maxResults: 6 });
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

export interface DecideDeps {
  serviceClient: SupabaseClient;
  openrouterApiKey: string;
  tavilyApiKey: string;
  citoApiKey: string;
  kalshiApiKey?: string;
  message: string;
  history: HistoryMessage[];
  guardrail: GuardrailResult;
  filters: ResolvedFilters;
  clientNow?: string;
  usageTracker?: UsageTracker;
}

export async function decideAndFetch(deps: DecideDeps): Promise<Evidence> {
  const { serviceClient, openrouterApiKey, tavilyApiKey, citoApiKey, message, history, guardrail, filters, usageTracker } =
    deps;
  const { scope, thread, queryForTools } = guardrail;

  // --- Current-day grounding: WORLD_CONTEXT defaults to "now" unless filters override ---
  const currentCtx = await buildCurrentWorldContext(
    serviceClient,
    deps.clientNow,
    filters.rosterSplitHint,
  );
  const worldBlock = currentCtx.worldDataBlock;
  const worldRulesBlock = currentCtx.worldRulesBlock;
  let resolvedSplit = filters.split ?? currentCtx.split;

  const mentionedPlayers = lookupPlayersInMessage(
    thread.isFollowUp ? queryForTools : message,
    currentCtx.playerTeamIndex,
  );
  const mentionedRosterBlock = formatMentionedRosterBlock(mentionedPlayers);

  // --- Intent flags (career/roster are never answered from current-split OE stats) ---
  const inheritedCareer = thread.inheritedTopic ? isCareerQuestion(thread.inheritedTopic) : false;
  const curatedPlayerWorldsTitle = isPlayerWorldsTitleQuestion(message);
  // Curated player Worlds title table answers "how many worlds has X?" — do not
  // treat as open-ended career RAG (stale web often says Faker has 4).
  const identityIntent = isAgentIdentityAsk(message) || isAgentGreetingOnly(message);

  const careerIntent =
    (isCareerQuestion(message) || (thread.isFollowUp && inheritedCareer)) &&
    !curatedPlayerWorldsTitle;
  const rosterDepthIntent =
    isRosterDepthQuestion(message) || thread.followUpType === "roster_follow_up";
  const subjectiveIntent = isSubjectiveDebate(message) ||
    (thread.isFollowUp && thread.inheritedTopic ? isSubjectiveDebate(thread.inheritedTopic) : false);
  const playerChampionIntent =
    isPlayerChampionPerformanceAsk(message) ||
    (thread.isFollowUp && thread.inheritedTopic
      ? isPlayerChampionPerformanceAsk(thread.inheritedTopic)
      : false);
  const worldsHistoryIntent =
    isWorldsHistoryQuestion(message) ||
    (thread.isFollowUp && thread.inheritedTopic
      ? isWorldsHistoryQuestion(thread.inheritedTopic)
      : false);

  let runTools = scope.needs_tools && !careerIntent && !identityIntent;
  if (subjectiveIntent || playerChampionIntent || worldsHistoryIntent) runTools = true;
  if (thread.isClarification) runTools = true;
  if (identityIntent) runTools = false;
  const runRag = scope.needs_rag && !identityIntent;

  const sources = { oracleElixir: false, rag: false, cito: false, web: false, schedule: false, kalshi: false, sentiment: false, mlPrediction: false };
  let matchStats: Record<string, unknown> = {};
  let externalContext = "";
  let chartPrefix = "";
  let isCompare = false;
  let analystToolNames: string[] = [];
  let hasWebVerifiedChunk = false;

  const draftExtracted = parseDraftExtractionBlock(message);
  const draftAnalysisIntent = Boolean(draftExtracted);

  // ---- Text draft input: OE + RAG for parsed comp ----
  if (draftExtracted) {
    const draftCtx = await fetchDraftAnalysisContext(
      serviceClient,
      openrouterApiKey,
      draftExtracted,
      filters.league,
      filters.split,
      usageTracker,
    );
    matchStats = draftCtx.matchStats;
    externalContext = draftCtx.ragContext +
      (externalContext ? `\n\n${externalContext}` : "");
    analystToolNames = ["draft_text_analysis"];
    sources.oracleElixir = true;
    if (draftCtx.ragContext.trim()) sources.rag = true;
    runTools = true;
  }

  // Verified Worlds winner / Finals MVP list (not in OE — curated historical record).
  if (worldsHistoryIntent) {
    const worlds = lookupWorldsHistory(message);
    matchStats = { tools: [{ tool: worlds.tool, ...worlds.data }] };
    analystToolNames = [worlds.tool];
    sources.oracleElixir = true;
  }

  // ---- Source 1: Oracle's Elixir deterministic tools ----
  if (runTools && !worldsHistoryIntent && !draftAnalysisIntent) {
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

    // Compare charts — current user turn only (never inherited topic entities).
    const hasCompareIntent =
      /\b(compare|vs\.?|versus|radar|head.?to.?head|h2h)\b/i.test(message) ||
      (/\banaly[sz]e\b/i.test(message) && /\bvs\.?\b/i.test(message));
    const blockChart =
      identityIntent ||
      thread.followUpType === "roster_follow_up" ||
      isRosterDepthQuestion(message) ||
      isCareerQuestion(message);
    const wantsCompare =
      !blockChart && (scope.scope === "lolesports_compare" || hasCompareIntent);

    if (wantsCompare) {
      const compareQuery = message;
      const playerCompare = await runPlayerCompare(
        serviceClient,
        compareQuery,
        filters.league,
        filters.split,
      );
      const teamCompare = playerCompare
        ? null
        : await runTeamCompare(serviceClient, compareQuery, filters.league, filters.split);
      const compareResult = playerCompare ?? teamCompare;
      if (compareResult) {
        matchStats.compare = compareResult.data;
        isCompare = true;
        chartPrefix = `${compareResult.chartMarkdown || chartMarkdownBlock(compareResult.chart)}\n\n`;
        resolvedSplit = String(compareResult.data.split ?? resolvedSplit);
      }
    }

    // Champion H2H chart (Sylas vs Akali, etc.) — independent of team/player compare.
    const champMu = runChampionMatchupLookup(message);
    if (champMu) {
      matchStats.champion_matchup_h2h = champMu.data;
      if (champMu.chartMarkdown && !chartPrefix.trim()) {
        chartPrefix = `${champMu.chartMarkdown}\n\n`;
      } else if (champMu.chartMarkdown) {
        chartPrefix = `${chartPrefix}${champMu.chartMarkdown}\n\n`;
      }
      sources.oracleElixir = true;
    }
  }

  // ---- Intent plan (drives SQL/vector + final model choice) ----
  const route = routeTools(queryForTools, analystToolNames);
  const plan = await classifyIntent(openrouterApiKey, queryForTools, history, {
    needsTools: runTools,
    needsRag: runRag,
  }, usageTracker);

  if (plan.needs_sql && runTools && !isCompare && !route.skipSql) {
    const sql = await sqlQuery(serviceClient, openrouterApiKey, queryForTools, usageTracker);
    if (sql.ok) {
      matchStats.sql = sql.data;
      sources.oracleElixir = true;
    }
  }

  // ---- Source 2: RAG knowledge base (career/roster always vector-search) ----
  const forceVector = (careerIntent || rosterDepthIntent) && !curatedPlayerWorldsTitle;
  const factualScope = scope.scope !== "lolesports_chat";
  if (
    (runRag &&
      (plan.needs_vector ||
        forceVector ||
        /\b(favorite|favou?rite|odds|kalshi|prediction)\b/i.test(message))) ||
    forceVector ||
    (factualScope && !hasWebVerifiedChunk && !externalContext.trim())
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
    const vec = await vectorSearch(serviceClient, openrouterApiKey, queryForTools, {
      ...vectorRoute,
      usageTracker,
    });
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
    scope.scope === "lolesports_chat" && !runTools && !runRag && !externalContext &&
    !subjectiveIntent && !isOddsQuestion(message);

  // ---- Kalshi live odds (Layer 2 data source) ----
  let kalshiOddsBlock = "";
  let kalshiMarkets: import("../helpers/kalshi.ts").KalshiMarketQuote[] = [];
  if (isOddsQuestion(message) || scope.scope === "lolesports_general" && /\b(predict|favorite)\b/i.test(message)) {
    const kalshi = await fetchEsportsMarketOdds(message, deps.kalshiApiKey);
    kalshiOddsBlock = kalshi.block;
    kalshiMarkets = kalshi.markets;
    if (kalshi.markets.length) sources.kalshi = true;
  }

  // ---- ML prediction packet (Phase 3: prematch / draft / full) ----
  let predictionPacketBlock = "";
  let predictionPacket: import("../helpers/predictionPacket.ts").PredictionPacket | null = null;
  let predictionMode: import("../helpers/predictionPacket.ts").PredictionMode | null = null;
  if (isMlAnalysisQuestion(message) || draftAnalysisIntent) {
    const pred = await buildPredictionPacket({
      message,
      split: resolvedSplit,
      league: filters.league,
      draft: draftExtracted,
      kalshiMarkets,
      citoApiKey,
    });
    predictionPacketBlock = pred.block;
    predictionPacket = pred.packet;
    predictionMode = pred.packet?.mode ?? null;
    if (pred.packet) sources.mlPrediction = true;
  }

  const webSearchIntent = detectWebSearchIntent(
    message,
    thread.inheritedTopic,
    careerIntent,
    rosterDepthIntent,
    subjectiveIntent,
    matchStats,
  );
  const citoIntent = detectCitoIntent(message);

  // ---- Source 3: CitoAPI — structured fallback before Tavily ----
  let citoContext = "";
  let citoFacts: CitoVerifiedFact[] = [];
  const preCitoCoverage = hasSufficientKnowledge({
    chatOnly,
    scope: scope.scope,
    careerIntent,
    hasWebVerifiedChunk,
    matchStats,
    externalContext,
    citoContext: "",
    citoHit: false,
    webSearchIntent,
    citoIntent,
    subjectiveIntent,
  });

  if (citoApiKey && factualScope && !preCitoCoverage) {
    const cito = await fetchCitoContext(
      citoApiKey,
      queryForTools,
      citoIntent,
      filters.league,
    );
    citoContext = cito.context;
    citoFacts = cito.facts;
    if (cito.hit) {
      sources.cito = true;
      externalContext = citoContext +
        (externalContext ? `\n\n${externalContext}` : "");
    }
  }

  // ---- Source 4: Web fallback (Tavily) — last resort ----
  const sufficientKnowledge = hasSufficientKnowledge({
    chatOnly,
    scope: scope.scope,
    careerIntent,
    hasWebVerifiedChunk,
    matchStats,
    externalContext,
    citoContext,
    citoHit: sources.cito,
    webSearchIntent,
    citoIntent,
    subjectiveIntent,
  });

  const needWeb =
    Boolean(tavilyApiKey) &&
    !chatOnly &&
    scope.scope !== "lolesports_chat" &&
    (
      subjectiveIntent ||
      !sufficientKnowledge
    );

  let webSnippets: Evidence["webSnippets"] = [];
  let sentimentSnippets: Evidence["sentimentSnippets"] = [];
  let sentimentContext = "";
  let webFactQuery = "";
  let webEntities: string[] = [];

  if (needWeb) {
    webEntities = buildWebEntities(
      message,
      thread.inheritedTopic,
      mentionedPlayers,
      webSearchIntent === "subjective" ? "career" : webSearchIntent,
    );
    const queries = buildTavilyQueries(
      webSearchIntent,
      message,
      thread,
      webEntities,
      filters.league,
      resolvedSplit,
    ).slice(0, 4);

    webSnippets = (
      await Promise.all(
        queries.map((q) => runIntentSearch(tavilyApiKey, webSearchIntent, q)),
      )
    ).flat();

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

  if (subjectiveIntent && tavilyApiKey) {
    const sentimentQueries = buildTavilyQueries(
      "subjective",
      message,
      thread,
      buildWebEntities(message, thread.inheritedTopic, mentionedPlayers, "career"),
      filters.league,
      resolvedSplit,
    ).slice(0, 2);
    sentimentSnippets = (
      await Promise.all(sentimentQueries.map((q) => searchTavilySentiment(tavilyApiKey, q)))
    ).flat();
    const seenSent = new Set<string>();
    sentimentSnippets = sentimentSnippets
      .filter((s) => {
        if (seenSent.has(s.url)) return false;
        seenSent.add(s.url);
        return true;
      })
      .slice(0, 2);
    sentimentContext = formatSnippetsAsContext(sentimentSnippets, "community_sentiment", 220);
    if (sentimentSnippets.length) sources.sentiment = true;
  }

  const analysisIntent = draftAnalysisIntent
    ? "draft"
    : detectAnalysisIntent(
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
    subjectiveIntent,
    playerChampionIntent,
    worldsHistoryIntent,
    identityIntent,
    chatOnly,
    worldBlock,
    worldRulesBlock,
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
    sentimentSnippets,
    sentimentContext,
    kalshiOddsBlock,
    predictionPacketBlock,
    predictionPacket,
    predictionMode,
    draftAnalysisIntent,
    analysisIntent,
    resolvedSplit,
    league: filters.league,
    year: filters.year,
    citoContext,
    citoFacts,
    sources,
  };
}
