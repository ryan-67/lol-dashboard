import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type SliceBundle,
  buildStatSnapshot,
  fetchSliceBundle,
  getTeamRosterDepth,
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
  dk: "Dplus Kia",
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
  smash: "Smash",
  aiming: "Aiming",
  showmaker: "ShowMaker",
  bdd: "Bdd",
  zeka: "Zeka",
  kanavi: "Kanavi",
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
  if (pos === "adc" || pos === "adcs" || pos === "bot") return "adc";
  if (pos === "support" || pos === "sup") return "support";
  return null;
}

import {
  adcCarryScore,
  playerScoreForRanking,
  scoringNote,
} from "./playerScoring.ts";

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

export function wantsTopTeamsOnly(message: string): boolean {
  return /\b(top\s+(?:\d[\s-]?)?(?:lck|lpl|lec|lcs)\s+)?teams?\b|top\s+(?:\d[\s-]?)?(?:lck|lpl|lec|lcs)\s+team\b|top\s+[45]\b|upper\s+table|playoff\s+teams?|top\s+of\s+(?:the\s+)?standings|contenders?\b/i
    .test(message);
}

function resolveRankingLeague(message: string): string | null {
  const leaguesMentioned = ["LCK", "LPL", "LEC", "LCS"].filter((lg) =>
    new RegExp(`\\b${lg}\\b`, "i").test(message)
  );
  if (leaguesMentioned.length === 1) return leaguesMentioned[0]!;
  const leagueMatch = message.match(/\b(lck|lpl|lec|lcs)\b/i);
  return leagueMatch ? leagueMatch[1]!.toUpperCase() : null;
}

function playerSharePayload(p: MergedPlayer) {
  return {
    name: p.name,
    team: p.team,
    league: p.league,
    position: p.position,
    games: p.games,
    kda: p.kda,
    gd15: p.gd15,
    dmgShare: p.dmgShare,
    goldShare: p.goldShare,
    dmgGoldRatio: p.dmgGoldRatio,
  };
}

function isTeamShareCompareAsk(message: string, bundle: SliceBundle): boolean {
  if (
    !/(dmg%|dmg share|damage share|gold%|gold share|dmg\/gold|dmg%\/gold%|carry impact)/i.test(
      message,
    )
  ) {
    return false;
  }
  if (!/\b(compare|among|between|vs\.?|versus)\b/i.test(message)) return false;
  return extractTeams(message, bundle.teams).length >= 2;
}

/** Per-team starter stats for a role — authoritative dmg%/gold% for multi-team compare asks. */
export function runTeamRoleShareCompare(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  if (!isTeamShareCompareAsk(message, bundle)) return null;

  let roleFilter: string | null = null;
  const roleMatch = message.match(/\b(top|jungle|jng|mid|adcs?|bot|support|sup)\b/i);
  if (roleMatch) roleFilter = normalizeRole(roleMatch[1]!);
  if (!roleFilter && /\badcs?\b/i.test(message)) roleFilter = "adc";
  if (!roleFilter) return null;

  const teams = extractTeams(message, bundle.teams);
  if (teams.length < 2) return null;

  const leaguesMentioned = ["LCK", "LPL", "LEC", "LCS"].filter((lg) =>
    new RegExp(`\\b${lg}\\b`, "i").test(message),
  );
  const leagueFilter = leaguesMentioned.length === 1 ? leaguesMentioned[0]! : null;

  const entries: Array<Record<string, unknown>> = [];
  for (const team of teams) {
    if (leagueFilter && team.league.toUpperCase() !== leagueFilter) continue;

    const depth = getTeamRosterDepth(bundle, team.name, roleFilter);
    const starter = depth.starters.find((s) => s.position === roleFilter);
    if (!starter) continue;
    const player =
      bundle.players.find((p) => p.name === starter.name && p.team === depth.team) ??
      bundle.players.find((p) => p.name === starter.name);
    if (!player || player.games < 3) continue;
    entries.push({
      ...playerSharePayload(player),
      role: roleFilter,
    });
  }

  if (entries.length < 2) return null;

  entries.sort(
    (a, b) => Number(b.dmgGoldRatio ?? 0) - Number(a.dmgGoldRatio ?? 0),
  );

  return {
    tool: "team_role_share_compare",
    data: {
      split: bundle.split,
      league: bundle.league,
      role: roleFilter ?? "per-team-starter",
      players: entries,
      note:
        "AUTHORITATIVE oe_slices split stats — cite dmgShare, goldShare, and dmgGoldRatio exactly as listed. dmgGoldRatio = dmgShare ÷ goldShare.",
      source: "oe_slices.players",
    },
  };
}

