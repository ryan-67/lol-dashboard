import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const TIER1 = ["LCK", "LPL", "LEC", "LCS"] as const;

const SEASON_ORDER: Record<string, number> = {
  Winter: 0,
  "First Stand": 1,
  Spring: 2,
  MSI: 3,
  EWC: 4,
  Summer: 5,
  Worlds: 6,
};

const REGIONAL_ONLY = new Set(["Winter", "Spring", "Summer"]);

export interface DashboardFilters {
  league?: string;
  split?: string;
  year?: string;
  selectedLeagues?: string[];
  selectedYears?: string[];
  selectedSplits?: string[];
}

/** Agent OE scope — same shape as dashboard filters; narrowed from user message. */
export type OEFilterParams = DashboardFilters;

export async function resolveCurrentRegionalSplit(
  service: SupabaseClient,
): Promise<string> {
  return resolveSplit(service, undefined, false);
}

function splitSortKey(splitLabel: string): [number, number, string] {
  const spaceIdx = splitLabel.indexOf(" ");
  const yearPart = spaceIdx >= 0 ? splitLabel.slice(0, spaceIdx) : splitLabel;
  const season = spaceIdx >= 0 ? splitLabel.slice(spaceIdx + 1).replace(/ Playoffs$/, "") : splitLabel;
  const year = /^\d+$/.test(yearPart) ? parseInt(yearPart, 10) : 0;
  return [year, SEASON_ORDER[season] ?? 99, season.toLowerCase()];
}

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
  dmgGoldRatio: number;
  firstBloodRate: number;
  objControl: number;
  gameLog?: Array<{ date: string; result: number; champion: string; kda: number; gd15: number }>;
}

