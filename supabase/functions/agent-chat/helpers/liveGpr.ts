/**
 * Live official lolesports Global Power Rankings (via CitoAPI's direct mirror), fetched
 * at request time instead of relying solely on the deploy-time `gpr_snapshot.json` bundle.
 *
 * `gpr_snapshot.json` is only refreshed when the ML pipeline runs + agent-chat is
 * redeployed, so it can drift from the live lolesports rankings between deploys (GPR
 * moves after every completed series). This module fetches the current rankings straight
 * from CitoAPI on each prematch/full prediction request and is used to OVERRIDE the two
 * teams in play; the static snapshot remains the fallback (and the source of truth for
 * every other team, e.g. league-wide averages) when the live call fails or times out.
 */

const CITO_BASE = "https://api.citoapi.com/api/v1";
const TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface LiveGprEntry {
  rank: number;
  gprScore: number;
  /** Elo-scale rating comparable to gpr_snapshot.json's `elo` field. */
  elo: number;
  league?: string | null;
}

interface RawGprRow {
  team?: { name?: string; code?: string };
  league?: { name?: string; slug?: string };
  rank?: number;
  gprScore?: number;
  elo?: number;
}

let cache: { at: number; rows: RawGprRow[] } | null = null;
let inFlight: Promise<RawGprRow[]> | null = null;

async function fetchRawRankings(apiKey: string): Promise<RawGprRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    for (const path of ["/lol/rankings/teams", "/lol/rankings"]) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${CITO_BASE}${path}`, {
          headers: { Accept: "application/json", "x-api-key": apiKey },
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const payload = await res.json();
        const rows = Array.isArray(payload)
          ? payload
          : (payload?.rankings ?? payload?.data ?? []);
        if (Array.isArray(rows) && rows.length) {
          cache = { at: Date.now(), rows };
          return rows as RawGprRow[];
        }
      } catch {
        // try next path / fall through to stale cache below
      } finally {
        clearTimeout(timer);
      }
    }
    return cache?.rows ?? [];
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

function normName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rowMatchesTeam(row: RawGprRow, variants: string[]): boolean {
  const name = normName(String(row.team?.name ?? row.team?.code ?? ""));
  if (!name) return false;
  return variants.some((v) => {
    const n = normName(v);
    return n.length >= 2 && (name === n || name.includes(n) || n.includes(name));
  });
}

/**
 * Live GPR lookup for a small set of teams (a single matchup). `teams` maps a canonical
 * team name to its known name variants/aliases (used for matching CitoAPI's raw team
 * name, which may differ slightly from our canonical spelling). Returns only entries it
 * could confidently match; callers should fall back to the static snapshot for the rest.
 */
export async function fetchLiveGprForTeams(
  apiKey: string,
  teams: Array<{ canonical: string; variants: string[] }>,
): Promise<Record<string, LiveGprEntry>> {
  if (!apiKey?.trim() || !teams.length) return {};
  let rows: RawGprRow[];
  try {
    rows = await fetchRawRankings(apiKey.trim());
  } catch {
    return {};
  }
  if (!rows.length) return {};

  const out: Record<string, LiveGprEntry> = {};
  for (const { canonical, variants } of teams) {
    const hit = rows.find((r) => rowMatchesTeam(r, variants));
    if (!hit) continue;
    const gprScore = Number(hit.gprScore);
    const rank = Number(hit.rank);
    const elo = hit.elo != null ? Number(hit.elo) : gprScore;
    if (!Number.isFinite(gprScore) || !Number.isFinite(rank) || !Number.isFinite(elo)) continue;
    out[canonical] = {
      rank,
      gprScore,
      elo,
      league: hit.league?.name ?? hit.league?.slug ?? null,
    };
  }
  return out;
}