export function runPlayerRankings(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  if (isTeamShareCompareAsk(message, bundle)) return null;

  if (
    !/\b(overrated|underrated|best|worst|top|rank|mvp|goat|fraudulent|fraud|frauds?|bum|bums|inters?|trash|flop|underperform|exposed|mid\b|adc|bot|support|jungle)\b/i
      .test(message)
  ) {
    return null;
  }

  let roleFilter: string | null = null;
  const roleMatch = message.match(/\b(top|jungle|jng|mid|adcs?|bot|support|sup)\b/i);
  if (roleMatch) roleFilter = normalizeRole(roleMatch[1]!);
  if (!roleFilter && /\badcs?\b/i.test(message)) roleFilter = "adc";

  let pool = bundle.players.filter((p) => p.games >= 5);
  if (roleFilter) {
    pool = pool.filter((p) => normalizeRole(p.position) === roleFilter);
  }

  const leaguesMentioned = ["LCK", "LPL", "LEC", "LCS"].filter((lg) =>
    new RegExp(`\\b${lg}\\b`, "i").test(message)
  );
  let rankingLeague = resolveRankingLeague(message);

  if (leaguesMentioned.length >= 2) {
    pool = pool.filter((p) => leaguesMentioned.includes(p.league.toUpperCase()));
  } else if (leaguesMentioned.length === 1) {
    rankingLeague = leaguesMentioned[0]!;
    pool = pool.filter((p) => p.league.toUpperCase() === leaguesMentioned[0]);
  } else if (rankingLeague) {
    pool = pool.filter((p) => p.league.toUpperCase() === rankingLeague);
  }

  let topTeamsFilter: string[] | null = null;
  let topTeamsMeta: Array<{ name: string; winrate: number; wins: number; losses: number }> | null =
    null;
  if (wantsTopTeamsOnly(message) && rankingLeague) {
    const topTeams = bundle.teams
      .filter((t) => t.league.toUpperCase() === rankingLeague.toUpperCase())
      .sort((a, b) => b.winrate - a.winrate || b.wins - a.wins)
      .slice(0, 5);
    topTeamsFilter = topTeams.map((t) => t.name);
    topTeamsMeta = topTeams.map((t) => ({
      name: t.name,
      winrate: t.winrate,
      wins: t.wins,
      losses: t.losses,
    }));
    const allowed = new Set(topTeamsFilter);
    pool = pool.filter((p) => allowed.has(p.team));
  }

  if (pool.length < 2) return null;

  const wantBottom =
    /\b(overrated|worst|bottom|flop|underperform|fraudulent|fraud|frauds?|bum|bums|inters?|trash|exposed)\b/i
      .test(message);

  const ranked = [...pool]
    .map((p) => ({
      ...p,
      score: playerScoreForRanking(p, roleFilter, wantBottom),
      carryScore: adcCarryScore(p),
    }))
    .sort((a, b) => (wantBottom ? a.score - b.score : b.score - a.score));

  const slice = ranked.slice(0, 10);

  return {
    tool: "player_rankings",
    data: {
      split: bundle.split,
      league: bundle.league,
      role: roleFilter ?? "all",
      ranking: wantBottom ? "bottom_by_role_score" : "top_by_role_score",
      top_teams_filter: topTeamsFilter,
      top_teams_standings: topTeamsMeta,
      top_teams_definition: topTeamsFilter
        ? `top ${topTeamsFilter.length} teams by winrate in ${rankingLeague} standings`
        : null,
      scoring: scoringNote(roleFilter, wantBottom),
      note: "use team field exactly; for ADC fraud lean on dmgShare and goldShare in output",
      players: slice.map((p) => ({
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position,
        games: p.games,
        kda: p.kda,
        gd15: p.gd15,
        dpm: p.dpm,
        dmgShare: p.dmgShare,
        goldShare: p.goldShare,
        dmgGoldRatio: p.dmgGoldRatio,
        carryScore: Math.round(p.carryScore * 1000) / 1000,
        score: Math.round(p.score * 1000) / 1000,
      })),
    },
  };
}