export interface MergedTeam {
  name: string;
  league: string;
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

export interface MergedChampion {
  name: string;
  league: string;
  picks: number;
  bans: number;
  presence: number;
  winrate: number;
  pickrate: number;
  banrate: number;
}

export interface MergedMatchup {
  teamA: string;
  teamB: string;
  games: number;
  winsA: number;
  winsB: number;
}

export interface MergedTeamChampion {
  team: string;
  champion: string;
  picks: number;
  winrate: number;
}

export interface RosterDepthEntry {
  name: string;
  team: string;
  league: string;
  position: string;
  games: number;
  isStarter: boolean;
  isSub: boolean;
}

export interface SliceBundle {
  split: string;
  league: string;
  players: MergedPlayer[];
  teams: MergedTeam[];
  champions: MergedChampion[];
  matchups: MergedMatchup[];
  teamChampions: MergedTeamChampion[];
  rosterDepth: RosterDepthEntry[];
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

function leaguesForFilter(league: string): string[] {
  if (!league || league === "All Tier 1") return [...TIER1];
  return [league];
}

export async function resolveSplit(
  service: SupabaseClient,
  split: string | undefined,
  widenForSeries = false,
): Promise<string> {
  const trimmed = split?.trim();
  if (trimmed && trimmed !== "ALL" && !trimmed.toLowerCase().includes("all tier")) {
    if (/^\d{4}\s/.test(trimmed)) return trimmed;
    const year = new Date().getUTCFullYear();
    return `${year} ${trimmed}`;
  }

  // Prefer newest split that has at least one tier-1 league row. INT-only
  // leftovers (e.g. "2026 Summer" with only FURIA) must not become the default.
  const { data } = await service.from("oe_slices").select("split,league").limit(3000);
  const rows = (data ?? []) as Array<{ split?: string; league?: string }>;
  const tier1BySplit = new Map<string, boolean>();
  for (const row of rows) {
    const s = String(row.split ?? "");
    if (!s) continue;
    const isTier1 = (TIER1 as readonly string[]).includes(String(row.league ?? ""));
    tier1BySplit.set(s, Boolean(tier1BySplit.get(s)) || isTier1);
  }

  const splits = [...tier1BySplit.keys()]
    .filter((s) => tier1BySplit.get(s))
    .sort((a, b) => {
      const ka = splitSortKey(a);
      const kb = splitSortKey(b);
      if (ka[0] !== kb[0]) return kb[0] - ka[0];
      if (ka[1] !== kb[1]) return kb[1] - ka[1];
      return ka[2].localeCompare(kb[2]);
    });

  const year = new Date().getUTCFullYear();

  // Map international events to their combined regional leader (MSI → Spring).
  const toRegionalLeader = (s: string): string | null => {
    const space = s.indexOf(" ");
    if (space < 0) return null;
    const y = s.slice(0, space);
    const season = s.slice(space + 1).replace(/ Playoffs$/, "");
    if (REGIONAL_ONLY.has(season)) return `${y} ${season}`;
    if (season === "MSI" || season === "EWC") return `${y} Spring`;
    if (season === "First Stand") return `${y} Winter`;
    if (season === "Worlds") return `${y} Summer`;
    return null;
  };

  if (widenForSeries) {
    const regional = splits
      .filter((s) => s.startsWith(`${year} `))
      .map(toRegionalLeader)
      .filter((s): s is string => Boolean(s));
    if (regional.length) return regional[0]!;
  }

  const yearSplits = splits.filter((s) => s.startsWith(`${year} `));
  for (const s of yearSplits) {
    const leader = toRegionalLeader(s);
    if (leader) return leader;
  }

  for (const s of splits) {
    const leader = toRegionalLeader(s);
    if (leader) return leader;
  }

  return `${year} Spring`;
}

export function resolveSplitFromFilters(filters: DashboardFilters): string | undefined {
  const splits = filters.selectedSplits?.filter((s) => s && s !== "ALL") ?? [];
  if (splits.length === 1) return splits[0];
  if (filters.split?.trim()) return filters.split.trim();
  return undefined;
}

export function resolveLeagueFromFilters(filters: DashboardFilters): string {
  const leagues = filters.selectedLeagues?.filter(Boolean) ?? [];
  if (leagues.length === 1) return leagues[0]!;
  if (filters.league?.trim()) return filters.league.trim();
  return "All Tier 1";
}

export function resolveYearFromFilters(filters: DashboardFilters): string | undefined {
  const years = filters.selectedYears?.filter((y) => y && y !== "ALL") ?? [];
  if (years.length === 1) return years[0];
  if (filters.year?.trim() && filters.year !== "ALL") return filters.year.trim();
  return undefined;
}

async function fetchSliceRows(
  service: SupabaseClient,
  league: string,
  split: string | undefined,
  widenForSeries = false,
): Promise<Array<{ league: string; data: Record<string, unknown> }>> {
  const resolvedSplit = await resolveSplit(service, split, widenForSeries);
  const leagues = leaguesForFilter(league);
  const { data, error } = await service
    .from("oe_slices")
    .select("league, split, data")
    .eq("split", resolvedSplit)
    .in("league", leagues);
  if (error) throw new Error(`oe_slices fetch failed: ${error.message}`);
  return (data ?? []) as Array<{ league: string; data: Record<string, unknown> }>;
}

function mergePlayers(rows: Array<{ data: Record<string, unknown> }>): MergedPlayer[] {
  const acc = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    for (const raw of (row.data.players as Record<string, unknown>[] | undefined) ?? []) {
      const p = raw as Record<string, unknown>;
      const games = Number(p.games ?? 0);
      if (games <= 0) continue;
      const key = `${p.name}|${p.team}|${p.league}`;
      const existing = (acc.get(key) ?? {
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position ?? "",
        games: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        kp: [] as Array<{ value: number; weight: number }>,
        dmgShare: [] as Array<{ value: number; weight: number }>,
        gd15: [] as Array<{ value: number; weight: number }>,
        csd15: [] as Array<{ value: number; weight: number }>,
        xpd15: [] as Array<{ value: number; weight: number }>,
        dpm: [] as Array<{ value: number; weight: number }>,
        visionScore: [] as Array<{ value: number; weight: number }>,
        goldShare: [] as Array<{ value: number; weight: number }>,
        firstBloodRate: [] as Array<{ value: number; weight: number }>,
        objControl: [] as Array<{ value: number; weight: number }>,
        gameLog: [] as MergedPlayer["gameLog"],
      }) as Record<string, unknown>;
      existing.games = (existing.games as number) + games;
      existing.kills = (existing.kills as number) + Number(p.kills ?? 0);
      existing.deaths = (existing.deaths as number) + Number(p.deaths ?? 0);
      existing.assists = (existing.assists as number) + Number(p.assists ?? 0);
      if (!existing.position && p.position) existing.position = p.position;
      const push = (arr: Array<{ value: number; weight: number }>, val: unknown) => {
        if (games > 0 && typeof val === "number") arr.push({ value: val, weight: games });
      };
      push(existing.kp as Array<{ value: number; weight: number }>, p.kp);
      push(existing.dmgShare as Array<{ value: number; weight: number }>, p.dmgShare);
      push(existing.gd15 as Array<{ value: number; weight: number }>, p.gd15);
      push(existing.csd15 as Array<{ value: number; weight: number }>, p.csd15);
      push(existing.xpd15 as Array<{ value: number; weight: number }>, p.xpd15);
      push(existing.dpm as Array<{ value: number; weight: number }>, p.dpm);
      push(existing.visionScore as Array<{ value: number; weight: number }>, p.visionScore);
      push(existing.goldShare as Array<{ value: number; weight: number }>, p.goldShare);
      push(existing.firstBloodRate as Array<{ value: number; weight: number }>, p.firstBloodRate);
      push(existing.objControl as Array<{ value: number; weight: number }>, p.objControl);
      if (Array.isArray(p.gameLog)) {
        (existing.gameLog as MergedPlayer["gameLog"])!.push(
          ...(p.gameLog as MergedPlayer["gameLog"]),
        );
      }
      acc.set(key, existing);
    }
  }
  return [...acc.values()]
    .map((p) => {
      const deaths = Math.max(Number(p.deaths), 1);
      const games = Number(p.games);
      return {
        name: String(p.name),
        team: String(p.team),
        league: String(p.league),
        position: String(p.position ?? ""),
        games,
        kda: round((Number(p.kills) + Number(p.assists)) / deaths, 2),
        kp: round(avgWeighted(p.kp as Array<{ value: number; weight: number }>), 1),
        dmgShare: round(avgWeighted(p.dmgShare as Array<{ value: number; weight: number }>), 1),
        gd15: round(avgWeighted(p.gd15 as Array<{ value: number; weight: number }>), 1),
        csd15: round(avgWeighted(p.csd15 as Array<{ value: number; weight: number }>), 1),
        xpd15: round(avgWeighted(p.xpd15 as Array<{ value: number; weight: number }>), 1),
        dpm: round(avgWeighted(p.dpm as Array<{ value: number; weight: number }>), 1),
        visionScore: round(avgWeighted(p.visionScore as Array<{ value: number; weight: number }>), 1),
        goldShare: round(avgWeighted(p.goldShare as Array<{ value: number; weight: number }>), 1),
        dmgGoldRatio: (() => {
          const dmg = round(avgWeighted(p.dmgShare as Array<{ value: number; weight: number }>), 1);
          const gold = round(avgWeighted(p.goldShare as Array<{ value: number; weight: number }>), 1);
          return gold > 0 ? round(dmg / gold, 2) : 0;
        })(),
        firstBloodRate: round(
          avgWeighted(p.firstBloodRate as Array<{ value: number; weight: number }>),
          1,
        ),
        objControl: round(avgWeighted(p.objControl as Array<{ value: number; weight: number }>), 2),
        gameLog: (p.gameLog as MergedPlayer["gameLog"]) ?? [],
      };
    })
    .filter((p) => p.games >= 5);
}

function mergeTeams(rows: Array<{ data: Record<string, unknown> }>): MergedTeam[] {
  const acc = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    for (const raw of (row.data.teams as Record<string, unknown>[] | undefined) ?? []) {
      const t = raw as Record<string, unknown>;
      const games = Number(t.games ?? 0);
      if (games <= 0) continue;
      const key = `${t.name}|${t.league}`;
      const existing = (acc.get(key) ?? {
        name: t.name,
        league: t.league,
        games: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        dragons: 0,
        barons: 0,
        heralds: 0,
        gd15: [] as Array<{ value: number; weight: number }>,
        goldPerMin: [] as Array<{ value: number; weight: number }>,
        wardsPerMin: [] as Array<{ value: number; weight: number }>,
        firstBloodRate: [] as Array<{ value: number; weight: number }>,
      }) as Record<string, unknown>;
      existing.games = (existing.games as number) + games;
      existing.wins = (existing.wins as number) + Number(t.wins ?? 0);
      existing.losses = (existing.losses as number) + Number(t.losses ?? 0);
      existing.kills = (existing.kills as number) + Number(t.kills ?? 0);
      existing.deaths = (existing.deaths as number) + Number(t.deaths ?? 0);
      existing.assists = (existing.assists as number) + Number(t.assists ?? 0);
      existing.dragons = (existing.dragons as number) + Number(t.dragons ?? 0);
      existing.barons = (existing.barons as number) + Number(t.barons ?? 0);
      existing.heralds = (existing.heralds as number) + Number(t.heralds ?? 0);
      const push = (arr: Array<{ value: number; weight: number }>, val: unknown) => {
        if (games > 0 && typeof val === "number") arr.push({ value: val, weight: games });
      };
      push(existing.gd15 as Array<{ value: number; weight: number }>, t.avgGd15);
      push(existing.goldPerMin as Array<{ value: number; weight: number }>, t.goldPerMin);
      push(existing.wardsPerMin as Array<{ value: number; weight: number }>, t.wardsPerMin);
      push(existing.firstBloodRate as Array<{ value: number; weight: number }>, t.firstBloodRate);
      acc.set(key, existing);
    }
  }
  return [...acc.values()].map((t) => {
    const games = Math.max(Number(t.games), 1);
    const deaths = Math.max(Number(t.deaths), 1);
    return {
      name: String(t.name),
      league: String(t.league),
      games: Number(t.games),
      wins: Number(t.wins),
      losses: Number(t.losses),
      winrate: round((Number(t.wins) / games) * 100, 1),
      avgKda: round((Number(t.kills) + Number(t.assists)) / deaths, 2),
      avgGd15: round(avgWeighted(t.gd15 as Array<{ value: number; weight: number }>), 1),
      goldPerMin: round(avgWeighted(t.goldPerMin as Array<{ value: number; weight: number }>), 1),
      wardsPerMin: round(avgWeighted(t.wardsPerMin as Array<{ value: number; weight: number }>), 2),
      objPerGame: round(
        (Number(t.dragons) + Number(t.barons) + Number(t.heralds)) / games,
        2,
      ),
      firstBloodRate: round(
        avgWeighted(t.firstBloodRate as Array<{ value: number; weight: number }>),
        1,
      ),
    };
  });
}

