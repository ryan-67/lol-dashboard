import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type SliceBundle,
  buildStatSnapshot,
  fetchSliceBundle,
  type MergedPlayer,
  type MergedTeam,
} from "./oeData.ts";

const TEAM_ALIASES: Record<string, string> = {
  t1: "T1",
  "gen.g": "Gen.G",
  geng: "Gen.G",
  "gen g": "Gen.G",
  hle: "Hanwha Life Esports",
  drx: "DRX",
  kt: "KT Rolster",
  dk: "Dplus KIA",
  g2: "G2 Esports",
  c9: "Cloud9",
  tl: "Team Liquid",
};

const PLAYER_ALIASES: Record<string, string> = {
  faker: "Faker",
  chovy: "Chovy",
  canyon: "Canyon",
  oner: "Oner",
  zeus: "Zeus",
  keria: "Keria",
  peyz: "Peyz",
  gumayusi: "Gumayusi",
  ruler: "Ruler",
  caps: "Caps",
  knight: "Knight",
};

export interface ToolResult {
  tool: string;
  data: Record<string, unknown>;
}

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

function extractTeams(message: string, teams: MergedTeam[]): MergedTeam[] {
  const lower = message.toLowerCase();
  const found = new Map<string, MergedTeam>();
  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (lower.includes(alias)) {
      const t = resolveTeam(canonical, teams);
      if (t) found.set(`${t.name}|${t.league}`, t);
    }
  }
  for (const team of teams) {
    if (lower.includes(team.name.toLowerCase())) {
      found.set(`${team.name}|${team.league}`, team);
    }
  }
  return [...found.values()];
}

function resolvePlayer(name: string, players: MergedPlayer[]): MergedPlayer | null {
  const alias = PLAYER_ALIASES[name.toLowerCase().trim()];
  const target = alias ?? name.trim();
  return (
    players.find((p) => p.name === target) ??
    players.find((p) => p.name.toLowerCase() === target.toLowerCase()) ??
    null
  );
}

function normalizeRole(position: string): string | null {
  const pos = position.toLowerCase();
  if (pos === "top") return "top";
  if (pos === "jungle" || pos === "jng") return "jungle";
  if (pos === "mid") return "mid";
  if (pos === "adc" || pos === "bot") return "adc";
  if (pos === "support" || pos === "sup") return "support";
  return null;
}

function playerScore(p: MergedPlayer): number {
  const weights = { kda: 0.35, gd15: 0.25, dpm: 0.15, dmgShare: 0.15, kp: 0.1 };
  const norm = (v: number, min: number, max: number) =>
    max === min ? 0.5 : (v - min) / (max - min);
  return (
    norm(p.kda, 1, 6) * weights.kda +
    norm(p.gd15, -500, 500) * weights.gd15 +
    norm(p.dpm, 300, 700) * weights.dpm +
    norm(p.dmgShare, 15, 35) * weights.dmgShare +
    norm(p.kp, 50, 80) * weights.kp
  );
}

export function runMatchupLookup(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  const teams = extractTeams(message, bundle.teams);
  if (teams.length < 2) return null;
  if (!/\b(vs|versus|h2h|head.?to.?head|matchup|record)\b/i.test(message) &&
    !/\bcompare\b/i.test(message)) {
    return null;
  }

  const [a, b] = teams.slice(0, 2);
  const key = [a.name, b.name].sort().join("|");
  const matchup = bundle.matchups.find((m) => [m.teamA, m.teamB].sort().join("|") === key);

  if (!matchup) {
    return {
      tool: "matchup_lookup",
      data: {
        split: bundle.split,
        league: bundle.league,
        teamA: a.name,
        teamB: b.name,
        games: 0,
        note: "no head-to-head games in oe_slices for this split yet",
      },
    };
  }

  const aIsFirst = matchup.teamA === a.name || matchup.teamA === [a.name, b.name].sort()[0];
  const winsA = aIsFirst ? matchup.winsA : matchup.winsB;
  const winsB = aIsFirst ? matchup.winsB : matchup.winsA;

  return {
    tool: "matchup_lookup",
    data: {
      split: bundle.split,
      league: bundle.league,
      teamA: a.name,
      teamB: b.name,
      games: matchup.games,
      winsA,
      winsB,
      winrateA: matchup.games > 0 ? Math.round((winsA / matchup.games) * 1000) / 10 : 0,
      winrateB: matchup.games > 0 ? Math.round((winsB / matchup.games) * 1000) / 10 : 0,
      source: "oe_slices.matchups",
    },
  };
}