export function runMentionedPlayers(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  const lower = message.toLowerCase();
  const hits: Array<Record<string, unknown>> = [];

  for (const p of bundle.players) {
    if (p.games < 3) continue;
    const key = p.name.toLowerCase();
    if (lower.includes(key)) {
      hits.push(playerSharePayload(p));
    }
  }

  for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
    if (!lower.includes(alias)) continue;
    const p = resolvePlayer(canonical, bundle.players);
    if (p && p.games >= 3 && !hits.some((h) => h.name === p.name)) {
      hits.push(playerSharePayload(p));
    }
  }

  if (!hits.length) return null;

  return {
    tool: "mentioned_players",
    data: {
      split: bundle.split,
      players: hits,
      note: "current split roster from match data — authoritative team assignments",
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

function extractChampionFromMessage(message: string, champions: SliceBundle["champions"]): string | null {
  const lower = message.toLowerCase();
  const sorted = [...champions].sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    if (lower.includes(c.name.toLowerCase())) return c.name;
  }
  return null;
}

function resolvePlayerFromMessage(message: string, players: MergedPlayer[]): MergedPlayer | null {
  const lower = message.toLowerCase();
  for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
    if (lower.includes(alias)) {
      const p = resolvePlayer(canonical, players);
      if (p) return p;
    }
  }
  for (const p of players) {
    if (p.games < 1) continue;
    if (lower.includes(p.name.toLowerCase())) return p;
  }
  return null;
}

/** Per-champion split stats from OE gameLog — required before claiming good/bad on a champ. */
export function runPlayerChampionStat(message: string, bundle: SliceBundle): ToolResult | null {
  const champion = extractChampionFromMessage(message, bundle.champions);
  if (!champion) return null;

  const player = resolvePlayerFromMessage(message, bundle.players);
  if (!player) return null;

  const performanceIntent =
    /\b(dogshit|dog shit|trash|bad at|good at|winrate|win rate|stats?|notorious|garbage|ass|mid on|weak|strong|pick rate|refuses?|won't pick|how is|how's|diff|int|goat|fraud|overrated|underrated)\b/i
      .test(message) ||
    /'s\s/.test(message) ||
    /\bon\s+[a-z]/i.test(message);

  if (!performanceIntent) return null;

  const champGames = (player.gameLog ?? []).filter(
    (g) => g.champion.toLowerCase() === champion.toLowerCase(),
  );
  const allGames = player.gameLog ?? [];
  const champWins = champGames.filter((g) => g.result === 1).length;
  const allWins = allGames.filter((g) => g.result === 1).length;

  const winrate = (wins: number, total: number) =>
    total > 0 ? Math.round((wins / total) * 1000) / 10 : null;

  return {
    tool: "player_champion",
    data: {
      split: bundle.split,
      league: bundle.league,
      player: player.name,
      team: player.team,
      position: player.position,
      champion,
      gamesOnChampion: champGames.length,
      winsOnChampion: champWins,
      lossesOnChampion: champGames.length - champWins,
      winrateOnChampion: winrate(champWins, champGames.length),
      splitGamesOverall: allGames.length || player.games,
      splitWinrateOverall: winrate(allWins, allGames.length),
      recentOnChampion: champGames.slice(-5).map((g) => ({
        date: g.date,
        result: g.result === 1 ? "W" : "L",
        kda: g.kda,
        gd15: g.gd15,
      })),
      source: "oe_slices.gameLog",
      note: champGames.length
        ? "current split filter only — cite these numbers for split WR on this champ"
        : "no games on this champion in current split filter — say so; career WR needs gol.gg/WEB_VERIFIED",
    },
  };
}

