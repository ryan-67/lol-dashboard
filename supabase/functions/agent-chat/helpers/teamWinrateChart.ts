import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchSliceBundle,
  listRegionalSplitsForYear,
  type MergedPlayer,
  type MergedTeam,
  type OEFilterParams,
} from "./oeData.ts";
import { isTeamWinrateChartQuestion } from "./intents.ts";

const TEAM_ALIASES: Record<string, string> = {
  t1: "T1",
  "gen.g": "Gen.G",
  geng: "Gen.G",
  dk: "Dplus Kia",
  dplus: "Dplus Kia",
  hle: "Hanwha Life Esports",
  g2: "G2 Esports",
  c9: "Cloud9",
  tl: "Team Liquid",
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.]/g, "");
}

function resolveTeam(name: string, teams: MergedTeam[]): MergedTeam | null {
  const alias = TEAM_ALIASES[name.toLowerCase().trim()];
  const target = alias ?? name.trim();
  const norm = normalizeToken(target);
  return (
    teams.find((t) => t.name === target) ??
    teams.find((t) => normalizeToken(t.name) === norm) ??
    teams.find((t) => normalizeToken(t.name).includes(norm) || norm.includes(normalizeToken(t.name))) ??
    null
  );
}

function extractTeam(message: string, teams: MergedTeam[]): MergedTeam | null {
  const lower = message.toLowerCase();
  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hit = alias.length <= 3
      ? new RegExp(`\\b${escaped}\\b`, "i").test(lower)
      : lower.includes(alias);
    if (hit) {
      return resolveTeam(canonical, teams) ?? {
        name: canonical,
        league: "LCK",
        games: 0,
        wins: 0,
        losses: 0,
        winrate: 0,
        avgKda: 0,
        avgGd15: 0,
        goldPerMin: 0,
        wardsPerMin: 0,
        objPerGame: 0,
        firstBloodRate: 0,
      };
    }
  }
  for (const team of teams) {
    if (lower.includes(team.name.toLowerCase())) return team;
  }
  return null;
}

interface TeamGame {
  date: string;
  result: number;
  opponent?: string;
  split?: string;
}

function collectTeamGames(team: MergedTeam, players: MergedPlayer[]): TeamGame[] {
  const norm = normalizeToken(team.name);
  const seen = new Set<string>();
  const games: TeamGame[] = [];

  for (const player of players) {
    const pNorm = normalizeToken(player.team);
    if (pNorm !== norm && !pNorm.includes(norm) && !norm.includes(pNorm)) continue;
    for (const raw of player.gameLog ?? []) {
      const id = raw.gameId ?? `${raw.date}|${player.team}|${raw.opponent ?? ""}|${raw.result}`;
      if (seen.has(id)) continue;
      seen.add(id);
      games.push({
        date: raw.date,
        result: raw.result,
        opponent: raw.opponent,
        split: raw.split,
      });
    }
  }

  return games.sort((a, b) => a.date.localeCompare(b.date) || (a.opponent ?? "").localeCompare(b.opponent ?? ""));
}