export function runPlayerRankings(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  if (!/\b(overrated|underrated|best|worst|top|rank|mvp|goat|mid\b|adc|support|jungle)\b/i.test(message)) {
    return null;
  }

  let roleFilter: string | null = null;
  const roleMatch = message.match(/\b(top|jungle|jng|mid|adc|bot|support|sup)\b/i);
  if (roleMatch) roleFilter = normalizeRole(roleMatch[1]);

  let pool = bundle.players;
  if (roleFilter) {
    pool = pool.filter((p) => normalizeRole(p.position) === roleFilter);
  }

  const leagueMatch = message.match(/\b(lck|lpl|lec|lcs)\b/i);
  if (leagueMatch) {
    pool = pool.filter((p) => p.league.toUpperCase() === leagueMatch[1].toUpperCase());
  }

  if (pool.length < 3) return null;

  const ranked = [...pool]
    .map((p) => ({ ...p, score: playerScore(p) }))
    .sort((a, b) => b.score - a.score);

  const wantBottom = /\b(overrated|worst|bottom|flop|underperform)\b/i.test(message);
  const slice = wantBottom ? ranked.slice(-8).reverse() : ranked.slice(0, 8);

  return {
    tool: "player_rankings",
    data: {
      split: bundle.split,
      league: bundle.league,
      role: roleFilter ?? "all",
      ranking: wantBottom ? "bottom_by_composite_score" : "top_by_composite_score",
      players: slice.map((p) => ({
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position,
        games: p.games,
        kda: p.kda,
        gd15: p.gd15,
        dpm: p.dpm,
        score: Math.round(p.score * 1000) / 1000,
      })),
      source: "oe_slices.players",
    },
  };
}

