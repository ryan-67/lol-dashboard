import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { messageMentionsPlayerToken } from "./agentIdentity.ts";
import {
  type SliceBundle,
  buildStatSnapshot,
  fetchMultiSplitBundle,
  fetchSliceBundle,
  getTeamRosterDepth,
  type MergedPlayer,
  type MergedTeam,
} from "./oeData.ts";
import { getPlayerRatings } from "./mlArtifacts.ts";
import { runChampionMatchupLookup } from "./championMatchupTool.ts";
import {
  extractPlayersWithClarifications,
  PLAYER_ALIASES as SHARED_PLAYER_ALIASES,
} from "./playerExtract.ts";
import {
  analyzeChampionCareer,
  extractChampionName,
  isChampionCareerQuestion,
  isHistoricalQuestion,
} from "./historicalAnalysis.ts";

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
  ...SHARED_PLAYER_ALIASES,
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
  roleRelevantStats,
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

/** Resolve role from message without mistaking "top 10" for the top lane. */
function roleFromMessage(message: string): string | null {
  if (/\b(jungle|jng)\b/i.test(message)) return "jungle";
  if (/\bmid(?:\s*laners?)?\b/i.test(message)) return "mid";
  if (/\b(adcs?|bot(?:\s*laners?)?)\b/i.test(message)) return "adc";
  if (/\b(support|sup)\b/i.test(message)) return "support";
  // "top laners" / "top lane" — not "top 10"
  if (/\btop\s*(?:lane|laners?|side)\b/i.test(message)) return "top";
  if (/\btop\b/i.test(message) && !/\btop\s*\d+/i.test(message)) return "top";
  return null;
}

