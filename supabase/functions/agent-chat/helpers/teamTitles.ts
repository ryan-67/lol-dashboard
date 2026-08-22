/**
 * Curated domestic title tables. Career asks must not fall back to stale
 * wiki year-lists that credit predecessor orgs (KOO / SSG) as Gen.G.
 */

export interface TeamLckTitle {
  year: number;
  /** Empty string = year-only season title (2025 single-season era). */
  split: "Spring" | "Summer" | "";
}

export interface TeamLckTitleRow {
  team: string;
  count: number;
  titles: TeamLckTitle[];
  note: string;
}

/** Years that belong to KOO Tigers / Samsung Galaxy / SSG — not modern Gen.G. */
export const GENG_PREDECESSOR_YEARS = [2017, 2018, 2019, 2020] as const;

/**
 * Modern Gen.G LCK *season* titles (Leaguepedia Gen.G, not KOO/SSG lineage).
 * LCK Cup 2026 is a separate cup — do not fold it into this count.
 */
export const TEAM_LCK_TITLES: Record<string, TeamLckTitleRow> = {
  geng: {
    team: "Gen.G",
    count: 5,
    titles: [
      { year: 2022, split: "Summer" },
      { year: 2023, split: "Spring" },
      { year: 2023, split: "Summer" },
      { year: 2024, split: "Spring" },
      { year: 2025, split: "" },
    ],
    note:
      "5 modern Gen.G LCK season titles only (2022 Summer, 2023 Spring, 2023 Summer, 2024 Spring, 2025). " +
      "Do NOT count 2017–2020 KOO Tigers / Samsung Galaxy / SSG-era titles as Gen.G. " +
      "Do not drop either 2023 title. LCK Cup 2026 is a separate cup — not one of these 5.",
  },
};

export function formatLckTitle(t: TeamLckTitle): string {
  if (t.split === "Spring") return `${t.year} Spr`;
  if (t.split === "Summer") return `${t.year} Sum`;
  return `${t.year}`;
}

export function formatLckTitleLong(t: TeamLckTitle): string {
  return t.split ? `${t.year} ${t.split}` : `${t.year}`;
}

export function isGengEntity(name: string): boolean {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return n === "geng" || n === "gengesports" || n === "gen";
}

export function isPredecessorGengYear(year: number): boolean {
  return year >= 2017 && year <= 2020;
}

/** Modern Gen.G season title — 2022+ and not LCK Cup 2026. */
export function isModernGengSeasonTitle(year: number, split = ""): boolean {
  if (isPredecessorGengYear(year) || year < 2022) return false;
  if (year === 2026 && /cup/i.test(split)) return false;
  if (year === 2026) return false;
  return true;
}

export function extractTeamLckKey(message: string): string | null {
  const lower = message.toLowerCase();
  if (/\bgen(?:\.?g|g)?\b/.test(lower) || /\bgen-g\b/.test(lower)) return "geng";
  return null;
}

export function isTeamLckTitleQuestion(message: string): boolean {
  if (extractTeamLckKey(message) == null) return false;
  // Worlds / MSI title asks are a different table — do not steal them.
  if (
    /\b(worlds?|world championship|msi|mid-?season)\b/i.test(message) &&
    !/\blck\b/i.test(message)
  ) {
    return false;
  }
  // "GEN title years" / "how many titles does GEN have" must hit the curated
  // 5 — requiring the word LCK was the live fail-closed path after #6.
  if (/\b(titles?|championships?|title years?|how many)\b/i.test(message)) return true;
  return /\blck\b/i.test(message) && /\b(won|wins)\b/i.test(message);
}

/**
 * Parse split-labeled LCK titles from a Leaguepedia/Liquipedia blob.
 * Drops Cup 2026 and (for Gen.G) 2017–2020 predecessor years.
 */
