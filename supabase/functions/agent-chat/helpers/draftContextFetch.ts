/**
 * Fetch OE stats + pgvector RAG context for a structured draft extraction.
 * Weights recent splits heavier for team form and player-champion proficiency.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { DraftExtraction } from "./draftTypes.ts";
import {
  fetchSliceBundle,
  getTeamRosterDepth,
  type SliceBundle,
} from "./oeData.ts";
import { vectorSearch } from "./tools.ts";
import type { UsageTracker } from "./usageTracker.ts";

const RECENT_SPLIT_LIMIT = 4;

function normTeam(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveTeamInBundle(bundle: SliceBundle, teamName: string) {
  const target = normTeam(teamName);
  if (!target || /blueside|redside/.test(target)) return null;

  const exact = bundle.teams.find((t) => normTeam(t.name) === target);
  if (exact) return exact;

  // Prefix / substring match handles abbreviations (BLG, G2, C9) vs full OE names
  const fuzzy = bundle.teams.filter((t) => {
    const n = normTeam(t.name);
    return n.includes(target) || target.includes(n);
  });
  if (fuzzy.length === 1) return fuzzy[0]!;
  if (fuzzy.length > 1) {
    return fuzzy.sort((a, b) => normTeam(a.name).length - normTeam(b.name).length)[0]!;
  }
  return null;
}

function championMeta(bundle: SliceBundle, names: string[]) {
  const lower = new Set(names.map((n) => n.toLowerCase()));
  return bundle.champions
    .filter((c) => lower.has(c.name.toLowerCase()))
    .map((c) => ({
      champion: c.name,
      split: bundle.split,
      picks: c.picks,
      bans: c.bans,
      presence: c.presence,
      winrate: c.winrate,
      pickrate: c.pickrate,
      banrate: c.banrate,
    }));
}

function playerChampionStats(
  bundle: SliceBundle,
  teamName: string,
  champions: string[],
): Array<Record<string, unknown>> {
  const roster = getTeamRosterDepth(bundle, teamName);
  const champSet = new Set(champions.map((c) => c.toLowerCase()));
  const out: Array<Record<string, unknown>> = [];

  for (const starter of roster.starters) {
    const player = bundle.players.find(
      (p) => p.name === starter.name && normTeam(p.team) === normTeam(teamName),
    );
    if (!player) continue;

    for (const champ of champions) {
      if (!champSet.has(champ.toLowerCase())) continue;
      const games = (player.gameLog ?? []).filter(
        (g) => g.champion.toLowerCase() === champ.toLowerCase(),
      );
      if (!games.length) continue;
      const wins = games.filter((g) => g.result === 1).length;
      out.push({
        player: player.name,
        team: player.team,
        position: player.position,
        champion: champ,
        gamesOnChampion: games.length,
        winrateOnChampion: Math.round((wins / games.length) * 1000) / 10,
        splitGamesOverall: player.games,
        splitKda: player.kda,
        split: bundle.split,
        weight: bundle.split.includes(String(new Date().getUTCFullYear())) ? 1.0 : 0.6,
      });
    }
  }
  return out;
}

function teamCompHistory(
  bundle: SliceBundle,
  teamName: string,
  champions: string[],
): Record<string, unknown> | null {
  const team = resolveTeamInBundle(bundle, teamName);
  if (!team) return null;

  const champSet = new Set(champions.map((c) => c.toLowerCase()));
  const compGames = bundle.teamChampions.filter(
    (tc) =>
      normTeam(tc.team) === normTeam(teamName) && champSet.has(tc.champion.toLowerCase()),
  );

  return {
    team: team.name,
    league: team.league,
    split: bundle.split,
    splitWinrate: team.winrate,
    splitGames: team.games,
    splitRecord: `${team.wins}-${team.losses}`,
    draftedChampsInSplit: compGames.map((c) => ({
      champion: c.champion,
      picks: c.picks,
      winrate: c.winrate,
    })),
    weight: bundle.split.includes(String(new Date().getUTCFullYear())) ? 1.0 : 0.65,
  };
}

async function fetchRecentBundles(
  service: SupabaseClient,
  league: string,
  currentSplit: string,
): Promise<SliceBundle[]> {
  const { data } = await service.from("oe_slices").select("split").limit(500);
  const splits = [...new Set((data ?? []).map((r) => String((r as { split?: string }).split ?? "")))]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));

  const regional = splits.filter((s) => / (Spring|Summer|Winter)$/.test(s));
  const ordered = [currentSplit, ...regional.filter((s) => s !== currentSplit)].slice(
    0,
    RECENT_SPLIT_LIMIT,
  );

  const bundles: SliceBundle[] = [];
  for (const split of ordered) {
    if (!split) continue;
    try {
      bundles.push(await fetchSliceBundle(service, league, split));
    } catch {
      // skip missing slice
    }
  }
  return bundles;
}

function dedupeChampMeta(rows: Record<string, unknown>[]) {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const key = `${row.champion}|${row.split ?? ""}`;
    if (seen.has(String(key))) continue;
    seen.add(String(key));
    out.push(row);
  }
  return out;
}

function buildDraftToolPayload(
  draft: DraftExtraction,
  bundles: SliceBundle[],
): Record<string, unknown> {
  const allChamps = draft.teams.flatMap((t) => t.champions.map((c) => c.name));
  const teamBlocks: Record<string, unknown>[] = [];

  for (const side of draft.teams) {
    const champNames = side.champions.map((c) => c.name);
    const teamHistory: Record<string, unknown>[] = [];
    const playerStats: Array<Record<string, unknown>> = [];
    let meta: Record<string, unknown>[] = [];

    for (const bundle of bundles) {
      meta = [...meta, ...championMeta(bundle, champNames)];
      const hist = teamCompHistory(bundle, side.team, champNames);
      if (hist) teamHistory.push(hist);
      playerStats.push(...playerChampionStats(bundle, side.team, champNames));
    }

    teamBlocks.push({
      team: side.team,
      side: side.side,
      esportsSlug: side.esportsSlug,
      champions: side.champions,
      championMeta: dedupeChampMeta(meta),
      teamFormBySplit: teamHistory,
      playerChampionProficiency: playerStats.slice(0, 25),
    });
  }

  const teamA = draft.teams[0]!.team;
  const teamB = draft.teams[1]!.team;
  let h2h: Record<string, unknown> | null = null;
  const primary = bundles[0];
  if (primary) {
    const key = [teamA, teamB].sort().join("|");
    const mu = primary.matchups.find((m) => [m.teamA, m.teamB].sort().join("|") === key);
    if (mu) {
      h2h = {
        teamA,
        teamB,
        games: mu.games,
        winsA: mu.winsA,
        winsB: mu.winsB,
        split: primary.split,
      };
    }
  }

  return {
    tool: "draft_text_analysis",
    extraction: draft,
    teams: teamBlocks,
    headToHead: h2h,
    allChampions: allChamps,
    splitsSampled: bundles.map((b) => b.split),
    source: "oe_slices + draft_extraction",
  };
}

export async function fetchDraftAnalysisContext(
  service: SupabaseClient,
  openrouterApiKey: string,
  draft: DraftExtraction,
  league: string,
  split: string | undefined,
  usageTracker?: UsageTracker,
): Promise<{ matchStats: Record<string, unknown>; ragContext: string }> {
  const bundles = await fetchRecentBundles(service, league, split ?? "");
  const primary = bundles[0] ?? await fetchSliceBundle(service, league, split);
  const allBundles = bundles.length ? bundles : [primary];

  const matchStats = {
    tools: [buildDraftToolPayload(draft, allBundles)],
  };

  const champList = draft.teams.flatMap((t) => t.champions.map((c) => c.name)).join(", ");
  const teamList = draft.teams.map((t) => t.team).join(" vs ");
  const ragQueries = [
    `${champList} patch meta strength tier list synergies combos`,
    `${teamList} team comp win condition draft analysis`,
    `${champList} champion synergies and counters current meta`,
  ];

  const ragChunks: string[] = [];
  for (const q of ragQueries) {
    const vec = await vectorSearch(service, openrouterApiKey, q, { matchCount: 6, usageTracker });
    if (vec.ok && Array.isArray(vec.data)) {
      for (const chunk of vec.data as Array<{ content: string; source: string; title?: string }>) {
        ragChunks.push(`[${chunk.source}${chunk.title ? ` — ${chunk.title}` : ""}] ${chunk.content}`);
      }
    }
  }

  const seen = new Set<string>();
  const ragContext = ragChunks
    .filter((c) => {
      if (seen.has(c)) return false;
      seen.add(c);
      return true;
    })
    .slice(0, 14)
    .join("\n\n");

  return { matchStats, ragContext };
}