/** nucky prediction-model role power rankings (player_ratings artifact). */
export function runMlPlayerPowerRankings(message: string): ToolResult | null {
  const wantsPower = /\bpower\s*rank(?:ing)?s?\b/i.test(message);
  const wantsTopN = /\btop\s*\d+\b/i.test(message);
  const wantsBest =
    /\b(best\s+(?:mid|jungle|jng|top|adc|bot|support|sup|player)|who'?s?\s+been\s+the\s+best)\b/i.test(
      message,
    );
  if (!wantsPower && !wantsBest && !(wantsTopN && roleFromMessage(message))) {
    return null;
  }

  const roleFilter = roleFromMessage(message);
  const wantOverall =
    /\b(best\s+player|who'?s?\s+been\s+the\s+best)\b/i.test(message) && !roleFilter;

  const topNMatch = message.match(/\btop\s*(\d+)\b/i);
  const topN = Math.min(Math.max(Number(topNMatch?.[1] ?? 10), 3), 25);

  const snap = getPlayerRatings();
  const allRoles = ["top", "jungle", "mid", "adc", "support"] as const;
  /** Match dashboard powerScoreTo100 (floor -0.25, ceiling 0.55). */
  const to100 = (powerScore: number) =>
    Math.round(Math.max(0, Math.min(100, ((powerScore - -0.25) / 0.8) * 100)) * 10) / 10;

  if (roleFilter) {
    const ranked = (snap.roles[roleFilter] ?? []).slice(0, topN);
    if (!ranked.length) return null;
    return {
      tool: "ml_player_power",
      data: {
        version: snap.version,
        generatedAt: snap.generatedAt,
        methodology: snap.methodology,
        role: roleFilter,
        ranking: "top_by_power_score",
        note: "Cite powerScore100 (/100, dashboard scale) + rank/team/region. Tier-1 domestic orgs only — never call CBLOL/LLA players LCS.",
        players: ranked.map((e) => ({
          rank: e.rank,
          player: e.player,
          team: e.team,
          region: e.region,
          role: roleFilter,
          games: e.games,
          powerScore: e.powerScore,
          powerScore100: to100(e.powerScore),
        })),
      },
    };
  }

  const entries = allRoles.flatMap((role) =>
    (snap.roles[role] ?? []).map((e) => ({ ...e, role })),
  );
  if (!entries.length) return null;
  const slice = [...entries]
    .sort((a, b) => b.powerScore - a.powerScore)
    .slice(0, topN)
    .map((e, idx) => ({
      rank: idx + 1,
      player: e.player,
      team: e.team,
      region: e.region,
      role: e.role,
      games: e.games,
      powerScore: e.powerScore,
      powerScore100: to100(e.powerScore),
    }));

  return {
    tool: "ml_player_power",
    data: {
      version: snap.version,
      generatedAt: snap.generatedAt,
      methodology: snap.methodology,
      role: wantOverall || wantsPower ? "all" : "all",
      ranking: "top_by_power_score",
      note: "Cite powerScore100 (/100, dashboard scale) + rank/team/region. Tier-1 domestic orgs only.",
      players: slice,
    },
  };
}

export function runPlayerRankings(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  if (isTeamShareCompareAsk(message, bundle)) return null;

  if (
    !/\b(overrated|underrated|best|worst|top|rank|mvp|goat|power\s*rank|fraudulent|fraud|frauds?|bum|bums|inters?|trash|flop|underperform|exposed|mid\b|adc|bot|support|jungle)\b/i
      .test(message)
  ) {
    return null;
  }

  const roleFilter = roleFromMessage(message);

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

  const wantFraud =
    /\b(overrated|fraudulent|fraud|frauds?|exposed|cosplay)\b/i.test(message);
  const wantWorst =
    !wantFraud &&
    /\b(worst|bottom|flop|underperform|bum|bums|inters?|trash)\b/i.test(message);

  // Fraud/overrated ≠ "worst stats on bad teams". Restrict to players on
  // mid/upper table teams whose individual impact lags role + team expectation.
  if (wantFraud) {
    const teamByName = new Map(bundle.teams.map((t) => [t.name, t]));
    const leaguePools = new Map<string, MergedTeam[]>();
    for (const t of bundle.teams) {
      const arr = leaguePools.get(t.league) ?? [];
      arr.push(t);
      leaguePools.set(t.league, arr);
    }
    const medianWr = (league: string): number => {
      const rows = [...(leaguePools.get(league) ?? [])].sort((a, b) => a.winrate - b.winrate);
      if (!rows.length) return 50;
      return rows[Math.floor(rows.length / 2)]!.winrate;
    };

    const scored = pool
      .map((p) => {
        const team = teamByName.get(p.team);
        const teamWr = team?.winrate ?? 0;
        const med = medianWr(p.league);
        const rolePeers = pool.filter((x) => normalizeRole(x.position) === normalizeRole(p.position));
        const peerScores = rolePeers.map((x) => playerScoreForRanking(x, roleFilter, false));
        const peerMean = peerScores.length
          ? peerScores.reduce((a, b) => a + b, 0) / peerScores.length
          : 0;
        const playerScore = playerScoreForRanking(p, roleFilter, false);
        const teamExpect = (teamWr - med) / 25; // ~+/- band from median WR
        const gap = teamExpect - (playerScore - peerMean); // high = underperforms expectation
        return {
          ...p,
          score: playerScore,
          carryScore: adcCarryScore(p),
          teamWinrate: teamWr,
          fraudGap: gap,
          eligible: teamWr >= med - 2 && (team?.games ?? 0) >= 8,
        };
      })
      .filter((p) => p.eligible && p.fraudGap > 0.05)
      .sort((a, b) => b.fraudGap - a.fraudGap);

    const slice = scored.slice(0, 8);
    if (slice.length < 2) {
      return {
        tool: "player_rankings",
        data: {
          split: bundle.split,
          league: bundle.league,
          role: roleFilter ?? "all",
          ranking: "fraud_overrated_contextual",
          note:
            "No clear fraud/overrated candidates under contextual rules (need mid/upper-table teams with individual underperformance vs role peers). Do NOT list bottom-feeders on last-place teams as frauds.",
          players: [],
        },
      };
    }

    return {
      tool: "player_rankings",
      data: {
        split: bundle.split,
        league: bundle.league,
        role: roleFilter ?? "all",
        ranking: "fraud_overrated_contextual",
        scoring:
          "fraud/overrated = mid/upper-table team + ROLE-AWARE individual score lagging role-peer mean. Role lenses: top=laning diffs; jungle=KP/early; mid=laning+dmg; adc=DPM/dmg%/gold%; support=KP/KDA/vision ONLY (never dmg/dpm/dmg-gold). Bottom teams are NOT frauds just for bad box scores.",
        note:
          "Cite only roleRelevantStats for each player. NEVER call a support a fraud for low dmgShare/dpm/dmgGoldRatio — those metrics are irrelevant for support.",
        players: slice.map((p) => ({
          ...roleRelevantStats(p),
          teamWinrate: p.teamWinrate,
          fraudGap: Math.round(p.fraudGap * 1000) / 1000,
          score: Math.round(p.score * 1000) / 1000,
          // ADC-only carryScore; omit misleading carry framing for other roles.
          ...(normalizeRole(p.position) === "adc"
            ? { carryScore: Math.round(p.carryScore * 1000) / 1000 }
            : {}),
        })),
      },
    };
  }

  const ranked = [...pool]
    .map((p) => ({
      ...p,
      score: playerScoreForRanking(p, roleFilter, wantWorst),
      carryScore: adcCarryScore(p),
    }))
    .sort((a, b) => (wantWorst ? a.score - b.score : b.score - a.score));

  const slice = ranked.slice(0, 10);

  return {
    tool: "player_rankings",
    data: {
      split: bundle.split,
      league: bundle.league,
      role: roleFilter ?? "all",
      ranking: wantWorst ? "bottom_by_role_score" : "top_by_role_score",
      top_teams_filter: topTeamsFilter,
      top_teams_standings: topTeamsMeta,
      top_teams_definition: topTeamsFilter
        ? `top ${topTeamsFilter.length} teams by winrate in ${rankingLeague} standings`
        : null,
      scoring: scoringNote(roleFilter, wantWorst),
      note: "use team field exactly; for ADC impact lean on dmgShare and goldShare in output",
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
  if (
    !/\b(form|streak|recent|last \d|momentum|hot|cold|this week|lately|right now|currently)\b/i
      .test(message)
  ) {
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

  // Current SoR: cito_schedules is fed by the Riot GW warehouse sync (docs/nucky_v4.md §15.2).
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const warehouseQuery = service
    .from("cito_schedules")
    .select(
      "league, tournament_name, block_name, team_a, team_b, scheduled_at, status, team_a_score, team_b_score, best_of",
    )
    .in("status", ["scheduled", "live", "unstarted", "tbd"])
    .gte("scheduled_at", sinceIso)
    .order("scheduled_at", { ascending: true })
    .limit(15);
  if (leagueFilter) {
    warehouseQuery.eq("league", leagueFilter);
  } else if (league !== "All Tier 1") {
    warehouseQuery.eq("league", league);
  }

  const warehouse = await warehouseQuery;
  let rows: Array<Record<string, unknown>> = warehouse.error ? [] : warehouse.data ?? [];
  let source = "cito_schedules (riot gw warehouse)";

  // Legacy fallback (rag-indexer esports_schedules) when the warehouse has nothing.
  if (!rows.length) {
    const legacyQuery = service
      .from("esports_schedules")
      .select("league, split, team_a, team_b, scheduled_at, status, score, source_url")
      .order("scheduled_at", { ascending: true })
      .limit(15);
    if (leagueFilter) {
      legacyQuery.eq("league", leagueFilter);
    } else if (league !== "All Tier 1") {
      legacyQuery.eq("league", league);
    }
    if (split) legacyQuery.eq("split", split);

    const legacy = await legacyQuery;
    if (legacy.error) {
      return {
        tool: "schedule_lookup",
        data: {
          split,
          league,
          matches: [],
          note: `schedule tables unavailable: ${warehouse.error?.message ?? ""} / ${legacy.error.message}`,
        },
      };
    }
    rows = legacy.data ?? [];
    source = "esports_schedules";
  }

  const mentionedTeams = extractTeams(message, teamsForFilter);
  if (mentionedTeams.length) {
    const names = new Set(mentionedTeams.map((t) => t.name.toLowerCase()));
    rows = rows.filter(
      (r) =>
        names.has(String(r.team_a ?? "").toLowerCase()) ||
        names.has(String(r.team_b ?? "").toLowerCase()),
    );
  }

  return {
    tool: "schedule_lookup",
    data: {
      split,
      league: leagueFilter ?? league,
      matches: rows,
      source,
    },
  };
}

/**
 * Completed series results from the Riot GW warehouse (`cito_schedules`).
 * Answers "who won in the LCK this weekend?" without waiting for OE shards.
 */
export async function runRecentResults(
  service: SupabaseClient,
  message: string,
  league: string,
): Promise<ToolResult | null> {
  const asksResults = /\b(who won|winners?|results?|scores?|standings)\b/i.test(message);
  const asksRecent =
    /\b(weekend|this week|past week|last week|recent|recently|lately|yesterday|today|last few days)\b/i
      .test(message);
  if (!asksResults || !asksRecent) return null;

  const leagueFilter = message.match(/\b(LCK|LPL|LEC|LCS)\b/i)?.[1]?.toUpperCase();
  const sinceDays = /\b(month|monthly|past 30)\b/i.test(message) ? 30 : 14;
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const query = service
    .from("cito_schedules")
    .select(
      "league, tournament_name, block_name, team_a, team_b, scheduled_at, status, team_a_score, team_b_score, winner_team, best_of",
    )
    .in("status", ["completed", "finished", "done"])
    .gte("scheduled_at", sinceIso)
    .order("scheduled_at", { ascending: false })
    .limit(20);
  if (leagueFilter) {
    query.eq("league", leagueFilter);
  } else if (league !== "All Tier 1") {
    query.eq("league", league);
  }

  const { data, error } = await query;
  if (error) {
    return {
      tool: "recent_results",
      data: { league, series: [], note: `results table unavailable: ${error.message}` },
    };
  }

  const rows = (data ?? []).map((r) => ({
    league: r.league,
    tournament: r.tournament_name ?? r.block_name ?? null,
    teamA: r.team_a,
    teamB: r.team_b,
    score: typeof r.team_a_score === "number" && typeof r.team_b_score === "number"
      ? `${r.team_a_score}-${r.team_b_score}`
      : null,
    winner: r.winner_team ?? null,
    date: typeof r.scheduled_at === "string" ? r.scheduled_at.slice(0, 10) : null,
    bestOf: r.best_of ?? null,
  }));

  return {
    tool: "recent_results",
    data: {
      league: leagueFilter ?? league,
      sinceDays,
      series: rows,
      source: "cito_schedules (riot gw warehouse)",
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

function messageMentionsToken(message: string, token: string): boolean {
  return messageMentionsPlayerToken(message, token);
}

function resolvePlayerFromMessage(message: string, players: MergedPlayer[]): MergedPlayer | null {
  for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
    if (messageMentionsToken(message, alias)) {
      const p = resolvePlayer(canonical, players);
      if (p) return p;
    }
  }
  const sorted = [...players].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    if (p.games < 1) continue;
    if (messageMentionsToken(message, p.name)) return p;
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
  const wantsStrongest =
    /\b(strongest|best|dominant|looked\s+best|who\s+(?:looked|was)\s+strong)\b/i.test(message);
  if (
    !wantsStrongest &&
    (!/\b(best|worst|top|rank|objective|control|economy)\b/i.test(message) || !/\bteam/i.test(message))
  ) {
    return null;
  }
  if (wantsStrongest && /\b(player|mid|jungle|adc|support)\b/i.test(message) && !/\bteam/i.test(message)) {
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
  /** Career / multi-year merge of OE slices. */
  multiSplit?: boolean;
  years?: string[];
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

function runEntityClarifications(
  message: string,
  bundle: SliceBundle,
  league: string,
): ToolResult | null {
  const { clarifications } = extractPlayersWithClarifications(
    message,
    bundle.players,
    league,
  );
  if (!clarifications.length) return null;
  return {
    tool: "entity_clarify",
    data: {
      note:
        "Ambiguous or missing player identity — ask which player (name · team · league · role) before asserting stats.",
      clarifications: clarifications.map((c) => ({
        query: c.name,
        candidates: c.candidates.map((x) => ({
          name: x.name,
          team: x.team,
          league: x.league,
          position: x.position,
          games: x.games,
        })),
        missingInSlice: c.candidates.length === 0,
      })),
      source: "oe_slices.players",
    },
  };
}

function runChampionCareerTool(
  message: string,
  bundle: SliceBundle,
): ToolResult | null {
  if (!isChampionCareerQuestion(message) && !isHistoricalQuestion(message)) return null;
  const champs = bundle.champions.map((c) => c.name);
  const champion = extractChampionName(message, champs);
  if (!champion) return null;

  const { players, clarifications } = extractPlayersWithClarifications(
    message,
    bundle.players,
  );
  if (clarifications.length) return null;
  const player = players[0];
  if (!player) return null;

  const career = analyzeChampionCareer(bundle.players, player.name, champion);
  if (!career) return null;
  return {
    tool: "champion_career",
    data: { ...career, split: bundle.split, league: bundle.league },
  };
}

export async function buildAnalystContext(
  service: SupabaseClient,
  message: string,
  league: string,
  split: string | undefined,
  options: BuildAnalystOptions = {},
): Promise<AnalystContext> {
  const analystLeague = resolveAnalystLeague(message, league);
  const useMulti =
    options.multiSplit ||
    isHistoricalQuestion(message) ||
    isChampionCareerQuestion(message);

  const bundle = useMulti
    ? await fetchMultiSplitBundle(
      service,
      analystLeague,
      options.years?.length ? options.years : "ALL",
    )
    : await fetchSliceBundle(service, analystLeague, split, {
      widenForSeries: options.widenForSeries,
    });
  const snapshot = options.includeSnapshot ? buildStatSnapshot(bundle) : null;
  const tools: ToolResult[] = [];

  const champMatchup = runChampionMatchupLookup(message);
  const clarify = runEntityClarifications(message, bundle, analystLeague);

  // When entity is ambiguous, prefer clarify over inventing a max-games pick.
  const rawCandidates: Array<ToolResult | null> = clarify
    ? [
      clarify,
      await runRecentResults(service, message, analystLeague),
      await runScheduleLookup(service, message, analystLeague, bundle.split, bundle.teams),
    ]
    : [
      runChampionCareerTool(message, bundle),
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
      champMatchup
        ? { tool: champMatchup.tool, data: champMatchup.data }
        : null,
      runMlPlayerPowerRankings(message),
      runPlayerRankings(message, bundle),
      runChampionMeta(message, bundle),
      runTeamForm(message, bundle),
      runLaneMatchup(message, bundle),
      await runRecentResults(service, message, analystLeague),
      await runScheduleLookup(service, message, analystLeague, bundle.split, bundle.teams),
    ];
  const candidates = rawCandidates.filter((t): t is ToolResult => t !== null);

  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c || seen.has(c.tool)) continue;
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
