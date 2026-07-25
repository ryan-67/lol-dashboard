import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AgentChartPayload,
  type CompareChartPayload,
  type RadarChartPayload,
  chartMarkdownBlock,
} from "./teamCompare.ts";

const TIER1 = ["LCK", "LPL", "LEC", "LCS"] as const;
type RoleKey = "top" | "jungle" | "mid" | "adc" | "support";

const PLAYER_ALIASES: Record<string, string> = {
  faker: "Faker",
  chovy: "Chovy",
  zeus: "Zeus",
  keria: "Keria",
  peyz: "Peyz",
  gumayusi: "Gumayusi",
  oner: "Oner",
  canyon: "Canyon",
  ruler: "Ruler",
  showmaker: "ShowMaker",
  bin: "Bin",
  knight: "Knight",
};

type RadarMetricKey =
  | "csd15"
  | "gd15"
  | "xpd15"
  | "dpm"
  | "kda"
  | "dmgShare"
  | "firstBloodRate"
  | "kp"
  | "objControl"
  | "goldShare"
  | "visionScore";

const ROLE_METRICS: Record<RoleKey, Array<{ key: RadarMetricKey; label: string }>> = {
  top: [
    { key: "csd15", label: "CS Diff@15" },
    { key: "gd15", label: "Gold Diff@15" },
    { key: "xpd15", label: "XP Diff@15" },
    { key: "dpm", label: "DPM" },
    { key: "kda", label: "KDA" },
    { key: "dmgShare", label: "Damage %" },
  ],
  jungle: [
    { key: "csd15", label: "CS Diff@15" },
    { key: "gd15", label: "Gold Diff@15" },
    { key: "xpd15", label: "XP Diff@15" },
    { key: "firstBloodRate", label: "First Blood %" },
    { key: "kp", label: "Kill Participation" },
    { key: "objControl", label: "Objective Control %" },
    { key: "kda", label: "KDA" },
  ],
  mid: [
    { key: "csd15", label: "CS Diff@15" },
    { key: "gd15", label: "Gold Diff@15" },
    { key: "xpd15", label: "XP Diff@15" },
    { key: "dpm", label: "DPM" },
    { key: "dmgShare", label: "Damage %" },
    { key: "kda", label: "KDA" },
  ],
  adc: [
    { key: "csd15", label: "CS Diff@15" },
    { key: "gd15", label: "Gold Diff@15" },
    { key: "dpm", label: "DPM" },
    { key: "dmgShare", label: "Damage %" },
    { key: "goldShare", label: "Gold %" },
    { key: "kda", label: "KDA" },
  ],
  support: [
    { key: "gd15", label: "Gold Diff@15" },
    { key: "firstBloodRate", label: "First Blood %" },
    { key: "kp", label: "Kill Participation" },
    { key: "visionScore", label: "Vision Score" },
    { key: "kda", label: "KDA" },
    { key: "dmgShare", label: "Damage %" },
  ],
};

type PlayerRow = {
  name: string;
  team: string;
  league: string;
  position?: string;
  games?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  kp?: number;
  dmgShare?: number;
  gd15?: number;
  csd15?: number;
  xpd15?: number;
  dpm?: number;
  visionScore?: number;
  goldShare?: number;
  firstBloodRate?: number;
  objControl?: number;
};

export interface MergedPlayer {
  name: string;
  team: string;
  league: string;
  position: string;
  games: number;
  kda: number;
  kp: number;
  dmgShare: number;
  gd15: number;
  csd15: number;
  xpd15: number;
  dpm: number;
  visionScore: number;
  goldShare: number;
  firstBloodRate: number;
  objControl: number;
}

function round(n: number, d = 1): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function avgWeighted(items: Array<{ value: number; weight: number }>): number {
  if (!items.length) return 0;
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (!total) return 0;
  return items.reduce((s, i) => s + i.value * i.weight, 0) / total;
}

function normalizePosition(position: string | undefined): RoleKey | null {
  const pos = (position ?? "").toLowerCase();
  if (pos === "top") return "top";
  if (pos === "jungle" || pos === "jng") return "jungle";
  if (pos === "mid") return "mid";
  if (pos === "adc" || pos === "bot") return "adc";
  if (pos === "support" || pos === "sup") return "support";
  return null;
}

