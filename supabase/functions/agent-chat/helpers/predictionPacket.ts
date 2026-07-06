/**
 * Phase 3 — ML prediction packet builder for nuckyAI chat.
 *
 * Modes:
 *   prematch — team vs team, no draft (3a + Kalshi edge)
 *   draft    — comp vs comp, no team names (3b)
 *   full     — team + draft combined (3c)
 */

import type { DraftExtraction } from "./draftTypes.ts";
import type { KalshiMarketQuote } from "./kalshi.ts";
import {
  currentPatchBucket,
  getChampMeta,
  getDraftSynergy,
  getInferenceBundle,
  getPlayerChampRatings,
  getTeamAliases,
  getTeamFormSnapshot,
  getTeamProfile,
  getTrendInsights,
  type TeamProfile,
  type TrendInsight,
} from "./mlArtifacts.ts";
import { estimateConfidence, scorePrematch } from "./linearScorer.ts";

export type PredictionMode = "prematch" | "draft" | "full" | "team_profile";

export interface TeamProfileSummary {
  team: string;
  playstyle: string;
  skirmishNote?: string | null;
  earlyFocusRoles: string[];
  roleEarlyKa15: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  playerWinConditions: string[];
  winPatterns: string[];
  lossPatterns: string[];
  roster: Record<string, string>;
}

export interface DraftEdge {
  champion: string;
  edge: number;
  winrate?: number;
  side?: "A" | "B";
}

