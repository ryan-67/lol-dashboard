// Layer 3 — Synthesis.
//
// Takes the raw evidence from the Tool Decider and:
//   1. Cross-verifies web snippets into trusted facts (wiki/stats sources) → [WEB_VERIFIED].
//   2. Generates grounded responses — DEEP_ANALYSIS + SUBJECTIVE_SYNTHESIS + KALSHI_ODDS blocks.
//   3. After streaming, writes verified facts to pgvector (never reddit/sentiment snippets).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chatOnlyMessages,
  detectAnalysisIntent,
  finalMessages,
} from "../helpers/prompts.ts";
import { isOddsQuestion } from "../helpers/kalshi.ts";
import { isMlAnalysisQuestion } from "../helpers/predictionPacket.ts";
import { streamFallback, streamFinalAnswer } from "../helpers/stream.ts";
import { pickFinalModel } from "../helpers/classify.ts";
import { extractCandidateFacts, verifyFact, type VerifiedFact } from "../helpers/factVerifier.ts";
import { writeBackVerifiedFacts, writeBackCitoFacts } from "../helpers/ragWriteback.ts";
import { isSentimentDomain, rankSnippets } from "../helpers/tavilySearch.ts";
import { shouldRefuseForeignEntity, foreignEntityRefusal } from "../helpers/entityGuard.ts";
import { sanitizeAssistantText } from "../helpers/responseSanitize.ts";
import type { Evidence, HistoryMessage, SynthesisResult } from "./types.ts";
import type { UsageTracker } from "../helpers/usageTracker.ts";

export interface SynthesisDeps {
  serviceClient: SupabaseClient;
  openrouterApiKey: string;
  message: string;
  history: HistoryMessage[];
  evidence: Evidence;
  chartPrefix: string;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  usageTracker?: UsageTracker;
}

/** Cross-verify factual web snippets; exclude reddit/sentiment from write-back. */
async function crossVerify(
  apiKey: string,
  evidence: Evidence,
  usageTracker?: UsageTracker,
): Promise<{ block: string; verified: VerifiedFact[] }> {
  const factSnippets = evidence.webSnippets.filter((s) => !isSentimentDomain(s.url));
  if (!factSnippets.length) return { block: "", verified: [] };

  const rankedSnippets = rankSnippets(factSnippets, "wiki");
  const candidates = await extractCandidateFacts(
    apiKey,
    rankedSnippets,
    evidence.webFactQuery,
    usageTracker,
  );
  const verified = candidates
    .map((c) => verifyFact(c, rankedSnippets))
    .filter((v) => v.verified);
  if (!verified.length) return { block: "", verified: [] };

  const lines = verified.map((v) => {
    const domains = v.sources
      .map((u) => {
        try {
          return new URL(u).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    const cite = domains.length ? ` [${[...new Set(domains)].join(", ")}]` : "";
    return `- ${v.fact}${cite}`;
  });
  return { block: lines.join("\n"), verified };
}

function resolveAnalysisIntent(evidence: Evidence, message: string) {
  return evidence.analysisIntent ??
    detectAnalysisIntent(message, evidence.scope.scope, Object.keys(evidence.matchStats).length > 0);
}

export async function synthesize(deps: SynthesisDeps): Promise<SynthesisResult> {
  const { serviceClient, openrouterApiKey, message, history, evidence, chartPrefix, writer, usageTracker } =
    deps;

  // Pre-generation guard: refuse foreign-game entities before stats synthesis.
  const foreignHit = shouldRefuseForeignEntity(message);
  if (foreignHit) {
    const refusal = foreignEntityRefusal(foreignHit);
    await streamFallback(writer, refusal);
    return { assistantText: chartPrefix + refusal };
  }

  const { block: webVerifiedBlock, verified } = await crossVerify(openrouterApiKey, evidence, usageTracker);
  const analysisIntent = resolveAnalysisIntent(evidence, message);

  const usedTavily = evidence.sources.web;
  const lowConfidenceWeb = usedTavily && verified.length === 0 && evidence.webSnippets.length > 0;

  const promptCtx = {
    league: evidence.league,
    split: evidence.resolvedSplit,
    year: evidence.year,
    hasCompare: evidence.isCompare,
    worldDataBlock: evidence.worldBlock,
    worldRulesBlock: evidence.worldRulesBlock,
    scope: evidence.scope.scope,
    isFollowUp: evidence.thread.isFollowUp,
    followUpType: evidence.thread.followUpType,
    isClarification: evidence.thread.isClarification,
    hasMatchStats: Object.keys(evidence.matchStats).length > 0,
    mentionedRosterBlock: evidence.mentionedRosterBlock,
    webVerified: webVerifiedBlock,
    citoContext: evidence.citoContext,
    lowConfidenceWeb,
    careerIntent: evidence.careerIntent,
    analysisIntent,
    subjectiveIntent: evidence.subjectiveIntent,
    playerChampionIntent: evidence.playerChampionIntent,
    worldsHistoryIntent: evidence.worldsHistoryIntent,
    draftAnalysisIntent: evidence.draftAnalysisIntent,
    sentimentContext: evidence.sentimentContext,
    kalshiOddsBlock: evidence.kalshiOddsBlock,
    predictionPacketBlock: evidence.predictionPacketBlock,
    isOddsQuestion: isOddsQuestion(message),
    isPredictionQuestion: isMlAnalysisQuestion(message) || Boolean(evidence.predictionPacket),
    predictionMode: evidence.predictionPacket?.mode ?? evidence.predictionMode,
    predictionTeamA: evidence.predictionPacket?.teamA,
    predictionTeamB: evidence.predictionPacket?.teamB,
    predictionHasKalshi: Boolean(evidence.predictionPacket?.kalshiEdge),
  };

  const finalModel = pickFinalModel(evidence.plan);
  const messages = evidence.chatOnly
    ? chatOnlyMessages(
      history,
      message,
      evidence.worldBlock,
      evidence.mentionedRosterBlock,
      analysisIntent,
      evidence.worldRulesBlock,
    )
    : finalMessages(history, message, evidence.matchStats, evidence.externalContext, promptCtx);

  const answer = await streamFinalAnswer({
    apiKey: openrouterApiKey,
    model: finalModel,
    messages,
    plan: evidence.plan,
    writer,
    maxTokens: evidence.subjectiveIntent ? 650 : 1000,
    frequencyPenalty: evidence.subjectiveIntent ? 0.5 : 0.3,
    usageTracker,
  });

  // Strip model-re-emitted chart fences from the streamed answer only; keep chartPrefix.
  const cleanedAnswer = sanitizeAssistantText(answer, {
    stripCharts: Boolean(chartPrefix.trim()),
  });
  let assistantText = sanitizeAssistantText(`${chartPrefix}${cleanedAnswer}`);
  if (!assistantText.trim()) {
    assistantText =
      "I couldn't determine an accurate answer for that — try narrowing the league, split, or rephrasing.";
  }

  if (evidence.citoFacts.length) {
    await writeBackCitoFacts(
      serviceClient,
      openrouterApiKey,
      evidence.resolvedSplit,
      evidence.citoFacts,
      usageTracker,
    );
  }

  if (verified.length) {
    await writeBackVerifiedFacts(
      serviceClient,
      openrouterApiKey,
      evidence.resolvedSplit,
      verified,
      usageTracker,
    );
  }

  return { assistantText };
}