function mergePlayersFromSlices(
  rows: Array<{ league: string; data: { players?: PlayerRow[] } }>,
): MergedPlayer[] {
  const acc = new Map<
    string,
    {
      name: string;
      team: string;
      league: string;
      position: string;
      games: number;
      kills: number;
      deaths: number;
      assists: number;
      kp: Array<{ value: number; weight: number }>;
      dmgShare: Array<{ value: number; weight: number }>;
      gd15: Array<{ value: number; weight: number }>;
      csd15: Array<{ value: number; weight: number }>;
      xpd15: Array<{ value: number; weight: number }>;
      dpm: Array<{ value: number; weight: number }>;
      visionScore: Array<{ value: number; weight: number }>;
      goldShare: Array<{ value: number; weight: number }>;
      firstBloodRate: Array<{ value: number; weight: number }>;
      objControl: Array<{ value: number; weight: number }>;
    }
  >();

  for (const row of rows) {
    for (const p of row.data?.players ?? []) {
      const games = p.games ?? 0;
      if (games <= 0) continue;
      const key = `${p.name}|${p.team}|${p.league}`;
      const existing = acc.get(key) ?? {
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position ?? "",
        games: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        kp: [],
        dmgShare: [],
        gd15: [],
        csd15: [],
        xpd15: [],
        dpm: [],
        visionScore: [],
        goldShare: [],
        firstBloodRate: [],
        objControl: [],
      };
      existing.games += games;
      existing.kills += p.kills ?? 0;
      existing.deaths += p.deaths ?? 0;
      existing.assists += p.assists ?? 0;
      if (!existing.position && p.position) existing.position = p.position;
      if (games > 0 && typeof p.kp === "number") existing.kp.push({ value: p.kp, weight: games });
      if (games > 0 && typeof p.dmgShare === "number") {
        existing.dmgShare.push({ value: p.dmgShare, weight: games });
      }
      if (games > 0 && typeof p.gd15 === "number") existing.gd15.push({ value: p.gd15, weight: games });
      if (games > 0 && typeof p.csd15 === "number") {
        existing.csd15.push({ value: p.csd15, weight: games });
      }
      if (games > 0 && typeof p.xpd15 === "number") {
        existing.xpd15.push({ value: p.xpd15, weight: games });
      }
      if (games > 0 && typeof p.dpm === "number") existing.dpm.push({ value: p.dpm, weight: games });
      if (games > 0 && typeof p.visionScore === "number") {
        existing.visionScore.push({ value: p.visionScore, weight: games });
      }
      if (games > 0 && typeof p.goldShare === "number") {
        existing.goldShare.push({ value: p.goldShare, weight: games });
      }
      if (games > 0 && typeof p.firstBloodRate === "number") {
        existing.firstBloodRate.push({ value: p.firstBloodRate, weight: games });
      }
      if (games > 0 && typeof p.objControl === "number") {
        existing.objControl.push({ value: p.objControl, weight: games });
      }
      acc.set(key, existing);
    }
  }

  return [...acc.values()]
    .map((p) => {
      const deaths = Math.max(p.deaths, 1);
      return {
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position,
        games: p.games,
        kda: round((p.kills + p.assists) / deaths, 2),
        kp: round(avgWeighted(p.kp), 1),
        dmgShare: round(avgWeighted(p.dmgShare), 1),
        gd15: round(avgWeighted(p.gd15), 1),
        csd15: round(avgWeighted(p.csd15), 1),
        xpd15: round(avgWeighted(p.xpd15), 1),
        dpm: round(avgWeighted(p.dpm), 1),
        visionScore: round(avgWeighted(p.visionScore), 1),
        goldShare: round(avgWeighted(p.goldShare), 1),
        firstBloodRate: round(avgWeighted(p.firstBloodRate), 1),
        objControl: round(avgWeighted(p.objControl), 2),
      };
    })
    .filter((p) => p.games >= 5);
}

function leaguesForFilter(league: string): string[] {
  if (!league || league === "All Tier 1") return [...TIER1];
  return [league];
}

