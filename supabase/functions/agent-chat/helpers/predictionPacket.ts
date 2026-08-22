/**
 * Phase 3 — ML prediction packet builder for nuckyAI chat.
 *
 * Modes:
 *   prematch — team vs team, no draft (optional Kalshi comparison)
 *   draft    — comp vs comp, no team names (3b)
 *   full     — team + draft combined (3c)
 */

import type { DraftChampionPick, DraftExtraction } from "./draftTypes.ts";
import type { KalshiMarketQuote } from "./kalshi.ts";
import { pickMatchupKalshiEdge } from "./kalshi.ts";
import {
  archetypeFor,
  champRoleFor,
  champScalingFor,
  currentPatchBucket,
  directChampionMatchup,
  getChampMeta,
  getDraftSynergy,
  getInferenceBundle,
  getPlayerChampRatings,
  getTeamAliases,
  getTeamFormSnapshot,
  getTeamProfile,
  gprForTeam,
  playerPowerForTeam,
  teamStrengthRating,
  type TeamProfile,
} from "./mlArtifacts.ts";
import { estimateConfidence, scorePrematch } from "./linearScorer.ts";
import {
  keyLaneMatchups,
  lastMeetingFromWarehouse,
  seasonRecordsFromWarehouse,
  standingsNoteFromRecords,
  type WarehouseSeriesRow,
} from "./warehouseFacts.ts";
import { teamsAreSame } from "./teamIdentity.ts";

export type PredictionMode = "prematch" | "draft" | "full" | "team_profile";

export interface TeamProfileSummary {
  team: string;
  playstyle: string;
  focusMode?: string;
  skirmishNote?: string | null;
  earlyFocusRoles: string[];
  roleEarlyKa15: Record<string, number>;
  roleEarlyKp15?: Record<string, number>;
  recentFormSummary?: string;
  recentFormScore?: number;
  recentFormMomentum?: string;
  homeRegion?: string;
  statDeviations?: string[];
  strengths: string[];
  weaknesses: string[];
  playerWinConditions: string[];
  winPatterns: string[];
  lossPatterns: string[];
  roster: Record<string, string>;
  /** Per-player current priority champs (recent-window aware) — "role: player — champ (Ng, WR%), ..." */
  priorityChampions?: string[];
}

export interface DraftEdge {
  champion: string;
  edge: number;
  winrate?: number;
  side?: "A" | "B";
  /** Grounded role/meta-shift fact, e.g. "recently played SUPPORT (69% of last 45d), not TOP". */
  roleNote?: string;
  /** Grounded empirical lane-strength / scaling fact from champ_scaling.json. */
  styleNote?: string;
  /** Hand-curated archetype tags (engage, poke, dive, scaling_carry, ...). */
  archetypeTags?: string[];
}

export interface CompStyleSummary {
  side: "A" | "B";
  team: string;
  topTags: string[];
  compArchetypes: string[];
  identityLabel: string;
}

export interface KalshiEdgeInfo {
  ticker: string;
  title: string;
  impliedYesPercent: number;
  modelProbPercent: number;
  edgePp: number;
}

export interface DirectMatchupEvidence {
  role: string;
  championA: string;
  championB: string;
  games: number;
  winrateA: number;
  avgGd15DeltaA?: number | null;
  /** Reliability-shrunk edge used by draft scoring, in percentage points. */
  adjustedEdgePp: number;
}

export interface PlayerPowerSummary {
  role: string;
  player: string;
  rank: number;
  powerScore: number;
  games: number;
}

export interface PredictionPacket {
  mode: PredictionMode;
  teamA: string;
  teamB: string;
  patchBucket: string;
  winProbA: number;
  winProbB: number;
  confidence: number;
  drivers: string[];
  risks: string[];
  trends: Array<{ label: string; favorable: boolean; lift?: number }>;
  teamProfiles?: { teamA: TeamProfileSummary; teamB?: TeamProfileSummary };
  draftEdges?: DraftEdge[];
  directMatchups?: DirectMatchupEvidence[];
  compStyles?: CompStyleSummary[];
  kalshiEdge?: KalshiEdgeInfo;
  playerChampionNotes?: Array<{ player: string; champion: string; note: string }>;
  playerPower?: { teamA: PlayerPowerSummary[]; teamB?: PlayerPowerSummary[] };
  modelAsOf?: string;
  currentRecords?: Array<{
    team: string;
    seriesWins: number;
    seriesLosses: number;
    gameWins: number;
    gameLosses: number;
  }>;
  lastMeeting?: { date: string; score: string; winner: string; teamA: string; teamB: string };
  standingsNote?: string;
  keyMatchups?: string[];
  recentResultNote?: string;
}