function extractPlayerName(message: string): string | null {
  const lower = message.toLowerCase();
  for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  const match = message.match(/\b([A-Z][a-z]{2,}(?:['\s][A-Za-z]+)?)\b/);
  if (match && !["LCK", "LPL", "LEC", "LCS", "MSI"].includes(match[1]!)) {
    return match[1]!;
  }
  return null;
}

export function runPlayerStat(message: string, bundle: SliceBundle): ToolResult | null {
  if (
    !/\b(kda|stats?|gd@?15|csd@?15|dpm|games|winrate|dmg%|dmg share|gold%|gold share|dmg\/gold)\b/i.test(
      message,
    )
  ) {
    return null;
  }
  const name = extractPlayerName(message);
  if (!name) return null;

  const player =
    resolvePlayer(name, bundle.players) ??
    bundle.players.find((p) => p.name.toLowerCase().includes(name.toLowerCase())) ??
    null;

  if (!player) {
    return {
      tool: "player_stat",
      data: { player: name, found: false, split: bundle.split, note: "no verified stats for this player in filter" },
    };
  }

  return {
    tool: "player_stat",
    data: {
      split: bundle.split,
      league: bundle.league,
      player: {
        name: player.name,
        team: player.team,
        league: player.league,
        position: player.position,
        games: player.games,
        kda: player.kda,
        gd15: player.gd15,
        csd15: player.csd15,
        dpm: player.dpm,
        dmgShare: player.dmgShare,
        goldShare: player.goldShare,
        dmgGoldRatio: player.dmgGoldRatio,
        kp: player.kp,
      },
    },
  };
}

export function runTeamStat(message: string, bundle: SliceBundle): ToolResult | null {
  if (!/\b(winrate|win rate|record|wins?|losses?|how is|how's)\b/i.test(message)) return null;
  const teams = extractTeams(message, bundle.teams);
  if (!teams.length) return null;

  const team = teams[0]!;
  return {
    tool: "team_stat",
    data: {
      split: bundle.split,
      league: bundle.league,
      team: {
        name: team.name,
        league: team.league,
        games: team.games,
        wins: team.wins,
        losses: team.losses,
        winrate: team.winrate,
        avgKda: team.avgKda,
        avgGd15: team.avgGd15,
        objPerGame: team.objPerGame,
      },
    },
  };
}

export function runTeamRankings(message: string, bundle: SliceBundle): ToolResult | null {
  if (!/\b(best|worst|top|rank|objective|control|economy)\b/i.test(message) || !/\bteam/i.test(message)) {
    return null;
  }

  const metric = /\bobjective\b/i.test(message)
    ? "objPerGame"
    : /\bearly|gd@?15\b/i.test(message)
    ? "avgGd15"
    : "winrate";

  const ranked = [...bundle.teams].sort((a, b) => {
    const av = metric === "objPerGame" ? a.objPerGame : metric === "avgGd15" ? a.avgGd15 : a.winrate;
    const bv = metric === "objPerGame" ? b.objPerGame : metric === "avgGd15" ? b.avgGd15 : b.winrate;
    return bv - av;
  });

  return {
    tool: "team_rankings",
    data: {
      split: bundle.split,
      league: bundle.league,
      metric,
      teams: ranked.slice(0, 8).map((t) => ({
        name: t.name,
        league: t.league,
        winrate: t.winrate,
        objPerGame: t.objPerGame,
        avgGd15: t.avgGd15,
      })),
    },
  };
}

export function runTeamRoster(message: string, bundle: SliceBundle): ToolResult | null {
  if (!/\b(roster|who(?:'s| is) on|players on|lineup)\b/i.test(message)) return null;
  const teams = extractTeams(message, bundle.teams);
  if (!teams.length) return null;

  // Use rosterDepth so subs (games >= 1) are visible, not just games>=5 starters.
  const depth = getTeamRosterDepth(bundle, teams[0]!.name);
  const order = ["top", "jungle", "mid", "adc", "support"];
  const roster: Array<{ name: string; position: string; games: number; role: string }> = [];
  for (const role of order) {
    const starter = depth.starters.find((s) => s.position === role);
    if (starter) {
      roster.push({ name: starter.name, position: "starter", games: starter.games, role });
    }
    for (const sub of depth.subsByRole[role] ?? []) {
      roster.push({ name: sub.name, position: "sub", games: sub.games, role });
    }
  }

  return {
    tool: "team_roster",
    data: {
      split: bundle.split,
      team: depth.team,
      league: teams[0]!.league,
      roster,
      note: "position field = starter|sub; role field = lane. subs have >= 1 game and fewer games than the starter.",
    },
  };
}

const ROLE_DEPTH_TRIGGER =
  /\b(sub|subs|substitute|substitutes|backup|back-?up|who else|who played|split time|role depth|depth chart|bench|benched|stand-?in|reserve)\b/i;

export function wantsRoleDepth(message: string): boolean {
  return ROLE_DEPTH_TRIGGER.test(message);
}

/** Full role depth for a team: starters + subs (games >= 1) by role. */
export function runTeamRoleDepth(message: string, bundle: SliceBundle): ToolResult | null {
  if (!ROLE_DEPTH_TRIGGER.test(message)) return null;
  const teams = extractTeams(message, bundle.teams);
  if (!teams.length) return null;

  const roleMatch = message.match(/\b(top|jungle|jng|mid|adc|bot|support|sup)\b/i);
  const role = roleMatch ? normalizeRole(roleMatch[1]!) ?? undefined : undefined;

  const depth = getTeamRosterDepth(bundle, teams[0]!.name, role);
  const roles = role ? [role] : ["top", "jungle", "mid", "adc", "support"];

  const byRole = roles
    .map((r) => {
      const starter = depth.starters.find((s) => s.position === r);
      const subs = depth.subsByRole[r] ?? [];
      if (!starter && !subs.length) return null;
      return {
        role: r,
        starter: starter ? { name: starter.name, games: starter.games } : null,
        subs: subs.map((s) => ({ name: s.name, games: s.games })),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!byRole.length) return null;

  return {
    tool: "team_role_depth",
    data: {
      split: bundle.split,
      team: depth.team,
      league: teams[0]!.league,
      roleFilter: role ?? "all",
      depth: byRole,
      note:
        "subs are players with >= 1 game who are not the starter at that role. label them 'sub' with game counts. do not invent subs not listed here.",
      source: "oe_slices.rosterDepth",
    },
  };
}

export function runSeriesRecap(message: string, bundle: SliceBundle): ToolResult | null {
  if (!/\b(series|what happened|recent match|last match|bo[135])\b/i.test(message)) return null;
  const teams = extractTeams(message, bundle.teams);
  if (teams.length < 2) return null;

  const [a, b] = teams;
  const games: Array<Record<string, unknown>> = [];

  const isOpponent = (teamName: string, opp: string) => {
    const o = opp.toLowerCase();
    return o.includes(teamName.toLowerCase()) || teamName.toLowerCase().includes(o);
  };

  for (const p of bundle.players) {
    if (p.team !== a.name && p.team !== b.name) continue;
    const other = p.team === a.name ? b.name : a.name;
    for (const g of p.gameLog ?? []) {
      const opp = (g as { opponent?: string }).opponent ?? "";
      if (opp && !isOpponent(other, opp)) continue;
      const gameId = (g as { gameId?: string }).gameId ?? "";
      games.push({
        date: g.date,
        gameId,
        team: p.team,
        player: p.name,
        champion: g.champion,
        result: g.result === 1 ? "W" : "L",
        kda: g.kda,
        gd15: g.gd15,
        opponent: opp || other,
      });
    }
  }

  const byGame = new Map<string, typeof games>();
  for (const g of games) {
    const key = String(g.gameId || g.date);
    const arr = byGame.get(key) ?? [];
    arr.push(g);
    byGame.set(key, arr);
  }

  const gameSequence = [...byGame.entries()]
    .sort(([ka, aGames], [kb, bGames]) => {
      const da = String(aGames[0]?.date ?? "");
      const db = String(bGames[0]?.date ?? "");
      if (da !== db) return da.localeCompare(db);
      return ka.localeCompare(kb);
    })
    .map(([key, gms]) => ({
      gameKey: key,
      date: gms[0]?.date,
      sample: gms.slice(0, 3),
    }));

  const winsA = gameSequence.filter((g) =>
    g.sample.some((s) => s.team === a.name && s.result === "W")
  ).length;
  const winsB = gameSequence.filter((g) =>
    g.sample.some((s) => s.team === b.name && s.result === "W")
  ).length;

  return {
    tool: "series_recap",
    data: {
      split: bundle.split,
      teamA: a.name,
      teamB: b.name,
      gamesFound: gameSequence.length,
      scoreEstimate: gameSequence.length ? `${winsA}-${winsB}` : null,
      gameSequence: gameSequence.slice(0, 5),
      note: gameSequence.length
        ? "per-game stats from match data only — do not invent games not listed"
        : "no series games in current split filter — check EXTERNAL_CONTEXT or WORLD_CONTEXT for playoff results",
    },
  };
}

export function runChampionPoolCompare(message: string, bundle: SliceBundle): ToolResult | null {
  if (!/\b(champion pool|pool compare|picks on)\b/i.test(message) && !/\bcompare\b.*\bpool\b/i.test(message)) {
    return null;
  }

  const names: string[] = [];
  for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
    if (message.toLowerCase().includes(alias)) names.push(canonical);
  }

  if (names.length < 2) return null;

  const pools = names.slice(0, 2).map((n) => {
    const p = resolvePlayer(n, bundle.players);
    const champs = bundle.teamChampions.filter((tc) => p && tc.team === p.team);
    return { player: n, team: p?.team, champions: champs.slice(0, 12) };
  });

  return {
    tool: "champion_pool_compare",
    data: { split: bundle.split, pools },
  };
}

export interface AnalystContext {
  snapshot: Record<string, unknown> | null;
  tools: ToolResult[];
}

export interface BuildAnalystOptions {
  includeSnapshot?: boolean;
  widenForSeries?: boolean;
}

function resolveAnalystLeague(message: string, league: string): string {
  const leagues = ["LCK", "LPL", "LEC", "LCS"].filter((lg) =>
    new RegExp(`\\b${lg}\\b`, "i").test(message)
  );
  if (leagues.length >= 2) return "All Tier 1";
  if (leagues.length === 1) return leagues[0]!;
  if (league?.trim() && league !== "All Tier 1") return league;
  return "All Tier 1";
}

export async function buildAnalystContext(
  service: SupabaseClient,
  message: string,
  league: string,
  split: string | undefined,
  options: BuildAnalystOptions = {},
): Promise<AnalystContext> {
  const analystLeague = resolveAnalystLeague(message, league);
  const bundle = await fetchSliceBundle(service, analystLeague, split, {
    widenForSeries: options.widenForSeries,
  });
  const snapshot = options.includeSnapshot ? buildStatSnapshot(bundle) : null;
  const tools: ToolResult[] = [];

  const candidates = [
    runTeamRoleShareCompare(message, bundle),
    runPlayerChampionStat(message, bundle),
    runMentionedPlayers(message, bundle),
    runPlayerStat(message, bundle),
    runTeamStat(message, bundle),
    runTeamRankings(message, bundle),
    runTeamRoleDepth(message, bundle),
    runTeamRoster(message, bundle),
    runSeriesRecap(message, bundle),
    runChampionPoolCompare(message, bundle),
    runMatchupLookup(message, bundle),
    runPlayerRankings(message, bundle),
    runChampionMeta(message, bundle),
    runTeamForm(message, bundle),
    runLaneMatchup(message, bundle),
    await runScheduleLookup(service, message, analystLeague, bundle.split, bundle.teams),
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
  const out: Record<string, unknown> = {};
  if (ctx.snapshot) out.overview = ctx.snapshot;
  if (ctx.tools.length) {
    out.tools = ctx.tools.map((t) => ({ tool: t.tool, ...t.data }));
  }
  return out;
}