async function resolveSplit(service: SupabaseClient, split: string | undefined): Promise<string> {
  const trimmed = split?.trim();
  if (trimmed) return trimmed;
  const { data } = await service
    .from("oe_slices")
    .select("split, updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const s = String((row as { split?: string }).split ?? "");
    if (s && !seen.has(s)) {
      seen.add(s);
      return s;
    }
  }
  return "2026 Spring";
}

async function fetchMergedPlayers(
  service: SupabaseClient,
  league: string,
  split: string | undefined,
): Promise<{ players: MergedPlayer[]; split: string; league: string }> {
  const resolvedSplit = await resolveSplit(service, split);
  const leagues = leaguesForFilter(league);
  const { data, error } = await service
    .from("oe_slices")
    .select("league, split, data")
    .eq("split", resolvedSplit)
    .in("league", leagues);
  if (error) throw new Error(`oe_slices fetch failed: ${error.message}`);
  const players = mergePlayersFromSlices(
    (data ?? []) as Array<{ league: string; data: { players?: PlayerRow[] } }>,
  );
  return { players, split: resolvedSplit, league: league || "All Tier 1" };
}

function playersForRole(players: MergedPlayer[], role: RoleKey): MergedPlayer[] {
  return players.filter((p) => normalizePosition(p.position) === role);
}

function getMetricValue(player: MergedPlayer, key: RadarMetricKey): number {
  const raw = player[key];
  return typeof raw === "number" && !Number.isNaN(raw) ? raw : 0;
}

function normalizeInCohort(value: number, cohortValues: number[]): number {
  if (!cohortValues.length) return 0;
  const min = Math.min(...cohortValues);
  const max = Math.max(...cohortValues);
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

function formatMetric(key: RadarMetricKey, value: number): string {
  switch (key) {
    case "csd15":
    case "gd15":
    case "xpd15":
      return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
    case "dpm":
      return value.toFixed(0);
    case "kda":
      return value.toFixed(2);
    case "dmgShare":
    case "goldShare":
    case "firstBloodRate":
    case "kp":
      return `${value.toFixed(1)}%`;
    case "objControl":
      return value.toFixed(2);
    case "visionScore":
      return value.toFixed(1);
    default:
      return value.toFixed(2);
  }
}

function resolvePlayerName(token: string, players: MergedPlayer[]): MergedPlayer | null {
  const alias = PLAYER_ALIASES[token.toLowerCase().trim()];
  const target = alias ?? token.trim();
  const lower = target.toLowerCase();
  return (
    players.find((p) => p.name === target) ??
    players.find((p) => p.name.toLowerCase() === lower) ??
    null
  );
}

export function extractComparePlayers(message: string, players: MergedPlayer[]): MergedPlayer[] {
  const lower = message.toLowerCase();
  if (!/\b(compare|vs\.?|versus|head.?to.?head|h2h|analyze|analysis)\b/.test(lower)) return [];

  const found = new Map<string, MergedPlayer>();
  for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
    if (lower.includes(alias)) {
      const player = resolvePlayerName(canonical, players);
      if (player) found.set(`${player.name}|${player.team}|${player.league}`, player);
    }
  }
  for (const player of players) {
    if (lower.includes(player.name.toLowerCase())) {
      found.set(`${player.name}|${player.team}|${player.league}`, player);
    }
  }
  return [...found.values()].slice(0, 4);
}

function cohortForPlayer(
  player: MergedPlayer,
  comparePlayers: MergedPlayer[],
  allPlayers: MergedPlayer[],
  role: RoleKey,
): MergedPlayer[] {
  const allSameLeague =
    comparePlayers.length > 0 && comparePlayers.every((p) => p.league === comparePlayers[0].league);
  if (allSameLeague) {
    return playersForRole(
      allPlayers.filter((p) => p.league === comparePlayers[0].league),
      role,
    );
  }
  return playersForRole(
    allPlayers.filter((p) => p.league === player.league),
    role,
  );
}