function mergeChampions(rows: Array<{ league: string; data: Record<string, unknown> }>): MergedChampion[] {
  const acc = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    for (const raw of (row.data.champions as Record<string, unknown>[] | undefined) ?? []) {
      const c = raw as Record<string, unknown>;
      const key = `${c.name}|${row.league}`;
      const existing = (acc.get(key) ?? {
        name: c.name,
        league: row.league,
        picks: 0,
        bans: 0,
        wins: 0,
      }) as Record<string, unknown>;
      existing.picks = (existing.picks as number) + Number(c.picks ?? 0);
      existing.bans = (existing.bans as number) + Number(c.bans ?? 0);
      existing.wins = (existing.wins as number) + Number(c.wins ?? 0);
      acc.set(key, existing);
    }
  }
  return [...acc.values()]
    .map((c) => {
      const picks = Number(c.picks);
      const bans = Number(c.bans);
      const wins = Number(c.wins);
      return {
        name: String(c.name),
        league: String(c.league),
        picks,
        bans,
        presence: picks + bans,
        winrate: picks > 0 ? round((wins / picks) * 100, 1) : 0,
        pickrate: round(picks, 1),
        banrate: round(bans, 1),
      };
    })
    .filter((c) => c.picks >= 3)
    .sort((a, b) => b.presence - a.presence);
}