export interface LineChartPayload {
  type: "line";
  title: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

export function chartMarkdownBlock(chart: LineChartPayload): string {
  return `\`\`\`chart\n${JSON.stringify(chart)}\n\`\`\``;
}

async function fetchTeamGamesForRegionalYear(
  service: SupabaseClient,
  team: MergedTeam,
  year: string,
): Promise<TeamGame[]> {
  const splits = await listRegionalSplitsForYear(service, year);
  const seen = new Set<string>();
  const games: TeamGame[] = [];

  for (const splitLabel of splits) {
    const bundle = await fetchSliceBundle(service, {
      league: team.league,
      selectedLeagues: [team.league],
      year,
      selectedYears: [year],
      split: splitLabel,
      selectedSplits: [splitLabel],
    });

    for (const g of collectTeamGames(team, bundle.players)) {
      const id = `${g.date}|${g.opponent ?? ""}|${g.result}|${splitLabel}`;
      if (seen.has(id)) continue;
      seen.add(id);
      games.push({ ...g, split: splitLabel });
    }
  }

  return games.sort((a, b) => a.date.localeCompare(b.date));
}

function buildCumulativeLineChart(
  team: MergedTeam,
  year: string,
  games: TeamGame[],
  mode: "per_game" | "per_split",
): LineChartPayload {
  const labels: string[] = [];
  const data: number[] = [];

  if (mode === "per_game" && games.length) {
    let wins = 0;
    games.forEach((g, idx) => {
      wins += g.result === 1 ? 1 : 0;
      labels.push(g.date.slice(5) || `G${idx + 1}`);
      data.push(Math.round((wins / (idx + 1)) * 1000) / 10);
    });
  } else {
    let wins = 0;
    let total = 0;
    const bySplit = new Map<string, { wins: number; games: number }>();
    for (const g of games) {
      const split = g.split ?? "unknown";
      const cur = bySplit.get(split) ?? { wins: 0, games: 0 };
      cur.games += 1;
      if (g.result === 1) cur.wins += 1;
      bySplit.set(split, cur);
    }
    for (const [split, stats] of [...bySplit.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      wins += stats.wins;
      total += stats.games;
      labels.push(split.replace(`${year} `, ""));
      data.push(Math.round((wins / total) * 1000) / 10);
    }
  }

  return {
    type: "line",
    title: `${team.name} cumulative winrate — ${year} (regional splits)`,
    labels,
    datasets: [{ label: "Winrate %", data }],
  };
}

async function fetchSplitBreakdown(
  service: SupabaseClient,
  team: MergedTeam,
  year: string,
): Promise<Array<{ split: string; winrate: number; games: number; wins: number; losses: number }>> {
  const splits = await listRegionalSplitsForYear(service, year);
  const breakdown: Array<{ split: string; winrate: number; games: number; wins: number; losses: number }> = [];

  for (const splitLabel of splits) {
    const bundle = await fetchSliceBundle(service, {
      league: team.league,
      selectedLeagues: [team.league],
      year,
      selectedYears: [year],
      split: splitLabel,
      selectedSplits: [splitLabel],
    });
    const t = resolveTeam(team.name, bundle.teams);
    if (!t || t.games <= 0) continue;
    breakdown.push({
      split: splitLabel.replace(`${year} `, ""),
      winrate: t.winrate,
      games: t.games,
      wins: t.wins,
      losses: t.losses,
    });
  }

  return breakdown;
}

export async function runTeamWinrateChart(
  service: SupabaseClient,
  message: string,
  _filters: OEFilterParams,
): Promise<{ data: Record<string, unknown>; chart: LineChartPayload } | null> {
  if (!isTeamWinrateChartQuestion(message)) return null;

  const yearMatch = message.match(/\b(20\d{2})\b/);
  const year = yearMatch?.[1] ?? String(new Date().getFullYear());

  const probeBundle = await fetchSliceBundle(service, {
    league: "LCK",
    selectedLeagues: ["LCK"],
    year,
    selectedYears: [year],
    split: `${year} Spring`,
    selectedSplits: [`${year} Spring`],
  });

  const team = extractTeam(message, probeBundle.teams);
  if (!team) return null;

  const resolved = resolveTeam(team.name, probeBundle.teams) ?? team;
  const splitBreakdown = await fetchSplitBreakdown(service, resolved, year);
  const games = await fetchTeamGamesForRegionalYear(service, resolved, year);

  if (!games.length) {
    const splits = await listRegionalSplitsForYear(service, year);
    let cumWins = 0;
    let cumGames = 0;
    const labels: string[] = [];
    const data: number[] = [];
    const splitsIncluded: string[] = [];

    for (const splitLabel of splits) {
      const bundle = await fetchSliceBundle(service, {
        league: resolved.league,
        selectedLeagues: [resolved.league],
        year,
        selectedYears: [year],
        split: splitLabel,
        selectedSplits: [splitLabel],
      });
      const t = resolveTeam(resolved.name, bundle.teams);
      if (!t || t.games <= 0) continue;
      cumWins += t.wins;
      cumGames += t.games;
      splitsIncluded.push(splitLabel);
      labels.push(splitLabel.replace(`${year} `, ""));
      data.push(Math.round((cumWins / cumGames) * 1000) / 10);
    }

    if (!labels.length) return null;

    const chart: LineChartPayload = {
      type: "line",
      title: `${resolved.name} cumulative winrate — ${year} (regional splits)`,
      labels,
      datasets: [{ label: "Winrate %", data }],
    };

    return {
      data: {
        tool: "team_winrate_chart",
        team: resolved.name,
        league: resolved.league,
        year,
        gamesPlayed: cumGames,
        splitsIncluded,
        splitBreakdown,
        chartMode: "per_split_fallback",
      },
      chart,
    };
  }

  const mode = games.length >= 3 ? "per_game" : "per_split";
  const chart = buildCumulativeLineChart(resolved, year, games, mode);
  const splitsIncluded = [...new Set(games.map((g) => g.split).filter(Boolean))];

  return {
    data: {
      tool: "team_winrate_chart",
      team: resolved.name,
      league: resolved.league,
      year,
      gamesPlayed: games.length,
      splitsIncluded,
      splitBreakdown,
      excluded: ["First Stand", "MSI", "Worlds", "Summer (if not yet indexed)"],
      finalCumulativeWinrate: chart.datasets[0]?.data[chart.datasets[0].data.length - 1] ?? 0,
      chartMode: mode,
    },
    chart,
  };
}