export function runChampionMeta(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  if (!/\b(champion|champ|meta|pick|ban|presence|draft|priority)\b/i.test(message)) {
    return null;
  }

  const champMatch = message.match(/\b([A-Z][a-z]+(?:['\s][A-Za-z]+)?)\b/g);
  if (champMatch) {
    for (const token of champMatch) {
      const hit = bundle.champions.find((c) => c.name.toLowerCase() === token.toLowerCase());
      if (hit) {
        return {
          tool: "champion_meta",
          data: {
            split: bundle.split,
            league: bundle.league,
            champion: hit,
            source: "oe_slices.champions",
          },
        };
      }
    }
  }

  return {
    tool: "champion_meta",
    data: {
      split: bundle.split,
      league: bundle.league,
      topByPresence: bundle.champions.slice(0, 12),
      source: "oe_slices.champions",
    },
  };
}

export function runTeamForm(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  if (!/\b(form|streak|recent|last \d|momentum|hot|cold)\b/i.test(message)) {
    return null;
  }

  const teams = extractTeams(message, bundle.teams);
  const targetTeams = teams.length ? teams : bundle.teams.slice(0, 4);
  const results: Record<string, unknown>[] = [];

  for (const team of targetTeams.slice(0, 3)) {
    const logs = bundle.players
      .filter((p) => p.team === team.name)
      .flatMap((p) => (p.gameLog ?? []).map((g) => ({ ...g, player: p.name })));
    const byDate = [...logs].sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set<string>();
    const uniqueGames: Array<{ date: string; result: number }> = [];
    for (const g of byDate) {
      const id = `${g.date}|${g.result}`;
      if (seen.has(id)) continue;
      seen.add(id);
      uniqueGames.push({ date: g.date, result: g.result });
      if (uniqueGames.length >= 5) break;
    }
    const wins = uniqueGames.filter((g) => g.result === 1).length;
    results.push({
      team: team.name,
      league: team.league,
      last5: uniqueGames,
      last5Record: `${wins}-${uniqueGames.length - wins}`,
      splitWinrate: team.winrate,
    });
  }

  return {
    tool: "team_form",
    data: {
      split: bundle.split,
      league: bundle.league,
      teams: results,
      source: "oe_slices.players.gameLog",
    },
  };
}

export function runLaneMatchup(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  const teams = extractTeams(message, bundle.teams);
  if (teams.length < 2) return null;
  if (!/\b(lane|positional|matchup|top|jungle|mid|adc|support)\b/i.test(message)) {
    return null;
  }

  const [teamA, teamB] = teams;
  const roles = ["top", "jungle", "mid", "adc", "support"];
  const lanes = roles.map((role) => {
    const pick = (team: MergedTeam) =>
      bundle.players
        .filter((p) => p.team === team.name && normalizeRole(p.position) === role)
        .sort((a, b) => b.games - a.games)[0] ?? null;
    const a = pick(teamA);
    const b = pick(teamB);
    return {
      role,
      teamA: a ? { name: a.name, kda: a.kda, gd15: a.gd15, dpm: a.dpm, csd15: a.csd15 } : null,
      teamB: b ? { name: b.name, kda: b.kda, gd15: b.gd15, dpm: b.dpm, csd15: b.csd15 } : null,
    };
  });

  return {
    tool: "lane_matchup",
    data: {
      split: bundle.split,
      league: bundle.league,
      teamA: teamA.name,
      teamB: teamB.name,
      lanes,
      source: "oe_slices.players",
    },
  };
}

export async function runScheduleLookup(
  service: SupabaseClient,
  message: string,
  league: string,
  split: string,
  teamsForFilter: MergedTeam[] = [],
): Promise<ToolResult | null> {
  if (!/\b(schedule|upcoming|next match|plays|match today|bracket|playoffs|when)\b/i.test(message)) {
    return null;
  }

  const leagueFilter = message.match(/\b(LCK|LPL|LEC|LCS)\b/i)?.[1]?.toUpperCase();
  const query = service
    .from("esports_schedules")
    .select("league, split, team_a, team_b, scheduled_at, status, score, source_url")
    .order("scheduled_at", { ascending: true })
    .limit(15);

  if (leagueFilter) {
    query.eq("league", leagueFilter);
  } else if (league !== "All Tier 1") {
    query.eq("league", league);
  }

  if (split) query.eq("split", split);

  const { data, error } = await query;
  if (error) {
    return {
      tool: "schedule_lookup",
      data: {
        split,
        league,
        matches: [],
        note: `schedule table unavailable: ${error.message}`,
      },
    };
  }

  let rows = data ?? [];
  const mentionedTeams = extractTeams(message, teamsForFilter);
  if (mentionedTeams.length) {
    const names = new Set(mentionedTeams.map((t) => t.name.toLowerCase()));
    rows = rows.filter(
      (r: { team_a: string; team_b: string }) =>
        names.has(r.team_a.toLowerCase()) || names.has(r.team_b.toLowerCase()),
    );
  }

  return {
    tool: "schedule_lookup",
    data: {
      split,
      league: leagueFilter ?? league,
      matches: rows,
      source: "esports_schedules",
    },
  };
}

export interface AnalystContext {
  snapshot: Record<string, unknown>;
  tools: ToolResult[];
}

export async function buildAnalystContext(
  service: SupabaseClient,
  message: string,
  league: string,
  split: string | undefined,
): Promise<AnalystContext> {
  const bundle = await fetchSliceBundle(service, league, split);
  const snapshot = buildStatSnapshot(bundle);
  const tools: ToolResult[] = [];

  const candidates = [
    runMatchupLookup(message, bundle),
    runPlayerRankings(message, bundle),
    runChampionMeta(message, bundle),
    runTeamForm(message, bundle),
    runLaneMatchup(message, bundle),
    await runScheduleLookup(service, message, league, bundle.split, bundle.teams),
  ].filter((t): t is ToolResult => t !== null);

  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.tool)) continue;
    seen.add(c.tool);
    tools.push(c);
  }

  return { snapshot, tools };
}

export function mergeToolResults(ctx: AnalystContext): Record<string, unknown> {
  return {
    stat_snapshot: ctx.snapshot,
    tool_results: ctx.tools.map((t) => ({ tool: t.tool, ...t.data })),
  };
}
