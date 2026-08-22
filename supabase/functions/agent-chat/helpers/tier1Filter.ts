/**
 * Display filter: tier-1 LCK/LPL/LEC/LCS + internationals.
 * Never treat Challengers / academy / LCK CL as LCK.
 */

const TIER1_DOMESTIC = new Set(["LCK", "LPL", "LEC", "LCS", "LTA", "LTA N"]);

const INTERNATIONAL = new Set([
  "MSI",
  "WLDS",
  "WLDs",
  "FST",
  "EWC",
  "WORLDS",
  "FIRST STAND",
  "ESPORTS WORLD CUP",
]);

const EXCLUDED_LEAGUE_CODES = new Set([
  "LCK CL",
  "LCKC",
  "LCK CHALLENGERS",
  "LCK AS",
  "LDL",
  "LCS.A",
  "LCS ACADEMY",
  "LEC ACADEMY",
  "CBLOL",
  "LLA",
  "PCS",
  "VCS",
  "LJL",
  "TCL",
  "LFL",
  "NLC",
  "LCO",
  "ARAM",
]);

const ACADEMY_TEAM_RE = /\b(academy|challengers?|youth|ama|rookies)\b/i;
const ACADEMY_CONTEXT_RE =
  /\b(academy|challengers?|lck\s*cl|lckc|ldl|lcs\.?a\b|youth|ama\b|development\s*league|rookies)\b/i;

export interface ScheduleDisplayRow {
  team_a?: string | null;
  team_b?: string | null;
  league?: string | null;
  tournament_name?: string | null;
  block_name?: string | null;
}

export function isAcademyOrMinor(opts: {
  teamA: string;
  teamB: string;
  league: string;
  tournamentName?: string | null;
  blockName?: string | null;
}): boolean {
  if (ACADEMY_TEAM_RE.test(opts.teamA) || ACADEMY_TEAM_RE.test(opts.teamB)) return true;
  const code = opts.league.trim().toUpperCase();
  if (EXCLUDED_LEAGUE_CODES.has(code)) return true;
  const hay = `${opts.league} ${opts.tournamentName ?? ""} ${opts.blockName ?? ""}`;
  return ACADEMY_CONTEXT_RE.test(hay);
}

/** Reject empty / TBD / "???" opponent slots so chat never prints ???. */
export function hasUsableOpponentName(name: string | null | undefined): boolean {
  const t = (name ?? "").trim();
  if (!t) return false;
  if (/^\?+$/.test(t)) return false;
  if (/^(tbd|tba|unknown|n\/a|vs\s*\?+|opponent|tbd opponent)$/i.test(t)) return false;
  if (/\?{2,}/.test(t)) return false;
  return true;
}

export function isInternationalLeague(opts: {
  league: string;
  tournamentName?: string | null;
  blockName?: string | null;
}): boolean {
  const code = opts.league.trim().toUpperCase();
  if (INTERNATIONAL.has(code) || INTERNATIONAL.has(opts.league.trim())) return true;
  const hay = `${opts.league} ${opts.tournamentName ?? ""} ${opts.blockName ?? ""}`.toLowerCase();
  return /\bmsi\b|\bworlds\b|first\s*stand|esports\s*world\s*cup|\bewc\b/.test(hay);
}

export function isTier1DisplayRow(row: ScheduleDisplayRow): boolean {
  const teamA = String(row.team_a ?? "");
  const teamB = String(row.team_b ?? "");
  const league = String(row.league ?? "");
  if (
    isAcademyOrMinor({
      teamA,
      teamB,
      league,
      tournamentName: row.tournament_name,
      blockName: row.block_name,
    })
  ) {
    return false;
  }
  if (!hasUsableOpponentName(teamA) || !hasUsableOpponentName(teamB)) return false;
  if (
    isInternationalLeague({
      league,
      tournamentName: row.tournament_name,
      blockName: row.block_name,
    })
  ) {
    return true;
  }
  const code = league.trim().toUpperCase();
  return TIER1_DOMESTIC.has(league.trim()) || TIER1_DOMESTIC.has(code);
}

export function filterDisplayScheduleRows<T extends ScheduleDisplayRow>(rows: T[]): T[] {
  return rows.filter((r) => isTier1DisplayRow(r));
}
