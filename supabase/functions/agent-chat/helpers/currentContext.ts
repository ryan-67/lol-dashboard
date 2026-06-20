import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTemporalContext, type TemporalContext } from "./worldContext.ts";
import {
  fetchSliceBundle,
  resolveSplit,
  type MergedPlayer,
  type RosterDepthEntry,
  type SliceBundle,
} from "./oeData.ts";

const ROLE_ORDER = ["top", "jungle", "mid", "adc", "support"] as const;

function normalizeFallbackRole(position: string): string | null {
  const pos = position.toLowerCase();
  if (pos === "top") return "top";
  if (pos === "jungle" || pos === "jng") return "jungle";
  if (pos === "mid") return "mid";
  if (pos === "adc" || pos === "bot") return "adc";
  if (pos === "support" || pos === "sup") return "support";
  return null;
}

/** Roster depth from the slice, falling back to players (games>=5) before a reseed. */
function resolveRosterDepth(bundle: SliceBundle): RosterDepthEntry[] {
  if (bundle.rosterDepth.length) return bundle.rosterDepth;

  const bySlot = new Map<string, MergedPlayer[]>();
  for (const p of bundle.players) {
    if (p.games < 1) continue;
    const role = normalizeFallbackRole(p.position);
    if (!role) continue;
    const slot = `${p.team}|${p.league}|${role}`;
    const arr = bySlot.get(slot) ?? [];
    arr.push(p);
    bySlot.set(slot, arr);
  }
  const out: RosterDepthEntry[] = [];
  for (const [slot, group] of bySlot) {
    const [, , role] = slot.split("|");
    const sorted = [...group].sort((a, b) => b.games - a.games);
    sorted.forEach((p, idx) => {
      out.push({
        name: p.name,
        team: p.team,
        league: p.league,
        position: role!,
        games: p.games,
        isStarter: idx === 0,
        isSub: idx !== 0,
      });
    });
  }
  return out;
}

export interface PlayerTeamRecord {
  name: string;
  team: string;
  league: string;
  position: string;
  games: number;
  isStarter: boolean;
}

function rosterLines(roster: RosterDepthEntry[], teamName: string, league: string): string | null {
  const onTeam = roster.filter((p) => p.team === teamName && p.league === league);
  if (!onTeam.length) return null;

  const parts: string[] = [];
  for (const role of ROLE_ORDER) {
    const atRole = onTeam
      .filter((p) => p.position === role)
      .sort((a, b) => b.games - a.games);
    if (!atRole.length) continue;

    const primary = atRole[0]!;
    let line = `${role}: ${primary.name} (${primary.games}g, starter)`;

    // Subs visible at >= 1 game (was >= 5) so backups stay grounded.
    const subs = atRole.slice(1).filter((p) => p.games >= 1);
    if (subs.length) {
      line += `; also ${subs.map((s) => `${s.name} (sub, ${s.games}g)`).join(", ")}`;
    }
    parts.push(line);
  }

  if (!parts.length) return null;
  return `- ${teamName} (${league}): ${parts.join(" | ")}`;
}

export interface CurrentContextResult {
  temporal: TemporalContext;
  /** Factual roster/index data only (user message). */
  worldBlock: string;
  worldDataBlock: string;
  /** Developer grounding rules (system message only). */
  worldRulesBlock: string;
  split: string;
  playerTeamIndex: Record<string, PlayerTeamRecord>;
}

export async function buildCurrentWorldContext(
  service: SupabaseClient,
  clientNow: string | undefined,
  splitHint?: string,
): Promise<CurrentContextResult> {
  const temporal = buildTemporalContext(clientNow);
  const split = await resolveSplit(service, splitHint);
  const bundle = await fetchSliceBundle(service, "All Tier 1", split);
  const rosterDepth = resolveRosterDepth(bundle);

  // Build index from rosterDepth (includes subs at >= 1 game) so backups are resolvable.
  const playerTeamIndex: CurrentContextResult["playerTeamIndex"] = {};
  for (const p of rosterDepth) {
    if (p.games < 1) continue;
    const key = p.name.toLowerCase();
    const prev = playerTeamIndex[key];
    if (!prev || p.games >= prev.games) {
      playerTeamIndex[key] = {
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position,
        games: p.games,
        isStarter: p.isStarter,
      };
    }
  }

  const teamKeys = new Map<string, { name: string; league: string }>();
  for (const t of bundle.teams) {
    teamKeys.set(`${t.name}|${t.league}`, { name: t.name, league: t.league });
  }

  const rosterLinesOut: string[] = [];
  const sortedTeams = [...teamKeys.values()].sort((a, b) =>
    a.league.localeCompare(b.league) || a.name.localeCompare(b.name)
  );
  for (const { name, league } of sortedTeams) {
    const line = rosterLines(rosterDepth, name, league);
    if (line) rosterLinesOut.push(line);
  }

  const indexLines = Object.values(playerTeamIndex)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((info) =>
      `${info.name} → ${info.team} (${info.league}, ${info.position}, ${info.games}g${
        info.isStarter ? ", starter" : ", sub"
      })`
    )
    .join("\n");

  const worldDataBlock = `${temporal.block}
[DATA_SCOPE] current_split: ${split}
current_rosters (${split}, from match data):
${rosterLinesOut.join("\n")}
player_team_index (${split}, 1+ games incl. subs):
${indexLines}`;

  const worldRulesBlock = `[GROUNDING_RULES]
default_data_scope: CURRENT SPLIT ONLY — ${split}. Unless the user explicitly asks about a past year/split, use ${split} data only.
training_data_warning: Pretrained roster memory is STALE. NEVER assign players to teams from memory. Verify every player-team claim against player_team_index or current_rosters below — including subs with split time listed by game count.
roster_rule: starter = most games at role on team in ${split} match data. Subs are labeled (sub, Ng). If two players share a role, cite both with game counts — do not guess from old transfers.
per_game_stats_rule: Do NOT cite specific game stats unless they appear in MATCH_STATS. Do NOT invent GD@15, KDA lines, or betting odds.
foreign_entity_rule: If the user names a champion/hero from another game (e.g. Invoker from Dota), refuse — do NOT invent League stats for it.`;

  const worldBlock = worldDataBlock;

  return { temporal, worldBlock, worldDataBlock, worldRulesBlock, split, playerTeamIndex };
}

/** Resolve players mentioned in the user message against verified roster index */
export function lookupPlayersInMessage(
  message: string,
  index: Record<string, PlayerTeamRecord>,
): PlayerTeamRecord[] {
  const lower = message.toLowerCase();
  const found: PlayerTeamRecord[] = [];
  const seen = new Set<string>();

  for (const info of Object.values(index)) {
    const key = info.name.toLowerCase();
    if (seen.has(key)) continue;
    if (lower.includes(key)) {
      seen.add(key);
      found.push(info);
    }
  }
  return found;
}

export function formatMentionedRosterBlock(players: PlayerTeamRecord[]): string {
  if (!players.length) return "";
  const lines = players.map(
    (p) =>
      `- ${p.name}: ${p.team} (${p.league}, ${p.position}, ${p.games}g${
        p.isStarter ? ", starter" : ", sub"
      })`,
  );
  return `[MENTIONED_PLAYERS_ROSTER]\n${lines.join("\n")}`;
}
