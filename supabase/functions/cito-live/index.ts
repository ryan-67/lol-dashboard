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
const LOLESPORTS_LIVESTATS_BASE = "https://feed.lolesports.com/livestats/v1";

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

function normalizeGameId(id: string): string {
  return id.replace(/^lol-game-/i, "");
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function hasCitoLivePlayerRows(data: unknown): boolean {
  const obj = asObject(data);
  if (!obj) return false;
  const payload = asObject(obj.data) ?? obj;
  const p2 = asObject(payload);
  if (!p2) return false;
  const direct = p2.players;
  if (Array.isArray(direct) && direct.length > 0) return true;
  const blue = p2.blue;
  const red = p2.red;
  if (Array.isArray(blue) && blue.length > 0) return true;
  if (Array.isArray(red) && red.length > 0) return true;
  return false;
}

type LiveMeta = {
  participantId: number;
  side: "blue" | "red";
  role: string | null;
  summonerName: string;
  championId: string | null;
};

async function fetchLolesportsLivePlayers(gameId: string): Promise<unknown[] | null> {
  const gid = normalizeGameId(gameId);
  const [windowRes, detailsRes] = await Promise.all([
    fetch(`${LOLESPORTS_LIVESTATS_BASE}/window/${gid}`),
    fetch(`${LOLESPORTS_LIVESTATS_BASE}/details/${gid}`),
  ]);
  if (!windowRes.ok || !detailsRes.ok) return null;

  const windowJson = await windowRes.json();
  const detailsJson = await detailsRes.json();
  const winObj = asObject(windowJson);
  const detObj = asObject(detailsJson);
  if (!winObj || !detObj) return null;

  const gameMetadata = asObject(winObj.gameMetadata);
  const frames = Array.isArray(detObj.frames) ? detObj.frames : [];
  const latestFrame = asObject(frames[frames.length - 1]);
  if (!gameMetadata || !latestFrame) return null;
  const participants = Array.isArray(latestFrame.participants)
    ? latestFrame.participants.map(asObject).filter(Boolean) as Record<string, unknown>[]
    : [];
  if (!participants.length) return null;

  const sideMeta = new Map<number, LiveMeta>();
  const collectMeta = (teamKey: "blueTeamMetadata" | "redTeamMetadata", side: "blue" | "red") => {
    const team = asObject(gameMetadata[teamKey]);
    const rows = Array.isArray(team?.participantMetadata)
      ? team.participantMetadata.map(asObject).filter(Boolean) as Record<string, unknown>[]
      : [];
    for (const row of rows) {
      const pid = typeof row.participantId === "number" ? row.participantId : null;
      if (pid == null) continue;
      sideMeta.set(pid, {
        participantId: pid,
        side,
        role: typeof row.role === "string" ? row.role : null,
        summonerName: typeof row.summonerName === "string" ? row.summonerName : "—",
        championId: typeof row.championId === "string" ? row.championId : null,
      });
    }
  };
  collectMeta("blueTeamMetadata", "blue");
  collectMeta("redTeamMetadata", "red");

  const rows = participants.map((p) => {
    const pid = typeof p.participantId === "number" ? p.participantId : null;
    const meta = pid != null ? sideMeta.get(pid) : undefined;
    const items = Array.isArray(p.items)
      ? p.items
        .map((it) => {
          const itObj = asObject(it);
          if (!itObj) return null;
          const id = typeof itObj.itemID === "number"
            ? itObj.itemID
            : typeof itObj.id === "number"
            ? itObj.id
            : null;
          return id;
        })
        .filter((x): x is number => typeof x === "number")
      : [];
    return {
      side: meta?.side ?? "blue",
      role: meta?.role ?? null,
      summonerName: meta?.summonerName ?? "—",
      championName: meta?.championId ?? null,
      level: typeof p.level === "number" ? p.level : null,
      kills: typeof p.kills === "number" ? p.kills : null,
      deaths: typeof p.deaths === "number" ? p.deaths : null,
      assists: typeof p.assists === "number" ? p.assists : null,
      cs: typeof p.creepScore === "number" ? p.creepScore : null,
      gold: typeof p.totalGoldEarned === "number" ? p.totalGoldEarned : null,
      items,
      visionScore: typeof p.wardsPlaced === "number" && typeof p.wardsDestroyed === "number"
        ? p.wardsPlaced + p.wardsDestroyed
        : null,
    };
  });

  return rows.length ? rows : null;
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

    // Fallback: if Cito live per-player feeds are unavailable for an active game,
    // use official lolesports live telemetry so rooms still show meaningful stats.
    if (
      id &&
      (resource === "game-stats" || resource === "game-window") &&
      !hasCitoLivePlayerRows(data)
    ) {
      try {
        const fallbackRows = await fetchLolesportsLivePlayers(id);
        if (fallbackRows?.length) {
          data = {
            source: "lolesports_fallback",
            gameId: normalizeGameId(id),
            data: fallbackRows,
          };
        }
      } catch {
        // keep original Cito payload
      }
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