export interface KalshiEdgeInfo {
  ticker: string;
  title: string;
  impliedYesPercent: number;
  modelProbPercent: number;
  edgePp: number;
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
  kalshiEdge?: KalshiEdgeInfo;
  playerChampionNotes?: Array<{ player: string; champion: string; note: string }>;
  modelAsOf?: string;
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

function summarizeTeamProfile(team: string, profile: TeamProfile): TeamProfileSummary {
  return {
    team,
    playstyle: profile.playstyle.summary,
    skirmishNote: profile.playstyle.skirmishNote,
    earlyFocusRoles: profile.playstyle.earlyFocusRoles,
    roleEarlyKa15: profile.playstyle.roleEarlyKa15,
    strengths: profile.strengths,
    weaknesses: profile.weaknesses,
    playerWinConditions: profile.playerWinConditions.map((p) => p.label),
    winPatterns: profile.winPatterns.map((p) => p.label),
    lossPatterns: profile.lossPatterns.map((p) => p.label),
    roster: profile.roster,
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
  const lower = message.toLowerCase();
  const found = new Map<string, string>();

  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (lower.includes(alias)) {
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
    if (lower.includes(team.toLowerCase())) {
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
  const lower = message.toLowerCase();
  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (lower.includes(alias)) {
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
    if (lower.includes(team.toLowerCase())) return team;
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

function relevantTrends(
  patch: string,
  teamStats?: Record<string, number>,
  teamName?: string,
): Array<{ label: string; favorable: boolean; lift?: number }> {
  const insights = getTrendInsights();
  const global = insights.teamTrends?.global ?? [];
  const patchTrends = insights.teamTrends?.byPatch?.[patch] ?? [];
  const pool: TrendInsight[] = [...patchTrends, ...global];

  const out: Array<{ label: string; favorable: boolean; lift?: number }> = [];

  if (teamName) {
    const profile = getTeamProfile(teamName);
    if (profile) {
      for (const p of profile.winPatterns.slice(0, 2)) {
        out.push({ label: p.label, favorable: true, lift: p.liftPp });
      }
      for (const p of profile.lossPatterns.slice(0, 1)) {
        out.push({ label: p.label, favorable: false, lift: p.liftPp });
      }
    }
  }

  const gd15 = teamStats?.golddiffat15_last10 ?? teamStats?.golddiffat15_last20;

  for (const t of pool.slice(0, 8)) {
    if (out.length >= 4) break;
    if (t.metric === "gd15" && gd15 != null && t.threshold != null) {
      const matches =
        (t.direction === "above" && gd15 >= t.threshold) ||
        (t.direction === "below" && gd15 <= t.threshold);
      if (matches) {
        out.push({ label: t.label, favorable: Boolean(t.favorable), lift: t.lift });
      }
    } else if (out.length < 3) {
      out.push({ label: t.label, favorable: Boolean(t.favorable), lift: t.lift });
    }
  }
  return out.slice(0, 5);
}

function scoreDraftPicks(picks: string[], patch: string): { strength: number; edges: DraftEdge[] } {
  const meta = getChampMeta();
  const synergy = getDraftSynergy();
  const bucket = meta[patch] ?? meta.global ?? {};
  const wrs: number[] = [];
  const edges: DraftEdge[] = [];

  for (const champ of picks) {
    const m = bucket[champ];
    if (m) {
      const wr = m.winrate / 100;
      wrs.push(wr);
      edges.push({ champion: champ, edge: Math.round((wr - 0.5) * 1000) / 1000, winrate: m.winrate });
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
  markets: KalshiMarketQuote[],
  modelProbA: number,
): KalshiEdgeInfo | undefined {
  if (!markets.length) return undefined;
  const normA = normTeam(teamA);
  const hit = markets.find((m) => {
    const blob = `${m.title} ${m.subtitle}`.toLowerCase();
    return normTeam(blob).includes(normA) || blob.includes(teamA.toLowerCase());
  }) ?? markets[0];
  if (!hit?.yesPercent) return undefined;
  const implied = hit.yesPercent / 100;
  const model = modelProbA;
  return {
    ticker: hit.ticker,
    title: hit.title,
    impliedYesPercent: hit.yesPercent,
    modelProbPercent: Math.round(model * 1000) / 10,
    edgePp: Math.round((model - implied) * 1000) / 10,
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
}

export function buildPredictionPacket(opts: BuildPredictionOptions): {
  packet: PredictionPacket | null;
  block: string;
} {
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
    const winProbA = total > 0 ? scoreA.strength / total : 0.5;
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
        ...scoreA.edges.slice(0, 2).map((e) => `${e.champion} ${e.winrate}% patch WR`),
      ],
      risks: buildRisks(winProbA, confidence, "draft"),
    trends: relevantTrends(patch, undefined, leftTeam),
      teamProfiles,
      draftEdges: [
        ...scoreA.edges.map((e) => ({ ...e, side: "A" as const })),
        ...scoreB.edges.map((e) => ({ ...e, side: "B" as const })),
      ],
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
  let draftEdges: DraftEdge[] | undefined;
  let playerNotes: PredictionPacket["playerChampionNotes"];

  if (mode === "full" && opts.draft?.teams?.length === 2) {
    const [left, right] = opts.draft.teams;
    const picksA = left.champions.map((c) => c.name);
    const picksB = right.champions.map((c) => c.name);
    const scoreA = scoreDraftPicks(picksA, patch);
    const scoreB = scoreDraftPicks(picksB, patch);
    const draftProbA = scoreA.strength / (scoreA.strength + scoreB.strength);
    winProbA = 0.65 * winProbA + 0.35 * draftProbA;
    draftEdges = [
      ...scoreA.edges.map((e) => ({ ...e, side: "A" as const })),
      ...scoreB.edges.map((e) => ({ ...e, side: "B" as const })),
    ];
    playerNotes = [
      ...playerChampionNotes(teamA, picksA, patch),
      ...playerChampionNotes(teamB, picksB, patch),
    ];
  }

  const confidence = estimateConfidence(teamA, teamB, winProbA);
  const teamStats = snapshot[teamA]?.stats;
  const teamProfiles = attachTeamProfiles(teamA, teamB);

  const packet: PredictionPacket = {
    mode,
    teamA,
    teamB,
    patchBucket: patch,
    winProbA: Math.round(winProbA * 1000) / 1000,
    winProbB: Math.round((1 - winProbA) * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
    drivers: buildDrivers(score.featureContributions),
    risks: buildRisks(winProbA, confidence, mode),
    trends: relevantTrends(patch, teamStats, teamA),
    teamProfiles,
    draftEdges,
    playerChampionNotes: playerNotes,
    kalshiEdge: opts.kalshiMarkets?.length
      ? matchKalshiEdge(teamA, opts.kalshiMarkets, winProbA)
      : undefined,
    modelAsOf: snapshot[teamA]?.as_of,
  };

  return { packet, block: formatPredictionBlock(packet) };
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
  if (packet.draftEdges?.length) {
    lines.push("draft_edges:");
    for (const e of packet.draftEdges.slice(0, 8)) {
      lines.push(`  - ${e.side ? `${e.side}: ` : ""}${e.champion} edge ${e.edge}${e.winrate != null ? ` (${e.winrate}% WR)` : ""}`);
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
  if (profile.earlyFocusRoles.length) {
    lines.push(`  early_focus_roles: ${profile.earlyFocusRoles.join(", ")}`);
  }
  const ka = Object.entries(profile.roleEarlyKa15)
    .map(([role, v]) => `${role} K+A@15=${v}`)
    .join("; ");
  if (ka) lines.push(`  role_early_ka15: ${ka}`);
  if (profile.roster && Object.keys(profile.roster).length) {
    const rosterStr = Object.entries(profile.roster).map(([r, p]) => `${r}=${p}`).join(", ");
    lines.push(`  roster: ${rosterStr}`);
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