function mergeMatchups(rows: Array<{ data: Record<string, unknown> }>): MergedMatchup[] {
  const acc = new Map<string, MergedMatchup>();
  for (const row of rows) {
    for (const m of (row.data.matchups as Record<string, unknown>[] | undefined) ?? []) {
      const teamA = String(m.teamA);
      const teamB = String(m.teamB);
      const ordered = [teamA, teamB].sort();
      const key = ordered.join("|");
      const sameOrder = ordered[0] === teamA;
      const existing = acc.get(key) ?? {
        teamA: ordered[0],
        teamB: ordered[1],
        games: 0,
        winsA: 0,
        winsB: 0,
      };
      existing.games += Number(m.games ?? 0);
      existing.winsA += sameOrder ? Number(m.winsA ?? 0) : Number(m.winsB ?? 0);
      existing.winsB += sameOrder ? Number(m.winsB ?? 0) : Number(m.winsA ?? 0);
      acc.set(key, existing);
    }
  }
  return [...acc.values()].filter((m) => m.games > 0);
}

function mergeTeamChampions(rows: Array<{ data: Record<string, unknown> }>): MergedTeamChampion[] {
  const acc = new Map<string, { team: string; champion: string; picks: number; wins: number }>();
  for (const row of rows) {
    for (const raw of (row.data.teamChampions as Record<string, unknown>[] | undefined) ?? []) {
      const r = raw as Record<string, unknown>;
      const key = `${r.team}|${r.champion}`;
      const picks = Number(r.picks ?? 0);
      const existing = acc.get(key) ?? {
        team: String(r.team),
        champion: String(r.champion),
        picks: 0,
        wins: 0,
      };
      existing.picks += picks;
      existing.wins += Math.round((Number(r.winrate ?? 0) / 100) * picks);
      acc.set(key, existing);
    }
  }
  return [...acc.values()]
    .filter((r) => r.picks >= 1)
    .map((r) => ({
      team: r.team,
      champion: r.champion,
      picks: r.picks,
      winrate: round((r.wins / Math.max(r.picks, 1)) * 100, 1),
    }));
}

