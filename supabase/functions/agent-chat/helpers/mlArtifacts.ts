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
import gprSnapshot from "../ml/gpr_snapshot.json" with { type: "json" };
import champRoleProfileRaw from "../ml/champ_role_profile.json" with { type: "json" };
import champScalingRaw from "../ml/champ_scaling.json" with { type: "json" };
import championArchetypesRaw from "../ml/champion_archetypes.json" with { type: "json" };

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
  clutchFactor?: {
    gd15Threshold: number;
    leadGames?: number;
    blownLeadGames?: number;
    blownLeadRate?: number;
    blownLeadVsLeague?: number;
    deficitGames?: number;
    comebackGames?: number;
    comebackRate?: number;
    comebackVsLeague?: number;
    notes?: Array<{ kind: string; favorable: boolean; label: string }>;
  } | null;
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

export type GprTeamEntry = {
  rank: number;
  previousRank?: number | null;
  rankChange?: number | null;
  gprScore: number;
  elo: number;
  avgOpponentGpr?: number | null;
  league?: string | null;
  matchRecord?: { wins: number; losses: number } | null;
  gameRecord?: { wins: number; losses: number } | null;
};

export type GprSnapshot = {
  generatedAt?: string;
  source?: string;
  teams?: Record<string, GprTeamEntry>;
  leagues?: Record<string, { avgGprScore: number; teams: number; maxGprScore: number }>;
};

/** Official lolesports Global Power Rankings, mirrored live via CitoAPI. Primary team-strength signal. */
export function getGprSnapshot(): GprSnapshot {
  return gprSnapshot as GprSnapshot;
}

export function gprForTeam(team: string): GprTeamEntry | null {
  return getGprSnapshot().teams?.[team] ?? null;
}

export function gprForLeague(league: string): { avgGprScore: number; teams: number; maxGprScore: number } | null {
  return getGprSnapshot().leagues?.[league.toUpperCase()] ?? null;
}

/**
 * Team-strength rating for the SOS/region blend. Prefers official lolesports GPR
 * (`elo` field — CitoAPI direct mirror, already encodes Riot's own context-of-play /
 * recent-performance / strength-of-opponent methodology). Falls back to our
 * walk-forward region Elo (`region_strength.json`) for teams GPR doesn't cover
 * (e.g. wildcard/academy squads outside the ~50 tracked orgs).
 */
export function teamStrengthRating(team: string): number | null {
  const gpr = gprForTeam(team);
  if (gpr) return gpr.elo;
  const snap = getRegionStrength();
  const entry = snap.teams?.[team];
  return entry?.rating ?? null;
}

/** True when both teams' ratings came from the same source (avoids mixing GPR + home-grown Elo scales). */
export function teamStrengthSource(team: string): "gpr" | "region_elo" | null {
  if (gprForTeam(team)) return "gpr";
  const snap = getRegionStrength();
  if (snap.teams?.[team]) return "region_elo";
  return null;
}

export type ChampRoleEntry = {
  totalGames: number;
  roles: Record<string, { games: number; share: number; winrate: number }>;
  recentRoles?: Record<string, { games: number; share: number; winrate: number }>;
  recentWindowDays?: number;
  primaryRole: string;
  recentPrimaryRole: string;
  roleShift: boolean;
};

/** Per-champion role/position distribution (season + last-45-day). Ground truth for
 * which lane a champion is actually being played in RIGHT NOW — prevents stale
 * training-era priors (e.g. "Camille is a top laner" when recent meta is support). */
export function getChampRoleProfile(): Record<string, ChampRoleEntry> {
  return champRoleProfileRaw as Record<string, ChampRoleEntry>;
}

export function champRoleFor(champion: string): ChampRoleEntry | null {
  return getChampRoleProfile()[champion] ?? null;
}

export type ChampScalingEntry = {
  role: string;
  games: number;
  avgGd15?: number | null;
  avgCsd15?: number | null;
  vsRoleMedianGd15?: number | null;
  laneBully: boolean;
  weakSide: boolean;
  avgDpm?: number | null;
  dpmByDuration: Record<string, number>;
  scalingIndex?: number | null;
  scalingPercentileInRole?: number | null;
  lateGameScaler: boolean;
  frontLoaded: boolean;
};

/** Empirical per-champion lane-strength (GD@15 vs role median — reliable) + late-game
 * DPM-scaling signal (role-relative percentile — noisier, treat as supporting evidence
 * alongside the hand-curated archetype `scalingCurve`, not a standalone authority). */
export function getChampScaling(): Record<string, ChampScalingEntry> {
  return champScalingRaw as Record<string, ChampScalingEntry>;
}

export function champScalingFor(champion: string): ChampScalingEntry | null {
  return getChampScaling()[champion] ?? null;
}

export type ChampionArchetype = {
  primaryRoles: string[];
  damageType: string;
  range: string;
  tags: string[];
  compArchetypes: string[];
  scalingCurve: string;
  notes?: string;
};

/** Hand-curated champion style/archetype tags (static — see scripts/ml/static/champion_archetypes.json). */
export function getChampionArchetypes(): Record<string, ChampionArchetype> {
  return championArchetypesRaw as unknown as Record<string, ChampionArchetype>;
}

export function archetypeFor(champion: string): ChampionArchetype | null {
  return getChampionArchetypes()[champion] ?? null;
}

export function currentPatchBucket(): string {
  const d = new Date();
  const major = d.getFullYear() >= 2026 ? 16 : 15;
  const minor = Math.min(4, Math.max(1, Math.ceil((d.getMonth() + 1) / 3)));
  return `${major}.${minor}`;
}