function buildPlayerRadarChartPayload(
  comparePlayers: MergedPlayer[],
  allPlayers: MergedPlayer[],
  role: RoleKey,
  split: string,
  league: string,
): RadarChartPayload {
  const metrics = ROLE_METRICS[role];
  const seriesPlayers = comparePlayers.map((player) => {
    const cohort = cohortForPlayer(player, comparePlayers, allPlayers, role);
    const series = metrics.map((def) => {
      const cohortValues = cohort.map((p) => getMetricValue(p, def.key));
      const raw = getMetricValue(player, def.key);
      const avgRaw = cohortValues.length
        ? cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length
        : 0;
      return {
        metric: def.label,
        valueNorm: normalizeInCohort(raw, cohortValues),
        avgNorm: normalizeInCohort(avgRaw, cohortValues),
        formatted: formatMetric(def.key, raw),
        formattedAvg: formatMetric(def.key, avgRaw),
      };
    });
    return {
      name: `${player.name} (${player.team})`,
      league: player.league,
      winrate: player.kda,
      games: player.games,
      series,
    };
  });

  const title = `${comparePlayers.map((p) => p.name).join(" vs ")} (${role.toUpperCase()}) — ${split}${
    league !== "All Tier 1" ? ` ${league}` : ""
  }`;

  return { type: "radar", title, split, league, teams: seriesPlayers };
}

function buildPlayerCompareBars(
  comparePlayers: MergedPlayer[],
  role: RoleKey,
  split: string,
  league: string,
): CompareChartPayload | null {
  if (comparePlayers.length < 2) return null;
  const [a, b] = comparePlayers;
  const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    type: "compare",
    title: `${a.name} vs ${b.name}`,
    subtitle: `${role.toUpperCase()} · ${split}${league !== "All Tier 1" ? ` · ${league}` : ""}`,
    left: { name: a.name, meta: a.team },
    right: { name: b.name, meta: b.team },
    metrics: [
      { label: "Games", left: a.games, right: b.games, higherIsBetter: true },
      { label: "KDA", left: round(a.kda), right: round(b.kda), higherIsBetter: true },
      { label: "GD@15", left: round(a.gd15, 1), right: round(b.gd15, 1), higherIsBetter: true },
      { label: "CS/diff@15", left: round(a.csd15, 1), right: round(b.csd15, 1), higherIsBetter: true },
      { label: "DPM", left: round(a.dpm, 0), right: round(b.dpm, 0), higherIsBetter: true },
      {
        label: "Dmg%",
        left: round(a.dmgShare ?? 0, 1),
        right: round(b.dmgShare ?? 0, 1),
        higherIsBetter: true,
      },
    ],
  };
}

export async function runPlayerCompare(
  service: SupabaseClient,
  message: string,
  league: string | undefined,
  split: string | undefined,
): Promise<{ data: Record<string, unknown>; chart: AgentChartPayload; chartMarkdown: string } | null> {
  const { players, split: resolvedSplit, league: resolvedLeague } = await fetchMergedPlayers(
    service,
    league ?? "All Tier 1",
    split,
  );

  const comparePlayers = extractComparePlayers(message, players);
  if (comparePlayers.length < 2) return null;

  const roles = comparePlayers
    .map((p) => normalizePosition(p.position))
    .filter((r): r is RoleKey => r !== null);
  const uniqueRoles = new Set(roles);
  if (uniqueRoles.size !== 1) return null;

  const role = roles[0]!;
  const radar = buildPlayerRadarChartPayload(comparePlayers, players, role, resolvedSplit, resolvedLeague);
  const bars = buildPlayerCompareBars(comparePlayers, role, resolvedSplit, resolvedLeague);
  const data = {
    tool: "player_compare",
    split: resolvedSplit,
    league: resolvedLeague,
    role,
    assumption: "stats are for the selected split unless the user explicitly names another split",
    players: comparePlayers.map((p) => ({
      name: p.name,
      team: p.team,
      league: p.league,
      position: p.position,
      games: p.games,
      kda: p.kda,
      gd15: p.gd15,
      csd15: p.csd15,
      dpm: p.dpm,
      kp: p.kp,
      dmgShare: p.dmgShare,
    })),
  };

  const chartMarkdown = [bars ? chartMarkdownBlock(bars) : "", chartMarkdownBlock(radar)]
    .filter(Boolean)
    .join("\n\n");

  return { data, chart: bars ?? radar, chartMarkdown };
}

export { chartMarkdownBlock };