const ROSTER_ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

function normalizeRosterRole(position: string): string {
  const pos = position.toLowerCase();
  if (pos === "jng") return "jungle";
  if (pos === "bot") return "adc";
  if (pos === "sup") return "support";
  return pos;
}

function mergeRosterDepth(rows: Array<{ data: Record<string, unknown> }>): RosterDepthEntry[] {
  const acc = new Map<string, RosterDepthEntry>();
  for (const row of rows) {
    for (const raw of (row.data.rosterDepth as Record<string, unknown>[] | undefined) ?? []) {
      const r = raw as Record<string, unknown>;
      const games = Number(r.games ?? 0);
      if (games < 1) continue;
      const role = normalizeRosterRole(String(r.position ?? ""));
      const key = `${r.name}|${r.team}|${r.league}|${role}`;
      const existing = acc.get(key);
      if (existing) {
        existing.games += games;
      } else {
        acc.set(key, {
          name: String(r.name),
          team: String(r.team),
          league: String(r.league),
          position: role,
          games,
          isStarter: false,
          isSub: false,
        });
      }
    }
  }

  const bySlot = new Map<string, RosterDepthEntry[]>();
  for (const entry of acc.values()) {
    const slot = `${entry.team}|${entry.league}|${entry.position}`;
    const arr = bySlot.get(slot) ?? [];
    arr.push(entry);
    bySlot.set(slot, arr);
  }
  for (const members of bySlot.values()) {
    members.sort((a, b) => b.games - a.games);
    members.forEach((m, idx) => {
      m.isStarter = idx === 0 && m.games > 0;
      m.isSub = !m.isStarter;
    });
  }

  return [...acc.values()].sort(
    (a, b) =>
      a.team.localeCompare(b.team) ||
      ROSTER_ROLES.indexOf(a.position as typeof ROSTER_ROLES[number]) -
        ROSTER_ROLES.indexOf(b.position as typeof ROSTER_ROLES[number]) ||
      b.games - a.games,
  );
}

