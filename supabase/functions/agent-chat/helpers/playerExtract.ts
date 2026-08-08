import { messageMentionsPlayerToken, stripAgentSelfMentions } from "./agentIdentity.ts";
import type { MergedPlayer } from "./oeData.ts";

export const PLAYER_ALIASES: Record<string, string> = {
  faker: "Faker",
  chovy: "Chovy",
  canyon: "Canyon",
  showmaker: "ShowMaker",
  bin: "Bin",
  oner: "Oner",
  zeus: "Zeus",
  kiin: "Kiin",
  zeka: "Zeka",
  keria: "Keria",
  peyz: "Peyz",
  gumayusi: "Gumayusi",
  ruler: "Ruler",
  caps: "Caps",
  knight: "Knight",
  smash: "Smash",
  aiming: "Aiming",
  siwoo: "Siwoo",
  cuzz: "Cuzz",
  deokdam: "Deokdam",
  bdd: "Bdd",
  duro: "Duro",
  delight: "Delight",
  lehends: "Lehends",
  inspired: "Inspired",
  ice: "Ice",
};

const TEAM_ALIASES: Record<string, string> = {
  dk: "Dplus Kia",
  "dplus kia": "Dplus Kia",
  "dplus": "Dplus Kia",
  dwg: "Dplus Kia",
  geng: "Gen.G",
  "gen.g": "Gen.G",
  hle: "Hanwha Life Esports",
  kt: "KT Rolster",
  t1: "T1",
  g2: "G2 Esports",
  fnc: "Fnatic",
  mad: "MAD Lions",
  kc: "Karmine Corp",
  tl: "Team Liquid",
  c9: "Cloud9",
  fly: "FlyQuest",
  blg: "Bilibili Gaming",
  lng: "LNG Esports",
  tes: "Top Esports",
  jdg: "JD Gaming",
  we: "Team WE",
  ig: "Invictus Gaming",
  rng: "Royal Never Give Up",
  wbg: "Weibo Gaming",
  al: "Anyone's Legend",
};

/** Short / common-word handles that must not silently pick max-games across orgs. */
const FORCE_CLARIFY_NAMES = new Set([
  "ice",
  "inspired",
  "soft",
  "dove",
  "peace",
  "king",
  "prince",
  "ghost",
  "shadow",
  "angel",
  "devil",
  "bean",
  "potato",
  "fish",
  "wolf",
  "bear",
  "tiger",
]);

function wordMatch(message: string, token: string): boolean {
  if (!token) return false;
  return messageMentionsPlayerToken(message, token);
}

export interface PlayerCandidate {
  name: string;
  team: string;
  league: string;
  position: string;
  games: number;
}

export function listPlayerCandidates(
  name: string,
  players: MergedPlayer[],
  leagueFilter?: string,
): PlayerCandidate[] {
  const alias = PLAYER_ALIASES[name.toLowerCase().trim()];
  const target = (alias ?? name).trim();
  let matches = players.filter(
    (p) => p.name === target || p.name.toLowerCase() === target.toLowerCase(),
  );

  if (leagueFilter && leagueFilter !== "All Tier 1") {
    const inLeague = matches.filter((p) => p.league === leagueFilter);
    if (inLeague.length) matches = inLeague;
  }

  return matches
    .map((p) => ({
      name: p.name,
      team: p.team,
      league: p.league,
      position: p.position,
      games: p.games,
    }))
    .sort((a, b) => b.games - a.games);
}

export function needsPlayerClarification(
  name: string,
  candidates: PlayerCandidate[],
  message: string,
): boolean {
  if (candidates.length <= 1) return false;

  const teams = new Set(candidates.map((c) => `${c.team}|${c.league}`));
  if (teams.size <= 1) return false;

  // Team/league already named in the question → don't block.
  const lower = message.toLowerCase();
  const teamMentioned = candidates.some(
    (c) =>
      lower.includes(c.team.toLowerCase()) ||
      lower.includes(c.league.toLowerCase()) ||
      Object.entries(TEAM_ALIASES).some(
        ([alias, team]) =>
          lower.includes(alias) &&
          (team.toLowerCase() === c.team.toLowerCase() ||
            c.team.toLowerCase().includes(team.toLowerCase())),
      ),
  );
  if (teamMentioned) return false;

  const key = name.toLowerCase().trim();
  if (FORCE_CLARIFY_NAMES.has(key) || key.length <= 4) return true;

  // Distinct orgs and no dominant sample (top isn't 3× #2).
  const top = candidates[0]!;
  const second = candidates[1]!;
  if (top.games < Math.max(3, second.games * 3)) return true;
  return false;
}

