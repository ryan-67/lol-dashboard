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
};

function wordMatch(message: string, token: string): boolean {
  if (!token) return false;
  // Agent self-name stripped + whole-token match (blocks "nuc" ⊂ "nucky").
  return messageMentionsPlayerToken(message, token);
}

export function resolvePlayer(
  name: string,
  players: MergedPlayer[],
  leagueFilter?: string,
): MergedPlayer | null {
  const alias = PLAYER_ALIASES[name.toLowerCase().trim()];
  const target = alias ?? name.trim();
  const matches = players.filter(
    (p) => p.name === target || p.name.toLowerCase() === target.toLowerCase(),
  );

  if (!matches.length) return null;

  if (leagueFilter && leagueFilter !== "All Tier 1") {
    const inLeague = matches.filter((p) => p.league === leagueFilter);
    if (inLeague.length === 1) return inLeague[0]!;
    if (inLeague.length > 1) return inLeague.sort((a, b) => b.games - a.games)[0]!;
  }

  return matches.sort((a, b) => b.games - a.games)[0] ?? null;
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

export function extractPlayers(
  message: string,
  players: MergedPlayer[],
  leagueFilter?: string,
): MergedPlayer[] {
  const searchable = stripAgentSelfMentions(message);
  const found = new Map<string, MergedPlayer>();

  for (const name of extractMentionedPlayerNames(message, players)) {
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

  return [...found.values()];
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
