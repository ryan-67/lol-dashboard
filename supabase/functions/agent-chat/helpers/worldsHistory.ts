/** Verified Worlds winners + Finals MVP (Season 8 → present). Source: Liquipedia / Riot official records. */

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

const WORLDS_HISTORY =
  /\b(worlds|world championship|worlds championship)\b/i;

const WORLDS_LIST_INTENT =
  /\b(list|every team|all teams|each year|since season|from season|season \d|winners?|won worlds|world champions?|finals mvp|fmvp|mvp for each|champion.*mvp)\b/i;

/** User wants a Worlds winner / Finals MVP historical list (not current-split stats). */
export function isWorldsHistoryQuestion(message: string): boolean {
  if (!WORLDS_HISTORY.test(message)) return false;
  return WORLDS_LIST_INTENT.test(message) ||
    /\bwho won\b/i.test(message) ||
    /\bwhich team won\b/i.test(message);
}

function parseSeasonFloor(message: string): number {
  const since = message.match(/\bsince season\s*(\d{1,2})\b/i);
  if (since) return parseInt(since[1]!, 10);
  const from = message.match(/\bfrom season\s*(\d{1,2})\b/i);
  if (from) return parseInt(from[1]!, 10);
  const s8 = message.match(/\bseason\s*8\b/i);
  if (s8) return 8;
  return 8; // default "worlds since S8" colloquial baseline
}

function parseYearFloor(message: string): number | null {
  const m = message.match(/\bsince\s*(20\d{2})\b/i);
  return m ? parseInt(m[1]!, 10) : null;
}

export function lookupWorldsHistory(message: string): {
  tool: string;
  data: Record<string, unknown>;
} {
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
        "Finals MVP is the official OPPO/Riot Finals MVP award — NOT the best-performing star by eye test (e.g. 2019 MVP is Tian not Doinb; 2022 MVP is Kingen not Zeka).",
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