const PREDICTION_HINTS =
  /\b(who wins|who's gonna win|who is gonna win|predict(?:ion)?|pre-?match|matchup preview|series pick|who takes (?:it|the series)|favou?red|favorite to win|model says|break(?:ing)? down (?:the )?matchup|edge vs|win probability)\b/i;

const TEAM_ANALYSIS_HINTS =
  /\b(play around|playstyle|play style|early game|win when|wins when|loses when|lose when|tends to|look out for|strengths?|weaknesses?|style|skirmish|lane prio|who do they (?:play|focus)|what lanes?|early skirmish|snowball|scaling team|win condition|how does .+ play)\b/i;

const TEAM_TOKENS =
  /\b(T1|Gen\.?G|G2|DK|DRX|HLE|Hanwha|KT|BLG|Bilibili|TES|Top Esports|JDG|WBG|C9|Cloud9|TL|Liquid|FNC|Fnatic|100T|100 Thieves|FlyQuest|NRG|LYON|Secret Whales|FURIA|DCG|GiantX|Movistar|KOI|Dplus|Rogue|Vitality|SK Gaming|Team Heretics|PSG|GAM|VKS|CTBC|FOX|FearX|BNK|DN Freecs|Nongshim|BRO|OK\s*Savingsbank|Ultra Prime|Invictus|Weibo|LNG|EDG|RNG|LGD|TT|NIP|Anyone['']s Legend|Top Esports|Weibo Gaming)\b/gi;

const TEAM_ALIASES: Record<string, string> = {
  t1: "T1",
  "gen.g": "Gen.G",
  geng: "Gen.G",
  hle: "Hanwha Life Esports",
  drx: "DRX",
  kt: "KT Rolster",
  dk: "Dplus Kia",
  g2: "G2 Esports",
  c9: "Cloud9",
  tl: "Team Liquid",
  fnc: "Fnatic",
  fnatic: "Fnatic",
  blg: "Bilibili Gaming",
  tes: "Top Esports",
  jdg: "JD Gaming",
  wbg: "Weibo Gaming",
  "100t": "100 Thieves",
};

function normTeam(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

let reverseAliasCache: Map<string, string[]> | null = null;

/** Real-world market titles (Kalshi, etc.) almost always use a team's short/common name
 * ("BLG", "HLE") rather than the full canonical org name ("Bilibili Gaming",
 * "Hanwha Life Esports") we resolve internally — matching on the canonical name alone
 * silently fails for most two-word teams. Builds canonical -> [known aliases] from the
 * same team_aliases.json used to resolve canonical names in the first place. */
function aliasesForCanonical(canonical: string): string[] {
  if (!reverseAliasCache) {
    reverseAliasCache = new Map();
    for (const [alias, canon] of Object.entries(getTeamAliases())) {
      const list = reverseAliasCache.get(canon) ?? [];
      list.push(alias);
      reverseAliasCache.set(canon, list);
    }
  }
  return reverseAliasCache.get(canonical) ?? [];
}

/** [canonical name, ...known short aliases] — pass to kalshi.ts matchers so live market
 * titles written in shorthand ("BLG vs HLE") still resolve to our resolved teams. */
function teamMarketVariants(team: string): string[] {
  const aliasHits = aliasesForCanonical(team);
  return [team, ...aliasHits];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word substring check. Plain `.includes()` on short aliases/tokens (e.g. "kt", "dk")
 * false-positives inside unrelated words — "viktor" contains "kt", which previously caused
 * a pasted LYON/TSW draft mentioning Viktor to hallucinate a "KT Rolster" matchup.
 */
function hasWholeWord(haystack: string, needle: string): boolean {
  if (!needle.trim()) return false;
  const re = new RegExp(`(?<![a-z0-9])${escapeRegex(needle.toLowerCase())}(?![a-z0-9])`, "i");
  return re.test(haystack);
}

export function isPredictionQuestion(message: string): boolean {
  return PREDICTION_HINTS.test(message);
}

/** Team playstyle / win-condition / strength-weakness analysis (uses same ML packet). */
export function isTeamAnalysisQuestion(message: string): boolean {
  return TEAM_ANALYSIS_HINTS.test(message) || isPredictionQuestion(message);
}

export function isMlAnalysisQuestion(message: string): boolean {
  return isTeamAnalysisQuestion(message);
}

const MIN_PRIORITY_CHAMP_GAMES = 3;

/** A player's current priority champs — recent-window (45d) games first, season-wide as
 * fallback, so we don't surface a champ they haven't touched in over a year. */
function topChampionsForPlayer(player: string, limit = 3): string[] {
  const ratings = getPlayerChampRatings()[player];
  if (!ratings) return [];
  const entries = Object.entries(ratings)
    .map(([champ, r]) => {
      const useRecent = (r.recentGames ?? 0) >= MIN_PRIORITY_CHAMP_GAMES;
      return {
        champ,
        games: useRecent ? r.recentGames! : r.games,
        winrate: useRecent ? r.recentWinrate ?? r.winrate : r.winrate,
        sortKey: (useRecent ? r.recentGames! * 100 : r.games) + (r.recentGames ?? 0),
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey);
  return entries.slice(0, limit).map((e) => `${e.champ} (${e.games}g, ${e.winrate}% WR)`);
}

function buildPriorityChampions(roster: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [role, player] of Object.entries(roster)) {
    if (!player) continue;
    const champs = topChampionsForPlayer(player);
    if (champs.length) out.push(`${role}: ${player} — ${champs.join(", ")}`);
  }
  return out;
}

function summarizeTeamProfile(team: string, profile: TeamProfile): TeamProfileSummary {
  return {
    team,
    playstyle: profile.playstyle.summary,
    focusMode: profile.playstyle.focusMode,
    skirmishNote: profile.playstyle.skirmishNote,
    earlyFocusRoles: profile.playstyle.earlyFocusRoles,
    roleEarlyKa15: profile.playstyle.roleEarlyKa15,
    roleEarlyKp15: profile.playstyle.roleEarlyKp15,
    recentFormSummary: profile.recentForm?.summary,
    recentFormScore: profile.recentForm?.recentFormScore,
    recentFormMomentum: profile.recentForm?.momentum,
    homeRegion: profile.homeRegion,
    statDeviations: profile.statDeviations?.map((d) => d.label),
    strengths: profile.strengths,
    weaknesses: profile.weaknesses,
    playerWinConditions: profile.playerWinConditions.map((p) => p.label),
    winPatterns: profile.winPatterns.map((p) => p.label),
    lossPatterns: profile.lossPatterns.map((p) => p.label),
    roster: profile.roster,
    priorityChampions: buildPriorityChampions(profile.roster ?? {}),
  };
}

function attachTeamProfiles(teamA: string, teamB?: string): PredictionPacket["teamProfiles"] {
  const profileA = getTeamProfile(teamA);
  if (!profileA) return undefined;
  const out: NonNullable<PredictionPacket["teamProfiles"]> = {
    teamA: summarizeTeamProfile(teamA, profileA),
  };
  if (teamB) {
    const profileB = getTeamProfile(teamB);
    if (profileB) out.teamB = summarizeTeamProfile(teamB, profileB);
  }
  return out;
}

export function resolveCanonicalTeam(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const aliases = getTeamAliases();
  const aliasHit = aliases[trimmed.toLowerCase()];
  if (aliasHit) return aliasHit;

  const snapshot = getTeamFormSnapshot();
  const keys = Object.keys(snapshot);
  const norm = normTeam(trimmed);
  const exact = keys.find((k) => normTeam(k) === norm);
  if (exact) return exact;

  const fuzzy = keys.filter((k) => {
    const n = normTeam(k);
    return n.includes(norm) || norm.includes(n);
  });
  if (fuzzy.length === 1) return fuzzy[0]!;
  if (fuzzy.length > 1) {
    return fuzzy.sort((a, b) => normTeam(a).length - normTeam(b).length)[0]!;
  }
  return trimmed;
}

export function extractTeamsFromMessage(message: string): [string, string] | null {
  const found = new Map<string, string>();

  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (hasWholeWord(message, alias)) {
      const resolved = resolveCanonicalTeam(canonical);
      if (resolved) found.set(resolved, resolved);
    }
  }

  for (const match of message.matchAll(TEAM_TOKENS)) {
    const resolved = resolveCanonicalTeam(match[0]!);
    if (resolved) found.set(resolved, resolved);
  }

  const snapshot = getTeamFormSnapshot();
  for (const team of Object.keys(snapshot)) {
    if (hasWholeWord(message, team)) {
      found.set(team, team);
    }
  }

  const teams = [...found.values()];
  if (teams.length >= 2) return [teams[0]!, teams[1]!];

  const vsMatch = message.match(/(.+?)\s+(?:vs\.?|v)\s+(.+)/i);
  if (vsMatch) {
    const a = resolveCanonicalTeam(vsMatch[1]!.trim());
    const b = resolveCanonicalTeam(vsMatch[2]!.trim());
    if (a && b && a !== b) return [a, b];
  }
  return null;
}

export function extractSingleTeamFromMessage(message: string): string | null {
  const pair = extractTeamsFromMessage(message);
  if (pair) return pair[0];
  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (hasWholeWord(message, alias)) {
      const resolved = resolveCanonicalTeam(canonical);
      if (resolved) return resolved;
    }
  }
  for (const match of message.matchAll(TEAM_TOKENS)) {
    const resolved = resolveCanonicalTeam(match[0]!);
    if (resolved) return resolved;
  }
  const snapshot = getTeamFormSnapshot();
  for (const team of Object.keys(snapshot)) {
    if (hasWholeWord(message, team)) return team;
  }
  return null;
}

function patchBucket(raw?: string): string {
  if (raw?.trim()) {
    const parts = raw.trim().split(".");
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  }
  return currentPatchBucket();
}

function driverLabels(): Record<string, string> {
  return getInferenceBundle().driverLabels ?? {};
}

function buildDrivers(contributions: Array<{ feature: string; contribution: number }>): string[] {
  const labels = driverLabels();
  return contributions.slice(0, 5).map((c) => {
    const label = labels[c.feature] ?? c.feature.replace(/_/g, " ");
    const dir = c.contribution > 0 ? "favors" : "hurts";
    return `${label} (${dir} ${Math.abs(c.contribution).toFixed(2)} logit)`;
  });
}

function buildRisks(winProb: number, confidence: number, mode: PredictionMode): string[] {
  const risks: string[] = [];
  if (confidence < 0.6) risks.push("Low model confidence — patch/sample coverage may be thin.");
  if (Math.abs(winProb - 0.5) < 0.08) risks.push("Near coin-flip — small draft/roster swings can flip outcome.");
  if (mode === "prematch") risks.push("Draft not included — comp mismatch can override form edge.");
  if (mode === "draft") risks.push("Team identity not included — same comp plays differently by roster.");
  return risks.slice(0, 3);
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/** Score-driving strength is always nucky's own walk-forward Elo. */
function strengthRatingFor(team: string): number | null {
  return teamStrengthRating(team);
}

function strengthWinProb(
  teamA: string,
  teamB: string,
  scale = 130,
): number | null {
  const ratingA = strengthRatingFor(teamA);
  const ratingB = strengthRatingFor(teamB);
  if (ratingA == null || ratingB == null) return null;
  return sigmoid((ratingA - ratingB) / scale);
}

function blendWithRecentForm(
  teamA: string,
  teamB: string,
  baseProbA: number,
): { probA: number; formProbA: number; formNotes: string[] } {
  const profA = getTeamProfile(teamA);
  const profB = getTeamProfile(teamB);
  const scoreA = profA?.recentForm?.recentFormScore ?? 0.5;
  const scoreB = profB?.recentForm?.recentFormScore ?? 0.5;
  const formProbA = scoreA / (scoreA + scoreB);
  const weight = 0.35;
  const probA = (1 - weight) * baseProbA + weight * formProbA;
  const formNotes: string[] = [];
  if (profA?.recentForm?.summary) formNotes.push(`${teamA}: ${profA.recentForm.summary}`);
  if (profB?.recentForm?.summary) formNotes.push(`${teamB}: ${profB.recentForm.summary}`);
  formNotes.push(
    `Quality-adjusted recent-form signal: ${teamA} ${Math.round(formProbA * 100)}% vs structural ${Math.round(baseProbA * 100)}%`,
  );
  return { probA, formProbA, formNotes };
}

function blendWithRegionStrength(
  teamA: string,
  teamB: string,
  structuralProbA: number,
  formProbA: number,
): { probA: number; notes: string[] } {
  const profA = getTeamProfile(teamA);
  const profB = getTeamProfile(teamB);
  const homeA = profA?.homeRegion;
  const homeB = profB?.homeRegion;
  const crossRegion = Boolean(homeA && homeB && homeA !== homeB);

  const scale = crossRegion ? 72 : 130;
  const strengthProbA = strengthWinProb(teamA, teamB, scale);
  if (strengthProbA == null) {
    return { probA: 0.65 * structuralProbA + 0.35 * formProbA, notes: [] };
  }

  const ratingA = strengthRatingFor(teamA)!;
  const ratingB = strengthRatingFor(teamB)!;

  // The blend is fully proprietary: walk-forward nucky Elo + trained structural model +
  // opponent-adjusted recent form. Official GPR remains available below as a comparison
  // note, but has zero weight in the probability.
  const wStrength = crossRegion ? 0.50 : 0.45;
  const wStruct = crossRegion ? 0.25 : 0.30;
  const wForm = 0.25;
  const probA = wStruct * structuralProbA + wForm * formProbA + wStrength * strengthProbA;

  const strengthLabel =
    `Nucky team/region Elo${crossRegion ? " (cross-region)" : ""}: ` +
    `${teamA} (${homeA ?? "?"}) ${ratingA.toFixed(0)} vs ${teamB} (${homeB ?? "?"}) ${ratingB.toFixed(0)} ` +
    `→ ${Math.round(strengthProbA * 100)}% ${teamA}`;

  const notes = [
    strengthLabel,
    `Nucky-only final blend (${Math.round(wStruct * 100)}% structural / ${Math.round(wForm * 100)}% quality-adjusted recent form / ${Math.round(wStrength * 100)}% team/region Elo): ${Math.round(probA * 100)}% ${teamA}`,
  ];
  const gprA = gprForTeam(teamA);
  const gprB = gprForTeam(teamB);
  if (gprA && gprB) {
    notes.push(
      `External GPR comparison only (0% model weight): ${teamA} #${gprA.rank} (${gprA.gprScore} pts) vs ` +
      `${teamB} #${gprB.rank} (${gprB.gprScore} pts)`,
    );
  }
  return { probA, notes };
}

function relevantTrends(
  patch: string,
  teamName?: string,
): Array<{ label: string; favorable: boolean; lift?: number }> {
  const out: Array<{ label: string; favorable: boolean; lift?: number }> = [];

  if (teamName) {
    const profile = getTeamProfile(teamName);
    if (profile) {
      for (const dev of profile.statDeviations?.slice(0, 2) ?? []) {
        out.push({ label: dev.label, favorable: dev.favorable, lift: dev.vsRegion });
      }
      for (const label of profile.playerWinConditions.slice(0, 2).map((p) => p.label)) {
        out.push({ label, favorable: true });
      }
      for (const p of profile.winPatterns.slice(0, 1)) {
        if (!p.generic) out.push({ label: p.label, favorable: true, lift: p.liftPp });
      }
      if (profile.recentForm?.summary) {
        out.push({
          label: profile.recentForm.summary,
          favorable: profile.recentForm.momentum !== "cold",
        });
      }
    }
  }

  return out.slice(0, 5);
}

/** Grounded role/scaling/archetype facts for one champion — prevents the LLM from
 * guessing a stale training-era role or scaling take when we have real data/curation. */
function championGroundingFacts(champ: string): {
  roleNote?: string;
  styleNote?: string;
  archetypeTags?: string[];
} {
  const out: { roleNote?: string; styleNote?: string; archetypeTags?: string[] } = {};

  const roleProfile = champRoleFor(champ);
  if (roleProfile?.roleShift) {
    const recentRole = roleProfile.recentPrimaryRole.toUpperCase();
    const recentShare = roleProfile.recentRoles?.[roleProfile.recentPrimaryRole]?.share;
    const seasonRole = roleProfile.primaryRole.toUpperCase();
    out.roleNote =
      `${champ} recent role shift: ${recentRole}${recentShare != null ? ` (${recentShare}% of last ${roleProfile.recentWindowDays}d)` : ""} ` +
      `— season-long primary role was ${seasonRole}. Use the recent role, not the traditional one.`;
  }

  const scaling = champScalingFor(champ);
  if (scaling) {
    const notes: string[] = [];
    if (scaling.laneBully) notes.push(`wins lane (GD@15 ${scaling.vsRoleMedianGd15! > 0 ? "+" : ""}${scaling.vsRoleMedianGd15} vs ${scaling.role} median)`);
    if (scaling.weakSide) notes.push(`typically weak-side/low-resource (GD@15 ${scaling.vsRoleMedianGd15} vs ${scaling.role} median)`);
    if (scaling.lateGameScaler) notes.push(`DPM climbs in long games (top scaling tercile among ${scaling.role}s)`);
    if (scaling.frontLoaded) notes.push(`front-loaded — DPM doesn't climb late (bottom scaling tercile among ${scaling.role}s)`);
    if (notes.length) out.styleNote = `${champ}: ${notes.join("; ")}`;
  }

  const archetype = archetypeFor(champ);
  if (archetype?.tags?.length) out.archetypeTags = archetype.tags;

  return out;
}

function summarizePlayerPower(team: string): PlayerPowerSummary[] {
  return playerPowerForTeam(team).map((entry) => ({
    role: entry.role,
    player: entry.player,
    rank: entry.rank,
    powerScore: entry.powerScore,
    games: entry.games,
  }));
}

function attachPlayerPower(
  teamA: string,
  teamB?: string,
): PredictionPacket["playerPower"] {
  const powerA = summarizePlayerPower(teamA);
  const powerB = teamB ? summarizePlayerPower(teamB) : [];
  if (!powerA.length && !powerB.length) return undefined;
  return {
    teamA: powerA,
    teamB: powerB.length ? powerB : undefined,
  };
}

const DRAFT_SLOT_ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

function roleForDraftChampion(pick: DraftChampionPick): string | null {
  const slotRole = DRAFT_SLOT_ROLES[pick.slot - 1];
  if (slotRole) return slotRole;
  const profile = champRoleFor(pick.name);
  return profile?.recentPrimaryRole ?? profile?.primaryRole ?? null;
}

function buildDirectMatchups(
  picksA: DraftChampionPick[],
  picksB: DraftChampionPick[],
): DirectMatchupEvidence[] {
  const byRoleA = new Map<string, string>();
  const byRoleB = new Map<string, string>();
  for (const pick of picksA) {
    const role = roleForDraftChampion(pick);
    if (role && !byRoleA.has(role)) byRoleA.set(role, pick.name);
  }
  for (const pick of picksB) {
    const role = roleForDraftChampion(pick);
    if (role && !byRoleB.has(role)) byRoleB.set(role, pick.name);
  }

  const out: DirectMatchupEvidence[] = [];
  for (const [role, championA] of byRoleA) {
    const championB = byRoleB.get(role);
    if (!championB) continue;
    const matchup = directChampionMatchup(role, championA, championB);
    if (!matchup) continue;
    // Shrink small samples toward 50%, then use only 35% of that empirical edge
    // in the draft probability. The artifact's minimum is six games; this keeps
    // sparse matchups informative without allowing them to dominate team context.
    const reliability = matchup.games / (matchup.games + 20);
    const adjustedEdgePp = Math.round((matchup.winrate - 50) * reliability * 0.35 * 10) / 10;
    out.push({
      role,
      championA,
      championB,
      games: matchup.games,
      winrateA: matchup.winrate,
      avgGd15DeltaA: matchup.avgGd15Delta,
      adjustedEdgePp,
    });
  }
  return out;
}

function applyDirectMatchups(baseProbA: number, matchups: DirectMatchupEvidence[]): number {
  if (!matchups.length) return baseProbA;
  const avgAdjustment = matchups.reduce((sum, entry) => sum + entry.adjustedEdgePp, 0) /
    matchups.length / 100;
  return Math.min(0.9, Math.max(0.1, baseProbA + avgAdjustment));
}

function scoreDraftPicks(picks: string[], patch: string): { strength: number; edges: DraftEdge[] } {
  const meta = getChampMeta();
  const synergy = getDraftSynergy();
  const bucket = meta[patch] ?? meta.global ?? {};
  const wrs: number[] = [];
  const edges: DraftEdge[] = [];

  for (const champ of picks) {
    const m = bucket[champ];
    const grounding = championGroundingFacts(champ);
    if (m) {
      const wr = m.winrate / 100;
      wrs.push(wr);
      edges.push({
        champion: champ,
        edge: Math.round((wr - 0.5) * 1000) / 1000,
        winrate: m.winrate,
        ...grounding,
      });
    } else if (grounding.roleNote || grounding.styleNote || grounding.archetypeTags) {
      // No meta pick/win-rate coverage on this patch, but still surface role/style
      // grounding so the LLM doesn't fall back to guessing from training memory.
      edges.push({ champion: champ, edge: 0, ...grounding });
    }
  }

  let strength = wrs.length ? wrs.reduce((a, b) => a + b, 0) / wrs.length : 0.5;
  const pickSet = new Set(picks);
  const synList = synergy[patch] ?? synergy.global ?? [];
  for (const s of synList) {
    if (pickSet.has(s.a) && pickSet.has(s.b)) {
      strength += (s.lift / 100) * 0.05;
    }
  }
  strength = Math.min(0.95, Math.max(0.05, strength));
  return { strength, edges };
}

const COMP_ARCHETYPE_LABELS: Record<string, string> = {
  engage_dive: "engage/dive",
  poke_siege: "poke/siege",
  protect_the_carry: "protect-the-carry",
  pick_comp: "pick",
  split_push: "split-push",
  scaling_teamfight: "scaling teamfight",
  wombo_combo: "wombo-combo teamfight",
};

function buildCompStyleSummary(side: "A" | "B", team: string, picks: string[]): CompStyleSummary | null {
  const tagCounts = new Map<string, number>();
  const archetypeCounts = new Map<string, number>();
  let tagged = 0;
  for (const champ of picks) {
    const arch = archetypeFor(champ);
    if (!arch) continue;
    tagged++;
    for (const tag of arch.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    for (const ca of arch.compArchetypes ?? []) archetypeCounts.set(ca, (archetypeCounts.get(ca) ?? 0) + 1);
  }
  if (!tagged) return null;

  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  const compArchetypes = [...archetypeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([ca]) => COMP_ARCHETYPE_LABELS[ca] ?? ca);

  const identityLabel = compArchetypes.length
    ? `${compArchetypes.join(" / ")} comp`
    : "mixed-identity comp";

  return { side, team, topTags, compArchetypes, identityLabel };
}

function playerChampionNotes(
  team: string,
  picks: string[],
  patch: string,
): Array<{ player: string; champion: string; note: string }> {
  const ratings = getPlayerChampRatings();
  const roster = getTeamProfile(team)?.roster ?? {};
  const rosterPlayers = new Set(Object.values(roster));
  const notes: Array<{ player: string; champion: string; note: string }> = [];
  for (const [player, champs] of Object.entries(ratings)) {
    if (rosterPlayers.size && !rosterPlayers.has(player)) continue;
    for (const pick of picks) {
      const entry = champs[pick];
      if (!entry || entry.games < 3) continue;
      const patchEntry = entry.byPatch?.[patch];
      const wr = patchEntry?.games && patchEntry.games >= 3 ? patchEntry.winrate : entry.winrate;
      const gd = patchEntry?.avgGd15 ?? entry.avgGd15;
      notes.push({
        player,
        champion: pick,
        note: `${player} on ${pick}: ${wr}% WR (${entry.games}g)${gd != null ? `, avg GD@15 ${gd}` : ""}`,
      });
    }
  }
  return notes.slice(0, 6);
}

function matchKalshiEdge(
  teamA: string,
  teamB: string,
  markets: KalshiMarketQuote[],
  modelProbA: number,
): KalshiEdgeInfo | undefined {
  const hit = pickMatchupKalshiEdge(teamMarketVariants(teamA), teamMarketVariants(teamB), markets, modelProbA);
  if (!hit) return undefined;
  return {
    ticker: hit.ticker,
    title: hit.title,
    impliedYesPercent: hit.impliedYesPercent,
    modelProbPercent: hit.modelProbPercent,
    edgePp: hit.edgePp,
  };
}

function detectMode(message: string, draft: DraftExtraction | null, teams: [string, string] | null): PredictionMode {
  if (draft?.teams?.length === 2 && teams) return "full";
  if (draft?.teams?.length === 2) return "draft";
  if (/\bdraft|comp|composition|champs?\b/i.test(message) && teams) return "full";
  if (/\bdraft|comp only|no teams\b/i.test(message)) return "draft";
  return "prematch";
}

export interface BuildPredictionOptions {
  message: string;
  patch?: string;
  split?: string;
  league?: string;
  draft?: DraftExtraction | null;
  kalshiMarkets?: KalshiMarketQuote[];
  /** Retained for caller compatibility. GPR may be fetched elsewhere as external context,
   * but it never changes nucky's model probability. */
  citoApiKey?: string;
  warehouseRows?: WarehouseSeriesRow[];
  clientNow?: string;
}

export async function buildPredictionPacket(opts: BuildPredictionOptions): Promise<{
  packet: PredictionPacket | null;
  block: string;
}> {
  const patch = patchBucket(opts.patch);
  const teams = extractTeamsFromMessage(opts.message);
  const mode = detectMode(opts.message, opts.draft ?? null, teams);

  if (mode === "draft" && opts.draft?.teams?.length === 2) {
    const [left, right] = opts.draft.teams;
    const picksA = left.champions.map((c) => c.name);
    const picksB = right.champions.map((c) => c.name);
    const scoreA = scoreDraftPicks(picksA, patch);
    const scoreB = scoreDraftPicks(picksB, patch);
    const total = scoreA.strength + scoreB.strength;
    const directMatchups = buildDirectMatchups(left.champions, right.champions);
    const baseDraftProbA = total > 0 ? scoreA.strength / total : 0.5;
    const winProbA = applyDirectMatchups(baseDraftProbA, directMatchups);
    const confidence = picksA.length >= 5 && picksB.length >= 5 ? 0.62 : 0.48;

    const leftTeam = resolveCanonicalTeam(left.team) ?? left.team;
    const rightTeam = resolveCanonicalTeam(right.team) ?? right.team;
    const teamProfiles = attachTeamProfiles(leftTeam, rightTeam);

    const packet: PredictionPacket = {
      mode: "draft",
      teamA: left.team || "Blue comp",
      teamB: right.team || "Red comp",
      patchBucket: patch,
      winProbA: Math.round(winProbA * 1000) / 1000,
      winProbB: Math.round((1 - winProbA) * 1000) / 1000,
      confidence,
      drivers: [
        `Left comp meta strength ${Math.round(scoreA.strength * 100)}% vs right ${Math.round(scoreB.strength * 100)}%`,
        ...directMatchups.slice(0, 2).map((m) =>
          `${m.role}: ${m.championA} ${m.winrateA}% WR vs ${m.championB} (${m.games} games)`
        ),
        ...scoreA.edges.slice(0, 2).map((e) => `${e.champion} ${e.winrate}% patch WR`),
      ].slice(0, 6),
      risks: buildRisks(winProbA, confidence, "draft"),
      trends: relevantTrends(patch, leftTeam),
      teamProfiles,
      playerPower: attachPlayerPower(leftTeam, rightTeam),
      draftEdges: [
        ...scoreA.edges.map((e) => ({ ...e, side: "A" as const })),
        ...scoreB.edges.map((e) => ({ ...e, side: "B" as const })),
      ],
      directMatchups,
      compStyles: [
        buildCompStyleSummary("A", left.team || "Blue comp", picksA),
        buildCompStyleSummary("B", right.team || "Red comp", picksB),
      ].filter((s): s is CompStyleSummary => s != null),
    };
    return { packet, block: formatPredictionBlock(packet) };
  }

  if (!teams) {
    const single = extractSingleTeamFromMessage(opts.message);
    const profile = single ? getTeamProfile(single) : null;
    if (single && profile) {
      const summary = summarizeTeamProfile(single, profile);
      const trends = [
        ...summary.winPatterns.slice(0, 2).map((label) => ({ label, favorable: true })),
        ...summary.lossPatterns.slice(0, 1).map((label) => ({ label, favorable: false })),
      ];
      const packet: PredictionPacket = {
        mode: "team_profile",
        teamA: single,
        teamB: "—",
        patchBucket: patch,
        winProbA: 0.5,
        winProbB: 0.5,
        confidence: 0.55,
        drivers: summary.strengths.slice(0, 3),
        risks: summary.weaknesses.slice(0, 2),
        trends,
        teamProfiles: { teamA: summary },
        playerPower: attachPlayerPower(single),
      };
      return { packet, block: formatPredictionBlock(packet) };
    }
    return { packet: null, block: "" };
  }

  const [teamA, teamB] = teams;
  const snapshot = getTeamFormSnapshot();
  const score = scorePrematch({
    teamA,
    teamB,
    patchBucket: patch,
    split: opts.split,
    league: opts.league ?? snapshot[teamA]?.league,
    region: snapshot[teamA]?.region,
  });

  if (!score) {
    return { packet: null, block: "" };
  }

  let winProbA = score.winProbA;
  let drivers = buildDrivers(score.featureContributions);
  const structuralProbA = winProbA;
  const formBlend = blendWithRecentForm(teamA, teamB, winProbA);

  const regionBlend = blendWithRegionStrength(teamA, teamB, structuralProbA, formBlend.formProbA);
  winProbA = regionBlend.notes.length ? regionBlend.probA : formBlend.probA;
  drivers = [...regionBlend.notes, ...formBlend.formNotes.slice(0, 1), ...drivers].slice(0, 6);

  let draftEdges: DraftEdge[] | undefined;
  let directMatchups: DirectMatchupEvidence[] | undefined;
  let compStyles: CompStyleSummary[] | undefined;
  let playerNotes: PredictionPacket["playerChampionNotes"];

  if (mode === "full" && opts.draft?.teams?.length === 2) {
    const [left, right] = opts.draft.teams;
    const picksA = left.champions.map((c) => c.name);
    const picksB = right.champions.map((c) => c.name);
    const scoreA = scoreDraftPicks(picksA, patch);
    const scoreB = scoreDraftPicks(picksB, patch);
    directMatchups = buildDirectMatchups(left.champions, right.champions);
    const baseDraftProbA = scoreA.strength / (scoreA.strength + scoreB.strength);
    const draftProbA = applyDirectMatchups(baseDraftProbA, directMatchups);
    winProbA = 0.65 * winProbA + 0.35 * draftProbA;
    draftEdges = [
      ...scoreA.edges.map((e) => ({ ...e, side: "A" as const })),
      ...scoreB.edges.map((e) => ({ ...e, side: "B" as const })),
    ];
    compStyles = [
      buildCompStyleSummary("A", teamA, picksA),
      buildCompStyleSummary("B", teamB, picksB),
    ].filter((s): s is CompStyleSummary => s != null);
    playerNotes = [
      ...playerChampionNotes(teamA, picksA, patch),
      ...playerChampionNotes(teamB, picksB, patch),
    ];
  }

  const confidence = estimateConfidence(teamA, teamB, winProbA);
  const teamProfiles = attachTeamProfiles(teamA, teamB);

  const packet: PredictionPacket = {
    mode,
    teamA,
    teamB,
    patchBucket: patch,
    winProbA: Math.round(winProbA * 1000) / 1000,
    winProbB: Math.round((1 - winProbA) * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
    drivers,
    risks: buildRisks(winProbA, confidence, mode),
    trends: [
      ...relevantTrends(patch, teamA),
      ...relevantTrends(patch, teamB),
    ].slice(0, 6),
    teamProfiles,
    playerPower: attachPlayerPower(teamA, teamB),
    draftEdges,
    directMatchups,
    compStyles,
    playerChampionNotes: playerNotes,
    kalshiEdge: opts.kalshiMarkets?.length
      ? matchKalshiEdge(teamA, teamB, opts.kalshiMarkets, winProbA)
      : undefined,
    modelAsOf: snapshot[teamA]?.as_of,
  };

  attachWarehouseMatchupFacts(packet, opts.warehouseRows, opts.clientNow, opts.league);
  return { packet, block: formatPredictionBlock(packet) };
}

export function attachWarehouseMatchupFacts(
  packet: PredictionPacket,
  rows?: WarehouseSeriesRow[],
  clientNow?: string,
  league?: string,
): void {
  if (!rows?.length || packet.teamB === "—") return;
  const year = Number((clientNow ?? new Date().toISOString()).slice(0, 4));
  const lg = league && league !== "All Tier 1" ? league : "LCK";
  const records = seasonRecordsFromWarehouse(rows, year, lg);
  const recA = records.find((r) => teamsAreSame(r.team, packet.teamA));
  const recB = records.find((r) => teamsAreSame(r.team, packet.teamB));
  packet.currentRecords = [recA, recB].filter((r): r is NonNullable<typeof r> => Boolean(r));
  const last = lastMeetingFromWarehouse(rows, packet.teamA, packet.teamB, lg);
  if (last) {
    packet.lastMeeting = {
      date: last.date,
      score: last.score,
      winner: last.winner,
      teamA: last.teamA,
      teamB: last.teamB,
    };
  }
  const standings = standingsNoteFromRecords(records, packet.teamA, packet.teamB);
  if (standings) packet.standingsNote = standings;
  const rosterA = packet.teamProfiles?.teamA?.roster;
  const rosterB = packet.teamProfiles?.teamB?.roster;
  packet.keyMatchups = keyLaneMatchups(packet.teamA, packet.teamB, rosterA, rosterB);
  const today = (clientNow ?? new Date().toISOString()).slice(0, 10);
  const yesterday = (() => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const recent = rows
    .map((r) => ({
      date: String(r.scheduled_at ?? "").slice(0, 10),
      a: String(r.team_a ?? ""),
      b: String(r.team_b ?? ""),
      winner: String(r.winner_team ?? ""),
      scoreA: Number(r.team_a_score ?? 0),
      scoreB: Number(r.team_b_score ?? 0),
    }))
    .filter((r) =>
      (r.date === today || r.date === yesterday) &&
      (teamsAreSame(r.a, packet.teamA) || teamsAreSame(r.b, packet.teamA) ||
        teamsAreSame(r.a, packet.teamB) || teamsAreSame(r.b, packet.teamB))
    );
  if (recent.length) {
    packet.recentResultNote = recent
      .map((r) => {
        const winner = r.winner || (r.scoreA > r.scoreB ? r.a : r.b);
        return `${r.date}: ${r.a} ${r.scoreA}-${r.scoreB} ${r.b} (winner ${winner}). Do NOT invert this result.`;
      })
      .join(" ");
  }
}

export function formatPredictionBlock(packet: PredictionPacket): string {
  const lines = [
    "[PREDICTION_PACKET]",
    `mode: ${packet.mode}`,
    `matchup: ${packet.teamA}${packet.teamB !== "—" ? ` vs ${packet.teamB}` : ""}`,
    `patch: ${packet.patchBucket}`,
  ];
  if (packet.mode !== "team_profile") {
    lines.push(
      `P(${packet.teamA} wins): ${(packet.winProbA * 100).toFixed(1)}%`,
      `P(${packet.teamB} wins): ${(packet.winProbB * 100).toFixed(1)}%`,
      `confidence: ${(packet.confidence * 100).toFixed(0)}%`,
    );
  } else {
    lines.push("analysis: team_profile (no head-to-head win probability)");
  }
  if (packet.modelAsOf) lines.push(`model_as_of: ${packet.modelAsOf}`);
  if (packet.currentRecords?.length) {
    lines.push(
      "current_records (warehouse THIS season — do NOT cite stale snapshot game tables like 17 vs 19):",
    );
    for (const r of packet.currentRecords) {
      lines.push(
        `  - ${r.team}: series ${r.seriesWins}-${r.seriesLosses}, games ${r.gameWins}-${r.gameLosses}`,
      );
    }
  }
  if (packet.lastMeeting) {
    const m = packet.lastMeeting;
    lines.push(
      `last_meeting: ${m.date} ${m.teamA} vs ${m.teamB} ${m.score} (winner ${m.winner})`,
    );
  }
  if (packet.standingsNote) lines.push(`standings: ${packet.standingsNote}`);
  if (packet.keyMatchups?.length) {
    lines.push(`key_matchups: ${packet.keyMatchups.join("; ")} — lead with these, not only mid-lane stars`);
  }
  if (packet.recentResultNote) {
    lines.push(`recent_result: ${packet.recentResultNote}`);
  }
  if (packet.drivers.length) {
    lines.push("drivers:");
    for (const d of packet.drivers) lines.push(`  - ${d}`);
  }
  if (packet.risks.length) {
    lines.push("risks:");
    for (const r of packet.risks) lines.push(`  - ${r}`);
  }
  if (packet.trends.length) {
    lines.push("trends:");
    for (const t of packet.trends) {
      lines.push(`  - [${t.favorable ? "favorable" : "unfavorable"}] ${t.label}`);
    }
  }
  if (packet.teamProfiles?.teamA) {
    lines.push(formatTeamProfileBlock("team_a_profile", packet.teamProfiles.teamA));
  }
  if (packet.teamProfiles?.teamB) {
    lines.push(formatTeamProfileBlock("team_b_profile", packet.teamProfiles.teamB));
  }
  if (packet.playerPower?.teamA?.length || packet.playerPower?.teamB?.length) {
    lines.push("player_power:");
    for (const entry of packet.playerPower?.teamA ?? []) {
      lines.push(
        `  - A ${entry.role}: ${entry.player} #${entry.rank} ${entry.role} ` +
        `(power ${entry.powerScore >= 0 ? "+" : ""}${entry.powerScore.toFixed(3)}, ${entry.games} games)`,
      );
    }
    for (const entry of packet.playerPower?.teamB ?? []) {
      lines.push(
        `  - B ${entry.role}: ${entry.player} #${entry.rank} ${entry.role} ` +
        `(power ${entry.powerScore >= 0 ? "+" : ""}${entry.powerScore.toFixed(3)}, ${entry.games} games)`,
      );
    }
  }
  if (packet.compStyles?.length) {
    lines.push("comp_style:");
    for (const s of packet.compStyles) {
      lines.push(`  - ${s.side}: ${s.team} — ${s.identityLabel} (tags: ${s.topTags.join(", ")})`);
    }
  }
  if (packet.draftEdges?.length) {
    lines.push("draft_edges:");
    for (const e of packet.draftEdges.slice(0, 10)) {
      const parts = [`${e.side ? `${e.side}: ` : ""}${e.champion} edge ${e.edge}${e.winrate != null ? ` (${e.winrate}% WR)` : ""}`];
      if (e.archetypeTags?.length) parts.push(`[${e.archetypeTags.join(", ")}]`);
      lines.push(`  - ${parts.join(" ")}`);
      if (e.roleNote) lines.push(`      role_fact: ${e.roleNote}`);
      if (e.styleNote) lines.push(`      style_fact: ${e.styleNote}`);
    }
  }
  if (packet.directMatchups?.length) {
    lines.push("direct_matchups:");
    for (const matchup of packet.directMatchups) {
      const gd = matchup.avgGd15DeltaA == null
        ? ""
        : `, avg GD@15 ${matchup.avgGd15DeltaA >= 0 ? "+" : ""}${matchup.avgGd15DeltaA}`;
      lines.push(
        `  - ${matchup.role}: ${matchup.championA} vs ${matchup.championB} — ` +
        `${matchup.winrateA}% WR over ${matchup.games} games${gd}; ` +
        `reliability-adjusted draft edge ${matchup.adjustedEdgePp >= 0 ? "+" : ""}${matchup.adjustedEdgePp}pp for A`,
      );
    }
  }
  if (packet.playerChampionNotes?.length) {
    lines.push("player_champion:");
    for (const n of packet.playerChampionNotes) lines.push(`  - ${n.note}`);
  }
  if (packet.kalshiEdge) {
    const k = packet.kalshiEdge;
    lines.push(
      `kalshi_edge: market "${k.title}" implied ${k.impliedYesPercent}% vs model ${k.modelProbPercent}% (edge ${k.edgePp >= 0 ? "+" : ""}${k.edgePp}pp)`,
    );
  }
  return lines.join("\n");
}

function formatTeamProfileBlock(tag: string, profile: TeamProfileSummary): string {
  const lines = [
    `${tag}:`,
    `  team: ${profile.team}`,
    `  playstyle: ${profile.playstyle}`,
  ];
  if (profile.skirmishNote) lines.push(`  skirmish: ${profile.skirmishNote}`);
  if (profile.recentFormSummary) lines.push(`  recent_form: ${profile.recentFormSummary}`);
  if (profile.focusMode) lines.push(`  focus_mode: ${profile.focusMode}`);
  if (profile.earlyFocusRoles.length) {
    lines.push(`  early_focus_lanes: ${profile.earlyFocusRoles.join(", ")}`);
  }
  const ka = Object.entries(profile.roleEarlyKa15)
    .filter(([role]) => role !== "support" || profile.focusMode === "jungle_centric")
    .map(([role, v]) => `${role} K+A@15=${v}`)
    .join("; ");
  if (ka) lines.push(`  role_early_ka15: ${ka}`);
  if (profile.roleEarlyKp15 && Object.keys(profile.roleEarlyKp15).length) {
    const kp = Object.entries(profile.roleEarlyKp15)
      .filter(([role]) => ["top", "mid", "adc", "jungle"].includes(role))
      .map(([role, v]) => `${role} KP@15=${v}%`)
      .join("; ");
    if (kp) lines.push(`  role_early_kp15: ${kp}`);
  }
  if (profile.roster && Object.keys(profile.roster).length) {
    const rosterStr = Object.entries(profile.roster).map(([r, p]) => `${r}=${p}`).join(", ");
    lines.push(`  roster: ${rosterStr}`);
  }
  if (profile.priorityChampions?.length) {
    lines.push("  priority_champs:");
    for (const p of profile.priorityChampions) lines.push(`    - ${p}`);
  }
  if (profile.playerWinConditions.length) {
    lines.push("  player_win_conditions:");
    for (const p of profile.playerWinConditions.slice(0, 4)) lines.push(`    - ${p}`);
  }
  if (profile.strengths.length) {
    lines.push("  strengths:");
    for (const s of profile.strengths.slice(0, 4)) lines.push(`    - ${s}`);
  }
  if (profile.weaknesses.length) {
    lines.push("  weaknesses:");
    for (const w of profile.weaknesses.slice(0, 3)) lines.push(`    - ${w}`);
  }
  return lines.join("\n");
}

export async function fetchPredictionContext(
  message: string,
  opts: Omit<BuildPredictionOptions, "message"> & { kalshiMarkets?: KalshiMarketQuote[] },
): Promise<{ packet: PredictionPacket | null; block: string }> {
  if (!isMlAnalysisQuestion(message) && !opts.draft) {
    return { packet: null, block: "" };
  }
  return buildPredictionPacket({ message, ...opts });
}
