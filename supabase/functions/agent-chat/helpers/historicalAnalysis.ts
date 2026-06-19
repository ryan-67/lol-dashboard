import type { MergedPlayer } from "./oeData.ts";
import type { OEFilterParams } from "./oeData.ts";

/** True when the user names a specific split (e.g. "2026 spring") — do not widen to ALL splits. */
function hasExplicitSplitScope(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b20\d{2}\s+(spring|summer|winter|fall|playoffs)\b/.test(lower) ||
    /\b(spring|summer|winter|fall|playoffs)\s+(20\d{2})\b/.test(lower) ||
    /\b(20\d{2})\s+(spring|summer|winter|fall|playoffs)\s+(lck|lpl|lec|lcs)\b/.test(lower)
  );
}

export function isHistoricalQuestion(message: string): boolean {
  const lower = message.toLowerCase();

  if (hasExplicitSplitScope(message)) return false;

  return (
    /\b(all[- ]?time|career|historical|history|ever|across (splits|years)|every split|archive|since \d{4})\b/.test(
      lower,
    ) ||
    /\bcompare\b.+\b(all[- ]?time|career|ever|across)\b/.test(lower)
  );
}

export function widenFiltersForQuestion(
  message: string,
  filters: OEFilterParams,
): OEFilterParams {
  if (!isHistoricalQuestion(message)) return filters;

  const specificSplits = filters.selectedSplits?.filter(
    (s) => s !== "ALL" && /^\d{4}\s/.test(s),
  );
  if (specificSplits?.length) {
    return { ...filters, selectedSplits: specificSplits, split: specificSplits.join(" + ") };
  }

  const yearMatches = [...message.matchAll(/\b(20\d{2})\b/g)].map((m) => m[1]!);
  const wantsAllTime = /\ball[- ]?time\b|\bcareer\b|\bever\b|\bacross\b/i.test(message);

  if (!wantsAllTime && yearMatches.length === 1) {
    return {
      ...filters,
      year: yearMatches[0],
      selectedYears: [yearMatches[0]!],
      selectedSplits: ["ALL"],
    };
  }

  if (!wantsAllTime && yearMatches.length >= 2) {
    return {
      ...filters,
      year: "ALL",
      selectedYears: [...new Set(yearMatches)],
      selectedSplits: ["ALL"],
    };
  }

  return {
    ...filters,
    year: "ALL",
    split: "ALL",
    selectedYears: ["ALL"],
    selectedSplits: ["ALL"],
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findPlayers(players: MergedPlayer[], name: string): MergedPlayer[] {
  const target = normalize(name);
  return players.filter(
    (p) => normalize(p.name) === target || normalize(p.name).includes(target),
  );
}

export function extractChampionName(
  message: string,
  knownChampions: string[],
): string | null {
  const lower = message.toLowerCase();
  const sorted = [...knownChampions].sort((a, b) => b.length - a.length);
  for (const champ of sorted) {
    if (lower.includes(champ.toLowerCase())) return champ;
  }
  const onMatch = message.match(/\bon\s+([A-Za-z][A-Za-z0-9'.\s-]{1,20})/i);
  if (onMatch?.[1]) return onMatch[1].trim();
  return null;
}

export function analyzeChampionCareer(
  players: MergedPlayer[],
  playerName: string,
  championName: string,
) {
  const matches = findPlayers(players, playerName);
  if (!matches.length) return null;

  let games = 0;
  let wins = 0;
  let kdaSum = 0;
  const splits = new Set<string>();

  for (const player of matches) {
    for (const g of player.gameLog ?? []) {
      const row = g as {
        champion?: string;
        result?: number;
        kda?: number;
        split?: string;
      };
      if (!row.champion || normalize(row.champion) !== normalize(championName)) continue;
      games++;
      if (row.result === 1) wins++;
      kdaSum += Number(row.kda ?? 0);
      if (row.split) splits.add(row.split);
    }
  }

  if (!games) return null;

  return {
    player: playerName,
    champion: championName,
    games,
    wins,
    losses: games - wins,
    winrate: Math.round((wins / games) * 1000) / 10,
    avgKda: Math.round((kdaSum / games) * 100) / 100,
    splits: [...splits].sort(),
    scope: "all indexed game logs",
    source: "oe_slices.players.gameLog",
  };
}

export function isChampionCareerQuestion(message: string): boolean {
  return (
    /\b(winrate|win rate|record|stats?|kda|games|performance)\b/i.test(message) &&
    (isHistoricalQuestion(message) || /\b(on|with|playing)\s+[A-Za-z]/i.test(message))
  );
}
