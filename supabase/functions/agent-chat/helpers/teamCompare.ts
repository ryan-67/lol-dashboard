import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const TIER1 = ["LCK", "LPL", "LEC", "LCS"] as const;

const TEAM_ALIASES: Record<string, string> = {
  t1: "T1",
  "gen.g": "Gen.G",
  geng: "Gen.G",
  "gen g": "Gen.G",
  "hanwha life": "Hanwha Life Esports",
  hle: "Hanwha Life Esports",
  drx: "DRX",
  kt: "KT Rolster",
  "kt rolster": "KT Rolster",
  dplus: "Dplus KIA",
  dk: "Dplus KIA",
};

const RADAR_METRICS = [
  { key: "earlyGame", label: "Early Game", field: "avgGd15" as const },
  { key: "objControl", label: "Objective Control", field: "objPerGame" as const },
  { key: "economy", label: "Economy", field: "goldPerMin" as const },
  { key: "vision", label: "Vision", field: "wardsPerMin" as const },
  { key: "combat", label: "Combat", field: "avgKda" as const },
];

type TeamRow = {
  name: string;
  league: string;
  games?: number;
  wins?: number;
  losses?: number;
  winrate?: number;
  avgKda?: number;
  avgGd15?: number;
  goldPerMin?: number;
  wardsPerMin?: number;
  objPerGame?: number;
  firstBloodRate?: number;
  dragonsPerGame?: number;
  baronsPerGame?: number;
  towersPerGame?: number;
  avgGameLength?: number;
};

export interface MergedTeam extends TeamRow {
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKda: number;
  avgGd15: number;
  goldPerMin: number;
  wardsPerMin: number;
  objPerGame: number;
  firstBloodRate: number;
}

export interface RadarChartPayload {
  type: "radar";
  title: string;
  split: string;
  league: string;
  teams: Array<{
    name: string;
    league: string;
    winrate: number;
    games: number;
    series: Array<{
      metric: string;
      valueNorm: number;
      avgNorm: number;
      formatted: string;
      formattedAvg: string;
    }>;
  }>;
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

function mergeTeamsFromSlices(rows: Array<{ league: string; data: { teams?: TeamRow[] } }>): MergedTeam[] {
  const acc = new Map<
    string,
    {
      name: string;
      league: string;
      games: number;
      wins: number;
      losses: number;
      gd15: Array<{ value: number; weight: number }>;
      goldPerMin: Array<{ value: number; weight: number }>;
      wardsPerMin: Array<{ value: number; weight: number }>;
      firstBloodRate: Array<{ value: number; weight: number }>;
      kills: number;
      deaths: number;
      assists: number;
      dragons: number;
      barons: number;
      heralds: number;
    }
  >();

  for (const row of rows) {
    for (const t of row.data?.teams ?? []) {
      const games = t.games ?? 0;
      if (games <= 0) continue;
      const key = `${t.name}|${t.league}`;
      const existing = acc.get(key) ?? {
        name: t.name,
        league: t.league,
        games: 0,
        wins: 0,
        losses: 0,
        gd15: [],
        goldPerMin: [],
        wardsPerMin: [],
        firstBloodRate: [],
        kills: 0,
        deaths: 0,
        assists: 0,
        dragons: 0,
        barons: 0,
        heralds: 0,
      };
      existing.games += games;
      existing.wins += t.wins ?? 0;
      existing.losses += t.losses ?? 0;
      existing.kills += (t as TeamRow & { kills?: number }).kills ?? 0;
      existing.deaths += (t as TeamRow & { deaths?: number }).deaths ?? 0;
      existing.assists += (t as TeamRow & { assists?: number }).assists ?? 0;
      existing.dragons += (t as TeamRow & { dragons?: number }).dragons ?? 0;
      existing.barons += (t as TeamRow & { barons?: number }).barons ?? 0;
      existing.heralds += (t as TeamRow & { heralds?: number }).heralds ?? 0;
      if (typeof t.avgGd15 === "number") existing.gd15.push({ value: t.avgGd15, weight: games });
      if (typeof t.goldPerMin === "number") existing.goldPerMin.push({ value: t.goldPerMin, weight: games });
      if (typeof t.wardsPerMin === "number") existing.wardsPerMin.push({ value: t.wardsPerMin, weight: games });
      if (typeof t.firstBloodRate === "number") {
        existing.firstBloodRate.push({ value: t.firstBloodRate, weight: games });
      }
      acc.set(key, existing);
    }
  }

  return [...acc.values()].map((t) => {
    const games = Math.max(t.games, 1);
    const deaths = Math.max(t.deaths, 1);
    return {
      name: t.name,
      league: t.league,
      games: t.games,
      wins: t.wins,
      losses: t.losses,
      winrate: round((t.wins / games) * 100, 1),
      avgKda: round((t.kills + t.assists) / deaths, 2),
      avgGd15: round(avgWeighted(t.gd15), 1),
      goldPerMin: round(avgWeighted(t.goldPerMin), 1),
      wardsPerMin: round(avgWeighted(t.wardsPerMin), 2),
      objPerGame: round((t.dragons + t.barons + t.heralds) / games, 2),
      firstBloodRate: round(avgWeighted(t.firstBloodRate), 1),
    };
  });
}

function leaguesForFilter(league: string): string[] {
  if (!league || league === "All Tier 1") return [...TIER1];
  return [league];
}

async function resolveSplit(
  service: SupabaseClient,
  split: string | undefined,
): Promise<string> {
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

export async function fetchMergedTeams(
  service: SupabaseClient,
  league: string,
  split: string | undefined,
): Promise<{ teams: MergedTeam[]; split: string; league: string }> {
  const resolvedSplit = await resolveSplit(service, split);
  const leagues = leaguesForFilter(league);

  const { data, error } = await service
    .from("oe_slices")
    .select("league, split, data")
    .eq("split", resolvedSplit)
    .in("league", leagues);

  if (error) {
    throw new Error(`oe_slices fetch failed: ${error.message}`);
  }

  const teams = mergeTeamsFromSlices(
    (data ?? []) as Array<{ league: string; data: { teams?: TeamRow[] } }>,
  );

  return {
    teams,
    split: resolvedSplit,
    league: league || "All Tier 1",
  };
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.]/g, "");
}

