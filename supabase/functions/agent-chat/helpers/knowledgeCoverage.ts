/**
 * Decide whether OE + RAG (+ optional Cito) already cover a factual ask,
 * so Tavily is only used as a last resort.
 */

import type { TavilySearchIntent } from "./tavilySearch.ts";
import type { CitoSearchIntent } from "./citoSearch.ts";
import { citoCoversIntent } from "./citoSearch.ts";

function oeSampleIsThin(matchStats: Record<string, unknown>): boolean {
  const keys = Object.keys(matchStats);
  if (!keys.length) return true;
  const blob = JSON.stringify(matchStats);
  if (/\"games\":\s*[0-4]\b/.test(blob)) return true;
  if (/\"gamesPlayed\":\s*[0-4]\b/.test(blob)) return true;
  if (/\"sampleSize\":\s*[0-9]\b/.test(blob)) return true;
  return false;
}

function externalCoversIntent(intent: TavilySearchIntent, externalContext: string): boolean {
  const ctx = externalContext.toLowerCase();
  if (!ctx.trim()) return false;
  switch (intent) {
    case "career":
      return /web_verified/i.test(externalContext) ||
        /\b(mvp|award|title|championship|worlds|won \d|msi)\b/.test(ctx);
    case "roster":
      return /\b(roster|lineup|substitute|sub|joined|transferred|plays for)\b/.test(ctx);
    case "patch":
      return /\b(patch|nerf|buff|balance|changes)\b/.test(ctx);
    case "tournament":
      return /\b(bracket|format|groups|swiss|playoffs|qualif|seeding)\b/.test(ctx);
    case "stats":
      return /\b(kda|win rate|winrate|games|pick|ban|stats)\b/.test(ctx) && ctx.length > 100;
    default:
      return ctx.length > 120;
  }
}

export interface CoverageInput {
  chatOnly: boolean;
  scope: string;
  careerIntent: boolean;
  hasWebVerifiedChunk: boolean;
  matchStats: Record<string, unknown>;
  externalContext: string;
  citoContext: string;
  citoHit: boolean;
  webSearchIntent: TavilySearchIntent;
  citoIntent: CitoSearchIntent;
  subjectiveIntent: boolean;
}

/** True when tier-1 sources (OE/RAG/Cito) are enough — skip Tavily. */
export function hasSufficientKnowledge(input: CoverageInput): boolean {
  if (input.chatOnly || input.scope === "lolesports_chat") return true;
  if (input.subjectiveIntent) return false;

  const hasUsefulStats = Object.keys(input.matchStats).length > 0;
  const hasExternal = input.externalContext.trim().length > 0;
  const intent = input.webSearchIntent;
  const statsBlob = JSON.stringify(input.matchStats);
  if (/player_worlds_titles/.test(statsBlob)) return true;
  if (/"tool":"weekly_warehouse_recap"/.test(statsBlob) && /"completed":\s*\[\{/.test(statsBlob)) {
    return true;
  }
  if (/"tool":"warehouse_series_recap"/.test(statsBlob) && /"seriesScore":"[1-9]/.test(statsBlob)) {
    return true;
  }
  if (/"tool":"warehouse_season_facts"/.test(statsBlob) && /"seriesWinsA":[1-9]/.test(statsBlob)) {
    return true;
  }

  if (input.careerIntent && input.hasWebVerifiedChunk) return true;
  if (input.careerIntent && externalCoversIntent("career", input.externalContext)) return true;

  if (intent === "stats" || intent === "matchup" || intent === "meta") {
    if (hasUsefulStats && !oeSampleIsThin(input.matchStats)) return true;
  }

  if (externalCoversIntent(intent, input.externalContext)) return true;

  if (input.citoHit && citoCoversIntent(input.citoIntent, input.citoContext)) return true;

  if (hasUsefulStats && intent === "general" && !oeSampleIsThin(input.matchStats)) return true;

  if (hasExternal && hasUsefulStats) return true;

  return false;
}
