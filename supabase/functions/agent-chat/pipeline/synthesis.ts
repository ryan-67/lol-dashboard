// Layer 3 — Synthesis.
//
// Takes the raw evidence from the Tool Decider and:
//   1. Cross-verifies web snippets into trusted facts (2+ allowlisted sources agree, or
//      one authoritative Liquipedia/Leaguepedia line) → [WEB_VERIFIED] block.
//   2. Generates the final grounded response — for matchup/draft asks, merges OE stats
//      with actual game knowledge (synergies, win conditions, macro) via DEEP_ANALYSIS blocks.
//   3. After the response streams, pushes newly verified facts into pgvector reliably
//      (retries + upsert dedupe; failures logged, never break the user-facing stream).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chatOnlyMessages,
  detectAnalysisIntent,
  finalMessages,
} from "../helpers/prompts.ts";
import { streamFinalAnswer } from "../helpers/stream.ts";
import { pickFinalModel } from "../helpers/classify.ts";
import { extractCandidateFacts, verifyFact, type VerifiedFact } from "../helpers/factVerifier.ts";
import { writeBackVerifiedFacts } from "../helpers/ragWriteback.ts";
import { rankWikiSnippets } from "../helpers/tavilySearch.ts";
import type { Evidence, HistoryMessage, SynthesisResult } from "./types.ts";

export interface SynthesisDeps {
  serviceClient: SupabaseClient;
  openrouterApiKey: string;
  message: string;
  history: HistoryMessage[];
  evidence: Evidence;
  /** chart block already streamed by the orchestrator; included for persisted text. */
  chartPrefix: string;
  writer: WritableStreamDefaultWriter<Uint8Array>;
}

/** Cross-verify raw web snippets; prefer wiki-domain sources for fact extraction. */
async function crossVerify(
  apiKey: string,
  evidence: Evidence,
): Promise<{ block: string; verified: VerifiedFact[] }> {
  if (!evidence.webSnippets.length) return { block: "", verified: [] };

  const rankedSnippets = rankWikiSnippets(evidence.webSnippets);
  const candidates = await extractCandidateFacts(
    apiKey,
    rankedSnippets,
    evidence.webFactQuery,
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

/** Resolve analysis mode — tool decider hint, or re-detect from message + stats. */
function resolveAnalysisIntent(evidence: Evidence, message: string) {
  return evidence.analysisIntent ??
    detectAnalysisIntent(message, evidence.scope.scope, Object.keys(evidence.matchStats).length > 0);
}

export async function synthesize(deps: SynthesisDeps): Promise<SynthesisResult> {
  const { serviceClient, openrouterApiKey, message, history, evidence, chartPrefix, writer } = deps;

  // 1. Cross-verification of wiki-targeted web data.
  const { block: webVerifiedBlock, verified } = await crossVerify(openrouterApiKey, evidence);
  const analysisIntent = resolveAnalysisIntent(evidence, message);

  // 2. Assemble grounded prompt + generate (deep analysis blocks for matchup/draft/macro).
  const finalModel = pickFinalModel(evidence.plan);
  const messages = evidence.chatOnly
    ? chatOnlyMessages(history, message, evidence.worldBlock, evidence.mentionedRosterBlock, analysisIntent)
    : finalMessages(history, message, evidence.matchStats, evidence.externalContext, {
        league: evidence.league,
        split: evidence.resolvedSplit,
        year: evidence.year,
        hasCompare: evidence.isCompare,
        worldBlock: evidence.worldBlock,
        scope: evidence.scope.scope,
        isFollowUp: evidence.thread.isFollowUp,
        followUpType: evidence.thread.followUpType,
        hasMatchStats: Object.keys(evidence.matchStats).length > 0,
        mentionedRosterBlock: evidence.mentionedRosterBlock,
        webVerified: webVerifiedBlock,
        careerIntent: evidence.careerIntent,
        analysisIntent,
      });

  const answer = await streamFinalAnswer({
    apiKey: openrouterApiKey,
    model: finalModel,
    messages,
    plan: evidence.plan,
    writer,
  });

  let assistantText = chartPrefix + answer;
  if (!assistantText.trim()) {
    assistantText = "couldn't get a clean read on that — try again or narrow the league/split.";
  }

  // 3. Compound pgvector RAG after the user sees the full streamed response.
  if (verified.length) {
    await writeBackVerifiedFacts(
      serviceClient,
      openrouterApiKey,
      evidence.resolvedSplit,
      verified,
    );
  }

  return { assistantText };
}