export function parseLckSeasonTitlesFromWiki(
  blob: string,
  entityId: string,
): TeamLckTitle[] {
  const geng = isGengEntity(entityId) || /gen\.?g/i.test(blob);
  const found: TeamLckTitle[] = [];
  const seen = new Set<string>();
  const push = (year: number, split: TeamLckTitle["split"]) => {
    if (geng && !isModernGengSeasonTitle(year, split)) return;
    if (!geng && year === 2026 && split === "") return;
    const key = `${year}|${split}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ year, split });
  };

  const labeled = blob.matchAll(
    /\b(20\d{2})\s+(?:LCK\s+)?(Spring|Summer|Season|Cup)\b/gi,
  );
  for (const m of labeled) {
    const year = Number(m[1]);
    const raw = m[2]!.toLowerCase();
    if (raw === "cup") continue;
    const split: TeamLckTitle["split"] = raw === "spring"
      ? "Spring"
      : raw === "summer"
      ? "Summer"
      : "";
    push(year, split);
  }

  const reversed = blob.matchAll(
    /\b(Spring|Summer)\s+(20\d{2})\b/gi,
  );
  for (const m of reversed) {
    const raw = m[1]!.toLowerCase();
    const year = Number(m[2]);
    push(year, raw === "spring" ? "Spring" : "Summer");
  }

  return found.sort((a, b) => a.year - b.year || a.split.localeCompare(b.split));
}

/**
 * Modern Gen.G list wins. Wiki year-lists that include 2017–2020 or drop
 * both 2023s cannot replace the curated 5.
 */
export function modernGengLckTitles(wikiTitles: TeamLckTitle[] = []): TeamLckTitle[] {
  const curated = TEAM_LCK_TITLES.geng!.titles;
  const fromWiki = wikiTitles.filter((t) => isModernGengSeasonTitle(t.year, t.split));
  const byKey = new Map<string, TeamLckTitle>();
  for (const t of curated) byKey.set(`${t.year}|${t.split}`, t);
  for (const t of fromWiki) {
    const key = `${t.year}|${t.split}`;
    if (!byKey.has(key)) {
      // Wiki may label 2025 as Summer; curated already has year-only 2025.
      if (t.year === 2025 && byKey.has("2025|")) continue;
      byKey.set(key, t);
    }
  }
  const merged = [...byKey.values()].sort(
    (a, b) => a.year - b.year || a.split.localeCompare(b.split),
  );
  const hasBoth2023 = merged.some((t) => t.year === 2023 && t.split === "Spring") &&
    merged.some((t) => t.year === 2023 && t.split === "Summer");
  if (!hasBoth2023 || merged.some((t) => isPredecessorGengYear(t.year))) {
    return curated.slice();
  }
  const withoutPred = merged.filter((t) => !isPredecessorGengYear(t.year) && t.year >= 2022);
  return withoutPred.length >= curated.length ? withoutPred : curated.slice();
}

export function gengLckTitleFact(): string {
  const row = TEAM_LCK_TITLES.geng!;
  const listed = row.titles.map(formatLckTitleLong).join(", ");
  return `Gen.G has won ${row.count} modern LCK season titles (${listed})`;
}

export function lookupTeamLckTitles(message: string): {
  tool: string;
  data: Record<string, unknown>;
} | null {
  const key = extractTeamLckKey(message);
  if (!key || !isTeamLckTitleQuestion(message)) return null;
  const row = TEAM_LCK_TITLES[key];
  if (!row) return null;
  return {
    tool: "team_lck_titles",
    data: {
      source: "verified_lck_records",
      team: row.team,
      lckTitles: row.count,
      titles: row.titles.map((t) => ({
        year: t.year,
        split: t.split || null,
        label: formatLckTitle(t),
        labelLong: formatLckTitleLong(t),
      })),
      years: row.titles.map((t) => t.year),
      note: row.note,
    },
  };
}

/** Stale KOO/SSG year-list must not veto the modern 5 (both 2023s). */
export function staleGengYearListCannotVeto(winnerText: string, staleText: string): boolean {
  const winYears = (winnerText.match(/\b20\d{2}\b/g) ?? []).map(Number);
  const staleYears = (staleText.match(/\b20\d{2}\b/g) ?? []).map(Number);
  const winnerHasBoth2023 = /2023/.test(winnerText) &&
    /spring/i.test(winnerText) &&
    /summer/i.test(winnerText);
  const winnerIsFive = /\b5\b/.test(winnerText);
  const staleHasPredecessor = staleYears.some((y) => isPredecessorGengYear(y));
  const staleDrops2023s = !staleYears.includes(2023) && winnerHasBoth2023;
  if ((winnerIsFive || winnerHasBoth2023) && (staleHasPredecessor || staleDrops2023s)) {
    return true;
  }
  if (winYears.includes(2022) && winYears.includes(2023) && winYears.includes(2024) && winYears.includes(2025)) {
    return staleHasPredecessor || staleYears.filter((y) => y === 2023).length < 1;
  }
  return false;
}