export async function fetchSliceBundle(
  service: SupabaseClient,
  league: string,
  split: string | undefined,
  options: { widenForSeries?: boolean } = {},
): Promise<SliceBundle> {
  const resolvedSplit = await resolveSplit(service, split, options.widenForSeries);
  const rows = await fetchSliceRows(service, league, resolvedSplit, options.widenForSeries);
  return {
    split: resolvedSplit,
    league: league || "All Tier 1",
    players: mergePlayers(rows),
    teams: mergeTeams(rows),
    champions: mergeChampions(rows),
    matchups: mergeMatchups(rows),
    teamChampions: mergeTeamChampions(rows),
    rosterDepth: mergeRosterDepth(rows),
  };
}

/** Resolve a team's roster (starters + subs by role) from rosterDepth, with player fallback. */
export function getTeamRosterDepth(
  bundle: SliceBundle,
  teamName: string,
  role?: string,
): { team: string; starters: RosterDepthEntry[]; subsByRole: Record<string, RosterDepthEntry[]> } {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(teamName);
  const wantRole = role ? normalizeRosterRole(role) : undefined;
  let matches = bundle.rosterDepth.filter((r) => norm(r.team) === target);
  let resolvedTeam = matches[0]?.team ?? teamName;

  if (!matches.length) {
    // Fallback to players (games>=5) when rosterDepth missing for this slice.
    const fallback = bundle.players.filter((p) => norm(p.team) === target);
    resolvedTeam = fallback[0]?.team ?? teamName;
    matches = fallback.map((p) => ({
      name: p.name,
      team: p.team,
      league: p.league,
      position: normalizeRosterRole(p.position),
      games: p.games,
      isStarter: true,
      isSub: false,
    }));
  }

  const starters: RosterDepthEntry[] = [];
  const subsByRole: Record<string, RosterDepthEntry[]> = {};
  for (const r of ROSTER_ROLES) {
    if (wantRole && r !== wantRole) continue;
    const atRole = matches.filter((m) => m.position === r).sort((a, b) => b.games - a.games);
    if (!atRole.length) continue;
    starters.push(atRole[0]!);
    const subs = atRole.slice(1).filter((s) => s.games >= 1);
    if (subs.length) subsByRole[r] = subs;
  }
  return { team: resolvedTeam, starters, subsByRole };
}

export function buildStatSnapshot(bundle: SliceBundle): Record<string, unknown> {
  const topTeams = [...bundle.teams].sort((a, b) => b.winrate - a.winrate).slice(0, 8);
  const roles = ["top", "jungle", "mid", "adc", "support"] as const;
  const roleLeaders: Record<string, unknown>[] = [];
  for (const role of roles) {
    const norm = (p: string) => p.toLowerCase().replace(/[^a-z]/g, "");
    const cohort = bundle.players.filter((p) => {
      const pos = norm(p.position);
      return pos === role || (role === "adc" && (pos === "bot" || pos === "adc"));
    });
    const best = [...cohort].sort((a, b) => b.kda - a.kda)[0];
    if (best) {
      roleLeaders.push({
        role,
        name: best.name,
        team: best.team,
        league: best.league,
        kda: best.kda,
        gd15: best.gd15,
        games: best.games,
      });
    }
  }
  const topChamps = bundle.champions.slice(0, 10);
  const topMatchups = [...bundle.matchups]
    .sort((a, b) => b.games - a.games)
    .slice(0, 6)
    .map((m) => ({
      teamA: m.teamA,
      teamB: m.teamB,
      games: m.games,
      record: `${m.winsA}-${m.winsB}`,
    }));
  return {
    tool: "stat_snapshot",
    split: bundle.split,
    league: bundle.league,
    topTeams: topTeams.map((t) => ({
      name: t.name,
      league: t.league,
      winrate: t.winrate,
      games: t.games,
      avgGd15: t.avgGd15,
    })),
    roleLeaders,
    topChampions: topChamps.map((c) => ({
      name: c.name,
      league: c.league,
      presence: c.presence,
      winrate: c.winrate,
      picks: c.picks,
      bans: c.bans,
    })),
    topMatchups,
    playerCount: bundle.players.length,
    teamCount: bundle.teams.length,
    matchupCount: bundle.matchups.length,
  };
}