function resolveTeamName(token: string, teams: MergedTeam[]): MergedTeam | null {
  const alias = TEAM_ALIASES[token.toLowerCase().trim()];
  const target = alias ?? token.trim();
  const norm = normalizeToken(target);

  return (
    teams.find((t) => t.name === target) ??
    teams.find((t) => normalizeToken(t.name) === norm) ??
    teams.find((t) => normalizeToken(t.name).includes(norm) || norm.includes(normalizeToken(t.name))) ??
    null
  );
}

export function extractCompareTeams(message: string, teams: MergedTeam[]): MergedTeam[] {
  const lower = message.toLowerCase();
  if (!/\b(compare|vs\.?|versus|head.?to.?head|h2h)\b/.test(lower)) {
    return [];
  }

  const found = new Map<string, MergedTeam>();

  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (lower.includes(alias)) {
      const team = resolveTeamName(canonical, teams);
      if (team) found.set(`${team.name}|${team.league}`, team);
    }
  }

  for (const team of teams) {
    const nameLower = team.name.toLowerCase();
    if (lower.includes(nameLower)) {
      found.set(`${team.name}|${team.league}`, team);
    }
  }

  return [...found.values()].slice(0, 4);
}

function metricRaw(team: MergedTeam, key: string): number {
  switch (key) {
    case "earlyGame":
      return team.avgGd15 ?? 0;
    case "objControl":
      return team.objPerGame ?? 0;
    case "economy":
      return team.goldPerMin ?? 0;
    case "vision":
      return team.wardsPerMin ?? 0;
    case "combat":
      return team.avgKda ?? 0;
    default:
      return 0;
  }
}

function normalizeInCohort(value: number, values: number[]): number {
  if (!values.length) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

function formatMetric(key: string, value: number): string {
  switch (key) {
    case "earlyGame":
      return `${value > 0 ? "+" : ""}${value.toFixed(1)} GD@15`;
    case "objControl":
      return `${value.toFixed(2)} obj/g`;
    case "economy":
      return `${value.toFixed(1)} gold/min`;
    case "vision":
      return `${value.toFixed(2)} wards/min`;
    case "combat":
      return `${value.toFixed(2)} KDA`;
    default:
      return value.toFixed(2);
  }
}

export function buildRadarChartPayload(
  teams: MergedTeam[],
  split: string,
  league: string,
): RadarChartPayload {
  const cohortLeagues = new Set(teams.map((t) => t.league));
  const cohort = teams.filter((t) => cohortLeagues.has(t.league));

  const seriesTeams = teams.map((team) => {
    const leagueCohort = cohort.filter((t) => t.league === team.league);
    const series = RADAR_METRICS.map((def) => {
      const cohortValues = leagueCohort.map((t) => metricRaw(t, def.key));
      const raw = metricRaw(team, def.key);
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
      name: team.name,
      league: team.league,
      winrate: team.winrate,
      games: team.games,
      series,
    };
  });

  const title = `${teams.map((t) => t.name).join(" vs ")} — ${split}${league !== "All Tier 1" ? ` ${league}` : ""}`;

  return {
    type: "radar",
    title,
    split,
    league,
    teams: seriesTeams,
  };
}

export function buildTeamCompareSummary(
  teams: MergedTeam[],
  split: string,
  league: string,
): Record<string, unknown> {
  return {
    tool: "team_compare",
    split,
    league,
    assumption: "stats are for the selected split unless the user explicitly names another split",
    teams: teams.map((t) => ({
      name: t.name,
      league: t.league,
      games: t.games,
      wins: t.wins,
      losses: t.losses,
      winrate: t.winrate,
      avgKda: t.avgKda,
      avgGd15: t.avgGd15,
      objPerGame: t.objPerGame,
      firstBloodRate: t.firstBloodRate,
      goldPerMin: t.goldPerMin,
      wardsPerMin: t.wardsPerMin,
    })),
  };
}

export async function runTeamCompare(
  service: SupabaseClient,
  message: string,
  league: string | undefined,
  split: string | undefined,
): Promise<{ data: Record<string, unknown>; chart: RadarChartPayload } | null> {
  const { teams, split: resolvedSplit, league: resolvedLeague } = await fetchMergedTeams(
    service,
    league ?? "All Tier 1",
    split,
  );

  const compareTeams = extractCompareTeams(message, teams);
  if (compareTeams.length < 2) return null;

  const chart = buildRadarChartPayload(compareTeams, resolvedSplit, resolvedLeague);
  const data = buildTeamCompareSummary(compareTeams, resolvedSplit, resolvedLeague);

  return { data, chart };
}

export function chartMarkdownBlock(chart: RadarChartPayload): string {
  return `\`\`\`chart\n${JSON.stringify(chart)}\n\`\`\``;
}
