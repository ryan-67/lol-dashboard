import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * cito-live — server-side proxy for live CitoAPI endpoints.
 *
 * The Cito API key is injected here (server-side only) and never exposed to the
 * browser. Only an allowlisted set of read-only resources is permitted, and
 * responses are cached briefly to keep request volume under control.
 *
 * Secrets required (set with `npx supabase secrets set CITO_API_KEY=...`):
 *   CITO_API_KEY
 */

const CITO_BASE = "https://api.citoapi.com/api/v1";
const CITO_API_KEY = Deno.env.get("CITO_API_KEY") ?? "";

function corsHeaders(origin: string | null) {
  const allowedOrigins = new Set([
    "https://nucky.gg",
    "https://www.nucky.gg",
    "http://localhost:5173",
  ]);
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : "https://nucky.gg";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

type ResourceDef = {
  /** Build the Cito path from an optional id. */
  path: (id: string | null) => string | null;
  /** Cache-Control max-age in seconds. */
  cache: number;
};

const RESOURCES: Record<string, ResourceDef> = {
  live: { path: () => `/lol/live`, cache: 8 },
  "schedule-today": { path: () => `/lol/schedule/today`, cache: 60 },
  "schedule-upcoming": { path: () => `/lol/schedule/upcoming`, cache: 120 },
  match: { path: (id) => (id ? `/lol/matches/${id}` : null), cache: 15 },
  "match-games": { path: (id) => (id ? `/lol/matches/${id}/games` : null), cache: 15 },
  "match-series": { path: (id) => (id ? `/lol/live/${id}/series` : null), cache: 8 },
  "match-player-stats": { path: (id) => (id ? `/lol/matches/${id}/player-stats` : null), cache: 15 },
  "match-drafts": { path: (id) => (id ? `/lol/analytics/drafts/${id}` : null), cache: 30 },
  "game-window": { path: (id) => (id ? `/lol/live/${id}/window` : null), cache: 8 },
  "game-stats": { path: (id) => (id ? `/lol/live/${id}/stats` : null), cache: 8 },
  "game-gold": { path: (id) => (id ? `/lol/games/${id}/gold` : null), cache: 30 },
};

function isSafeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!CITO_API_KEY) {
    return new Response(JSON.stringify({ error: "Live data not configured" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource") ?? "";
  const id = url.searchParams.get("id");

  const def = RESOURCES[resource];
  if (!def) {
    return new Response(JSON.stringify({ error: "Unknown resource" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (id && !isSafeId(id)) {
    return new Response(JSON.stringify({ error: "Invalid id" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const path = def.path(id);
  if (!path) {
    return new Response(JSON.stringify({ error: "Missing id for resource" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const citoRes = await fetch(`${CITO_BASE}${path}`, {
      headers: { Accept: "application/json", "x-api-key": CITO_API_KEY },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await citoRes.text();
    let data: unknown = null;
    try {
      data = text.trim() ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    return new Response(JSON.stringify({ resource, data }), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${def.cache}`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Upstream request failed", detail: String(err) }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
