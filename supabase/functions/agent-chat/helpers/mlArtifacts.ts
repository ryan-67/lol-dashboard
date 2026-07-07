/** Lazy-loaded ML artifact bundle for nuckyAI prediction packets (Phase 3). */

import featureSchema from "../ml/feature_schema.json" with { type: "json" };
import inferenceBundle from "../ml/inference_bundle.json" with { type: "json" };
import teamFormSnapshot from "../ml/team_form_snapshot.json" with { type: "json" };
import teamInferenceState from "../ml/team_inference_state.json" with { type: "json" };
import h2hLookup from "../ml/h2h_lookup.json" with { type: "json" };
import teamAliases from "../ml/team_aliases.json" with { type: "json" };
import champMeta from "../ml/champ_meta.json" with { type: "json" };
import draftSynergy from "../ml/draft_synergy.json" with { type: "json" };
import playerChampRatings from "../ml/player_champ_ratings.json" with { type: "json" };
import trendInsights from "../ml/trend_insights.json" with { type: "json" };
import teamProfiles from "../ml/team_profiles.json" with { type: "json" };
import regionStrength from "../ml/region_strength.json" with { type: "json" };
import modelMetadata from "../ml/model_metadata.json" with { type: "json" };

export type TeamFormEntry = {
  league: string;
  region?: string;
  as_of: string;
  stats: Record<string, number>;
};

export type InferenceBundle = {
  version: number;
  kind: string;
  intercept: number;
  features: string[];
  weights: Record<string, number>;
  medians: Record<string, number>;
  categoricals: Record<string, Record<string, number>>;
  driverLabels: Record<string, string>;
  scalerMean?: Record<string, number>;
  scalerScale?: Record<string, number>;
};

export type TrendInsight = {
  scope?: string;
  metric?: string;
  threshold?: number;
  direction?: string;
  games?: number;
  winrate?: number;
  baselineWinrate?: number;
  lift?: number;
  label: string;
  favorable?: boolean;
};

export type PlayerChampEntry = {
  games: number;
  winrate: number;
  avgGd15?: number | null;
  avgDmgShare?: number;
  avgDpm?: number;
  avgKp?: number;
  byPatch?: Record<string, { games: number; winrate: number; avgGd15?: number | null }>;
};

export function getFeatureSchema() {
  return featureSchema as { algo: string; features: string[] };
}

export function getInferenceBundle(): InferenceBundle {
  return inferenceBundle as InferenceBundle;
}

export function getTeamFormSnapshot(): Record<string, TeamFormEntry> {
  return teamFormSnapshot as Record<string, TeamFormEntry>;
}

export function getTeamInferenceState(): Record<string, Record<string, unknown>> {
  return teamInferenceState as Record<string, Record<string, unknown>>;
}

export function getH2hLookup(): Record<string, { winrate: number; games: number }> {
  return h2hLookup as Record<string, { winrate: number; games: number }>;
}

export function getTeamAliases(): Record<string, string> {
  return teamAliases as Record<string, string>;
}

export function getChampMeta(): Record<string, Record<string, {
  picks: number;
  wins: number;
  winrate: number;
  pickRate: number;
  banRate: number;
  presence: number;
}>> {
  return champMeta as Record<string, Record<string, {
    picks: number;
    wins: number;
    winrate: number;
    pickRate: number;
    banRate: number;
    presence: number;
  }>>;
}

export function getDraftSynergy(): Record<string, Array<{
  a: string;
  b: string;
  games: number;
  winrate: number;
  lift: number;
}>> {
  return draftSynergy as Record<string, Array<{
    a: string;
    b: string;
    games: number;
    winrate: number;
    lift: number;
  }>>;
}

export function getPlayerChampRatings(): Record<string, Record<string, PlayerChampEntry>> {
  return playerChampRatings as Record<string, Record<string, PlayerChampEntry>>;
}

export function getTrendInsights(): {
  generatedAt?: string;
  teamTrends?: { global?: TrendInsight[]; byPatch?: Record<string, TrendInsight[]> };
  championConditions?: Array<{
    patch: string;
    champion: string;
    games: number;
    winrate: number;
    lift: number;
    favorable: boolean;
    label: string;
  }>;
} {
  return trendInsights as {
    generatedAt?: string;
    teamTrends?: { global?: TrendInsight[]; byPatch?: Record<string, TrendInsight[]> };
    championConditions?: Array<{
      patch: string;
      champion: string;
      games: number;
      winrate: number;
      lift: number;
      favorable: boolean;
      label: string;
    }>;
  };
}

export type TeamProfile = {
  league: string;
  gamesAnalyzed: number;
  asOf: string;
  roster: Record<string, string>;
  playstyle: {
    earlyFocusRoles: string[];
    secondaryRoles: string[];
    roleEarlyKa15: Record<string, number>;
    roleEarlyKp15?: Record<string, number>;
    roleAvgGd15?: Record<string, number>;
    focusMode?: string;
    tempo: string;
    summary: string;
    skirmishNote?: string | null;
  };
  recentForm?: {
    recentFormScore: number;
    momentum: string;
    summary: string;
    series: Array<{ label: string; opponent: string; score: string; won: boolean }>;
  };
  playerWinConditions: Array<{
    player: string;
    role: string;
    aheadWinrate: number;
    behindWinrate: number;
    liftPp: number;
    favorableWhenAhead: boolean;
    label: string;
  }>;
  winPatterns: Array<{ label: string; liftPp?: number; favorable?: boolean; generic?: boolean }>;
  lossPatterns: Array<{ label: string; liftPp?: number; favorable?: boolean }>;
  strengths: string[];
  weaknesses: string[];
  homeRegion?: string;
  statDeviations?: Array<{
    stat: string;
    teamAvg: number;
    regionMedian: number;
    globalMedian: number;
    vsRegion: number;
    vsGlobal: number;
    favorable: boolean;
    label: string;
  }>;
};

export function getTeamProfiles(): Record<string, TeamProfile> {
  const raw = teamProfiles as { teams?: Record<string, TeamProfile> };
  return raw.teams ?? {};
}

export function getTeamProfile(team: string): TeamProfile | null {
  const profiles = getTeamProfiles();
  return profiles[team] ?? null;
}

export function getModelMetadata() {
  return modelMetadata as Record<string, unknown>;
}

export type RegionStrengthSnapshot = {
  generatedAt?: string;
  eloScale?: number;
  regions?: Record<string, number>;
  teams?: Record<string, { homeRegion: string; rating: number; regionRating: number }>;
  statBaselines?: Record<string, Record<string, number>>;
};

export function getRegionStrength(): RegionStrengthSnapshot {
  return regionStrength as RegionStrengthSnapshot;
}

export function teamStrengthRating(team: string): number | null {
  const snap = getRegionStrength();
  const entry = snap.teams?.[team];
  return entry?.rating ?? null;
}

export function currentPatchBucket(): string {
  const d = new Date();
  const major = d.getFullYear() >= 2026 ? 16 : 15;
  const minor = Math.min(4, Math.max(1, Math.ceil((d.getMonth() + 1) / 3)));
  return `${major}.${minor}`;
}
