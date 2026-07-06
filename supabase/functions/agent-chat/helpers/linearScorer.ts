/** Logistic linear scorer — Deno-side inference from exported ML bundle. */

import {
  getInferenceBundle,
  getTeamFormSnapshot,
  getTeamInferenceState,
  getH2hLookup,
  type InferenceBundle,
} from "./mlArtifacts.ts";

export interface ScoreContext {
  teamA: string;
  teamB: string;
  patchBucket: string;
  split?: string;
  league?: string;
  region?: string;
}

export function statValue(
  feature: string,
  ctx: ScoreContext,
  bundle: InferenceBundle,
  teamStats: Record<string, number>,
  oppStats: Record<string, number>,
  seriesState: Record<string, unknown>,
  h2hWinrate: number | null,
): number {
  if (feature.startsWith("team_")) {
    const stat = feature.slice(5);
    if (stat === "h2h_winrate_decayed") {
      return h2hWinrate ?? bundle.medians[feature] ?? 0.5;
    }
    if (stat.startsWith("series_winrate") || stat.startsWith("side_winrate") ||
      stat === "rest_days" || stat === "roster_continuity") {
      const key = stat;
      const v = seriesState[key];
      if (typeof v === "number") return v;
    }
    const v = teamStats[stat];
    if (v != null) return v;
    return bundle.medians[feature] ?? 0;
  }
  if (feature.startsWith("opp_")) {
    const stat = feature.slice(4);
    const v = oppStats[stat];
    if (v != null) return v;
    return bundle.medians[feature] ?? 0;
  }
  if (feature.startsWith("diff_")) {
    const stat = feature.slice(5);
    const t = teamStats[stat];
    const o = oppStats[stat];
    if (t != null && o != null) return t - o;
    return bundle.medians[feature] ?? 0;
  }
  const catMap = bundle.categoricals[feature];
  if (catMap) {
    let raw = "";
    if (feature === "patch") raw = ctx.patchBucket;
    else if (feature === "split") raw = ctx.split ?? "unknown";
    else if (feature === "league") raw = ctx.league ?? "unknown";
    else if (feature === "region") raw = ctx.region ?? "unknown";
    else if (feature === "oe_year") raw = String(new Date().getFullYear());
    return catMap[raw] ?? catMap["unknown"] ?? -1;
  }
  return bundle.medians[feature] ?? 0;
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

export interface ScoreResult {
  winProbA: number;
  logit: number;
  featureContributions: Array<{ feature: string; value: number; weight: number; contribution: number }>;
}

export function scorePrematch(ctx: ScoreContext): ScoreResult | null {
  const bundle = getInferenceBundle();
  const snapshot = getTeamFormSnapshot();
  const inference = getTeamInferenceState();
  const h2h = getH2hLookup();

  const teamEntry = snapshot[ctx.teamA];
  const oppEntry = snapshot[ctx.teamB];
  if (!teamEntry || !oppEntry) return null;

  const teamStats = teamEntry.stats ?? {};
  const oppStats = oppEntry.stats ?? {};
  const seriesState = inference[ctx.teamA] ?? {};
  const h2hKey = `${ctx.teamA}|${ctx.teamB}`;
  const h2hWinrate = h2h[h2hKey]?.winrate ?? null;

  const league = ctx.league ?? teamEntry.league;
  const region = ctx.region ?? teamEntry.region;
  const enriched = { ...ctx, league, region };

  let logit = bundle.intercept;
  const contributions: ScoreResult["featureContributions"] = [];

  for (const feature of bundle.features) {
    let value = statValue(feature, enriched, bundle, teamStats, oppStats, seriesState, h2hWinrate);
    const mean = bundle.scalerMean?.[feature];
    const scale = bundle.scalerScale?.[feature];
    if (mean != null && scale != null && scale !== 0) {
      value = (value - mean) / scale;
    }
    const weight = bundle.weights[feature] ?? 0;
    const contribution = weight * value;
    logit += contribution;
    if (Math.abs(contribution) > 0.02) {
      contributions.push({ feature, value, weight, contribution });
    }
  }

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    winProbA: sigmoid(logit),
    logit,
    featureContributions: contributions.slice(0, 12),
  };
}

export function estimateConfidence(
  teamA: string,
  teamB: string,
  winProb: number,
): number {
  const snapshot = getTeamFormSnapshot();
  const a = snapshot[teamA];
  const b = snapshot[teamB];
  if (!a || !b) return 0.35;

  const statCountA = Object.keys(a.stats ?? {}).length;
  const statCountB = Object.keys(b.stats ?? {}).length;
  const coverage = Math.min(statCountA, statCountB) / 120;
  const decisiveness = Math.abs(winProb - 0.5) * 2;
  const raw = 0.45 + coverage * 0.35 + decisiveness * 0.2;
  return Math.min(0.92, Math.max(0.35, raw));
}