export function resolvePlayer(
  name: string,
  players: MergedPlayer[],
  leagueFilter?: string,
): MergedPlayer | null {
  const candidates = listPlayerCandidates(name, players, leagueFilter);
  if (!candidates.length) return null;
  const pick = candidates[0]!;
  return (
    players.find(
      (p) => p.name === pick.name && p.team === pick.team && p.league === pick.league,
    ) ?? null
  );
}

export function extractMentionedPlayerNames(message: string, players: MergedPlayer[]): string[] {
  const searchable = stripAgentSelfMentions(message);
  const names = new Set<string>();

  for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
    if (wordMatch(searchable, alias)) names.add(canonical);
  }

  for (const player of players) {
    if (wordMatch(searchable, player.name)) {
      names.add(player.name);
    }
  }

  return [...names];
}

export interface ExtractPlayersResult {
  players: MergedPlayer[];
  clarifications: Array<{ name: string; candidates: PlayerCandidate[] }>;
}

export function extractPlayersWithClarifications(
  message: string,
  players: MergedPlayer[],
  leagueFilter?: string,
): ExtractPlayersResult {
  const searchable = stripAgentSelfMentions(message);
  const found = new Map<string, MergedPlayer>();
  const clarifications: Array<{ name: string; candidates: PlayerCandidate[] }> = [];
  const seenClarify = new Set<string>();

  for (const name of extractMentionedPlayerNames(message, players)) {
    const candidates = listPlayerCandidates(name, players, leagueFilter);
    const key = name.toLowerCase().trim();

    // Ambiguous short handles with zero hits in this slice still need a clarify
    // (e.g. "Ice stats" when Ice isn't on the current Summer OE roster).
    if (!candidates.length) {
      if (FORCE_CLARIFY_NAMES.has(key) && !seenClarify.has(key)) {
        seenClarify.add(key);
        clarifications.push({ name, candidates: [] });
      }
      continue;
    }

    if (needsPlayerClarification(name, candidates, message)) {
      if (!seenClarify.has(key)) {
        seenClarify.add(key);
        clarifications.push({ name, candidates: candidates.slice(0, 6) });
      }
      continue;
    }

    const p = resolvePlayer(name, players, leagueFilter);
    if (p) found.set(`${p.name}|${p.team}|${p.league}`, p);
  }

  for (const [teamAlias, teamName] of Object.entries(TEAM_ALIASES)) {
    if (!wordMatch(searchable, teamAlias)) continue;
    for (const name of extractMentionedPlayerNames(message, players)) {
      const onTeam = players.filter(
        (p) =>
          p.name === name &&
          (p.team === teamName ||
            p.team.toLowerCase().includes(teamName.toLowerCase()) ||
            teamName.toLowerCase().includes(p.team.toLowerCase())),
      );
      const pick = leagueFilter && leagueFilter !== "All Tier 1"
        ? onTeam.filter((p) => p.league === leagueFilter)
        : onTeam;
      if (pick.length === 1) {
        const p = pick[0]!;
        found.set(`${p.name}|${p.team}|${p.league}`, p);
      } else if (pick.length > 1) {
        const p = pick.sort((a, b) => b.games - a.games)[0]!;
        found.set(`${p.name}|${p.team}|${p.league}`, p);
      }
    }
  }

  return { players: [...found.values()], clarifications };
}

export function extractPlayers(
  message: string,
  players: MergedPlayer[],
  leagueFilter?: string,
): MergedPlayer[] {
  return extractPlayersWithClarifications(message, players, leagueFilter).players;
}

export function extractComparePlayers(
  message: string,
  players: MergedPlayer[],
  maxPlayers = 8,
): MergedPlayer[] {
  const lower = message.toLowerCase();
  if (!/\b(compare|vs\.?|versus|head.?to.?head|h2h)\b/i.test(lower)) return [];

  const found = new Map<string, MergedPlayer>();
  const mentioned = extractMentionedPlayerNames(message, players);

  for (const name of mentioned) {
    const candidates = listPlayerCandidates(name, players);
    if (needsPlayerClarification(name, candidates, message)) continue;
    const player = resolvePlayer(name, players);
    if (player) found.set(`${player.name}|${player.team}|${player.league}`, player);
  }

  return [...found.values()].slice(0, maxPlayers);
}

export function findMissingMentionedPlayers(
  message: string,
  players: MergedPlayer[],
  found: MergedPlayer[],
): string[] {
  const mentioned = extractMentionedPlayerNames(message, players);
  const foundNames = new Set(found.map((p) => p.name.toLowerCase()));
  return mentioned.filter((name) => !foundNames.has(name.toLowerCase()));
}
