/** Verified Worlds winners + Finals MVP + player title counts. Source: Liquipedia / Riot. */

export interface WorldsChampionEntry {
  year: number;
  season: number;
  team: string;
  finalsMvp: string;
  region: string;
}

/** Curated facts — do not infer MVPs from training memory. */
export const WORLDS_CHAMPIONS: WorldsChampionEntry[] = [
  { year: 2018, season: 8, team: "Invictus Gaming", finalsMvp: "Ning", region: "LPL" },
  { year: 2019, season: 9, team: "FunPlus Phoenix", finalsMvp: "Tian", region: "LPL" },
  { year: 2020, season: 10, team: "DAMWON Gaming", finalsMvp: "Canyon", region: "LCK" },
  { year: 2021, season: 11, team: "EDward Gaming", finalsMvp: "Scout", region: "LPL" },
  { year: 2022, season: 12, team: "DRX", finalsMvp: "Kingen", region: "LCK" },
  { year: 2023, season: 13, team: "T1", finalsMvp: "Zeus", region: "LCK" },
  { year: 2024, season: 14, team: "T1", finalsMvp: "Faker", region: "LCK" },
  { year: 2025, season: 15, team: "T1", finalsMvp: "Gumayusi", region: "LCK" },
];

/**
 * Player World Championship title counts (summoner's cup as a starter).
 * Keep curated — career title asks must NOT fall back to stale LLM memory.
 */
export const PLAYER_WORLDS_TITLES: Record<
  string,
  { player: string; count: number; years: number[]; note?: string }
> = {
  faker: {
    player: "Faker",
    count: 6,
    years: [2013, 2015, 2016, 2023, 2024, 2025],
    note: "Six World Championships with T1 / SKT (2013, 2015, 2016, 2023, 2024, 2025).",
  },
  canyon: { player: "Canyon", count: 1, years: [2020] },
  showmaker: { player: "ShowMaker", count: 1, years: [2020] },
  scout: { player: "Scout", count: 1, years: [2021] },
  kingen: { player: "Kingen", count: 1, years: [2022] },
  zeus: { player: "Zeus", count: 2, years: [2023, 2024] },
  oner: { player: "Oner", count: 3, years: [2023, 2024, 2025] },
  gumayusi: { player: "Gumayusi", count: 3, years: [2023, 2024, 2025] },
  keria: { player: "Keria", count: 3, years: [2023, 2024, 2025] },
  doran: { player: "Doran", count: 1, years: [2025] },
};

const WORLDS_HISTORY =
  /\b(worlds|world championship|worlds championship)\b/i;

const WORLDS_LIST_INTENT =
  /\b(list|every team|all teams|each year|since season|from season|season \d|winners?|won worlds|world champions?|finals mvp|fmvp|mvp for each|champion.*mvp)\b/i;

const PLAYER_TITLE_INTENT =
  /\b(how many|titles?|championships?|cups?|trophy|trophies|times?)\b/i;

/** User wants a Worlds winner / Finals MVP historical list (not current-split stats). */
export function isWorldsHistoryQuestion(message: string): boolean {
  if (!WORLDS_HISTORY.test(message)) return false;
  if (isPlayerWorldsTitleQuestion(message)) return true;
  return WORLDS_LIST_INTENT.test(message) ||
    /\bwho won\b/i.test(message) ||
    /\bwhich team won\b/i.test(message);
}

/** "how many worlds has faker won?" */
export function isPlayerWorldsTitleQuestion(message: string): boolean {
  if (!WORLDS_HISTORY.test(message) && !/\bworld championships?\b/i.test(message)) {
    return false;
  }
  if (!PLAYER_TITLE_INTENT.test(message) && !/\bhas .+ won\b/i.test(message)) {
    return false;
  }
  return Boolean(extractTitlePlayerKey(message));
}

function extractTitlePlayerKey(message: string): string | null {
  const lower = message.toLowerCase();
  for (const key of Object.keys(PLAYER_WORLDS_TITLES)) {
    if (lower.includes(key)) return key;
  }
  return null;
}

function parseSeasonFloor(message: string): number {
  const since = message.match(/\bsince season\s*(\d{1,2})\b/i);
  if (since) return parseInt(since[1]!, 10);
  const from = message.match(/\bfrom season\s*(\d{1,2})\b/i);
  if (from) return parseInt(from[1]!, 10);
  const s8 = message.match(/\bseason\s*8\b/i);
  if (s8) return 8;
  return 8;
}

function parseYearFloor(message: string): number | null {
  const m = message.match(/\bsince\s*(20\d{2})\b/i);
  return m ? parseInt(m[1]!, 10) : null;
}

export function lookupWorldsHistory(message: string): {
  tool: string;
  data: Record<string, unknown>;
} {
  const playerKey = extractTitlePlayerKey(message);
  if (playerKey && isPlayerWorldsTitleQuestion(message)) {
    const row = PLAYER_WORLDS_TITLES[playerKey]!;
    return {
      tool: "player_worlds_titles",
      data: {
        source: "verified_worlds_records",
        player: row.player,
        worldsTitles: row.count,
        years: row.years,
        note: row.note ??
          `Cite worldsTitles=${row.count} and years exactly. Do not invent additional cups.`,
      },
    };
  }

  const seasonFloor = parseSeasonFloor(message);
  const yearFloor = parseYearFloor(message);

  let rows = WORLDS_CHAMPIONS.filter((e) => e.season >= seasonFloor);
  if (yearFloor != null) {
    rows = rows.filter((e) => e.year >= yearFloor);
  }

  return {
    tool: "worlds_history",
    data: {
      source: "verified_worlds_records",
      note:
        "Finals MVP is the official OPPO/Riot Finals MVP award — NOT the best-performing star by eye test (e.g. 2019 MVP is Tian not Doinb; 2022 MVP is Kingen not Zeka). Player title counts (e.g. Faker = 6) use player_worlds_titles when asked.",
      seasonFloor,
      yearFloor,
      champions: rows.map((e) => ({
        year: e.year,
        season: e.season,
        team: e.team,
        region: e.region,
        finalsMvp: e.finalsMvp,
      })),
    },
  };
}
