import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * kalshi-board — short-TTL proxy for Predictions schedule Kalshi H2H odds.
 *
 * Secrets: KALSHI_API_KEY (optional; public market endpoints often work without)
 * Cache: in-memory ~90s per matchup key to respect rate limits while staying live.
 */

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const CACHE_TTL_MS = 90_000;

const ALLOWED_ORIGINS = new Set([
  "https://nucky.gg",
  "https://www.nucky.gg",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://nucky.gg";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

interface MatchupIn {
  matchId: string;
  teamA: string;
  teamB: string;
  league?: string;
  tournament?: string;
}

interface QuoteOut {
  matchId: string;
  display: string;
  teamAPercent: number | null;
  teamBPercent: number | null;
  ticker: string | null;
  updatedAt: string | null;
}

type CacheEntry = { at: number; quote: QuoteOut };

const cache = new Map<string, CacheEntry>();

const TEAM_ALIASES: Record<string, string[]> = {
  "gen.g": ["gen.g", "geng", "gen g"],
  "bilibili gaming": ["bilibili gaming", "blg", "bilibili"],
  "hanwha life esports": ["hanwha life esports", "hle", "hanwha"],
  "karmine corp": ["karmine corp", "kc", "karmine"],
  "dplus kia": ["dplus kia", "dk", "dplus", "damwon"],
  "cloud9": ["cloud9", "c9"],
  "team liquid": ["team liquid", "tl", "liquid"],
  "fnatic": ["fnatic", "fnc"],
  "top esports": ["top esports", "tes"],
  "jd gaming": ["jd gaming", "jdg"],
  "weibo gaming": ["weibo gaming", "wbg"],
  "g2 esports": ["g2 esports", "g2"],
  t1: ["t1"],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function variants(team: string): string[] {
  const key = team.toLowerCase().trim();
  const alias = TEAM_ALIASES[key] ?? TEAM_ALIASES[norm(team)] ?? [];
  return [...new Set([team, ...alias, team.split(/\s+/)[0] ?? team].filter(Boolean))];
}

function matchesTeam(hay: string, team: string): boolean {
  return variants(team).some((v) => {
    const lower = v.toLowerCase();
    const n = norm(v);
    return (lower.length >= 2 && hay.includes(lower)) || (n.length >= 2 && hay.includes(n));
  });
}

function authHeaders(): HeadersInit {
  const key = (Deno.env.get("KALSHI_API_KEY") ?? "").trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function impliedYes(m: {
  last_price?: number;
  yes_bid?: number;
  yes_ask?: number;
}): number | null {
  if (m.last_price != null && m.last_price > 0) return m.last_price;
  if (m.yes_bid != null && m.yes_ask != null && m.yes_bid > 0 && m.yes_ask > 0) {
    return Math.round((m.yes_bid + m.yes_ask) / 2);
  }
  if (m.yes_bid != null && m.yes_bid > 0) return m.yes_bid;
  if (m.yes_ask != null && m.yes_ask > 0) return m.yes_ask;
  return null;
}

function seriesFor(league?: string, tournament?: string): string[] {
  const hay = `${league ?? ""} ${tournament ?? ""}`.toLowerCase();
  if (/\bewc\b|esports world cup/.test(hay)) {
    return ["KXEWCLEAGUEOFLEGENDS", "KXEWCRENNSPORT", "KXLOL"];
  }
  if (/\bmsi\b|mid-?season/.test(hay)) {
    return ["KXMIDSEASONINVITATIONAL", "KXMIDSEASONINVITATIONALB", "KXLOL"];
  }
  if (/\bworlds\b/.test(hay)) return ["KXLEAGUE", "KXLEAGUEWORLDS", "KXLOL"];
  return ["KXLOL", "KXEWCLEAGUEOFLEGENDS", "KXMIDSEASONINVITATIONAL", "KXLEAGUE"];
}

async function fetchSeriesMarkets(seriesTicker: string): Promise<
  Array<{
    ticker?: string;
    title?: string;
    subtitle?: string;
    last_price?: number;
    yes_bid?: number;
    yes_ask?: number;
    status?: string;
  }>
> {
  const url = new URL(`${KALSHI_API_BASE}/markets`);
  url.searchParams.set("series_ticker", seriesTicker);
  url.searchParams.set("status", "open");
  url.searchParams.set("limit", "200");
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) return [];
  const json = (await res.json()) as { markets?: typeof markets };
  const markets = json.markets ?? [];
  return markets;
}

function inferYesIsTeamA(
  title: string,
  subtitle: string,
  teamA: string,
  teamB: string,
): boolean | null {
  const hay = `${title} ${subtitle}`.toLowerCase();
  const win = /\b(win|beat|defeat)\b/i.exec(hay);
  if (!win || win.index == null) return null;
  const before = hay.slice(Math.max(0, win.index - 48), win.index);
  const aNear = matchesTeam(before, teamA);
  const bNear = matchesTeam(before, teamB);
  if (aNear && !bNear) return true;
  if (bNear && !aNear) return false;
  return null;
}

async function quoteMatchup(m: MatchupIn): Promise<QuoteOut> {
  const empty: QuoteOut = {
    matchId: m.matchId,
    display: "—",
    teamAPercent: null,
    teamBPercent: null,
    ticker: null,
    updatedAt: null,
  };

  const seriesList = seriesFor(m.league, m.tournament);
  for (const series of seriesList) {
    const markets = await fetchSeriesMarkets(series);
    for (const market of markets) {
      const hay = `${market.title ?? ""} ${market.subtitle ?? ""}`.toLowerCase();
      if (!matchesTeam(hay, m.teamA) || !matchesTeam(hay, m.teamB)) continue;
      if (/\b(win the|tournament winner|outright)\b/.test(hay) && !/\bvs\.?|versus\b/.test(hay)) {
        continue;
      }
      const yes = impliedYes(market);
      if (yes == null) continue;
      const yesIsA = inferYesIsTeamA(market.title ?? "", market.subtitle ?? "", m.teamA, m.teamB);
      let aPct: number;
      let bPct: number;
      if (yesIsA === false) {
        bPct = yes;
        aPct = 100 - yes;
      } else {
        // default: YES ≈ team A when ambiguous
        aPct = yes;
        bPct = 100 - yes;
      }
      return {
        matchId: m.matchId,
        display: `${Math.round(aPct)}–${Math.round(bPct)}`,
        teamAPercent: aPct,
        teamBPercent: bPct,
        ticker: market.ticker ?? null,
        updatedAt: new Date().toISOString(),
      };
    }
  }
  return empty;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  let body: { matchups?: MatchupIn[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const matchups = (body.matchups ?? []).slice(0, 40);
  const odds: Record<string, QuoteOut> = {};
  const now = Date.now();

  for (const m of matchups) {
    if (!m.matchId || !m.teamA || !m.teamB) continue;
    const key = `${m.matchId}|${m.teamA}|${m.teamB}`;
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      odds[m.matchId] = hit.quote;
      continue;
    }
    const quote = await quoteMatchup(m);
    cache.set(key, { at: now, quote });
    odds[m.matchId] = quote;
  }

  return new Response(JSON.stringify({ odds, cacheTtlSec: CACHE_TTL_MS / 1000 }), {
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=30",
    },
  });
});
