/**
 * CitoAPI lookup for nuckyAI — tier-2 fallback after OE + RAG, before Tavily.
 * Server-side only; requires CITO_API_KEY in Supabase secrets.
 */

const CITO_BASE = "https://api.citoapi.com/api/v1";
const TIMEOUT_MS = 25_000;

/** Tier-1 teams with known Cito slugs. */
const TEAM_SLUGS: Array<{ slug: string; names: string[]; league: string }> = [
  { slug: "t1", names: ["t1"], league: "LCK" },
  { slug: "geng", names: ["gen.g", "geng", "gen g"], league: "LCK" },
  { slug: "dwg-kia", names: ["dk", "dplus", "dplus kia", "damwon"], league: "LCK" },
  { slug: "hanwha-life-esports", names: ["hle", "hanwha"], league: "LCK" },
  { slug: "kt-rolster", names: ["kt"], league: "LCK" },
  { slug: "drx", names: ["drx"], league: "LCK" },
  { slug: "bilibili-gaming", names: ["blg", "bilibili"], league: "LPL" },
  { slug: "jd-gaming", names: ["jdg", "jd gaming"], league: "LPL" },
  { slug: "top-esports", names: ["tes", "top esports"], league: "LPL" },
  { slug: "weibo-gaming", names: ["wbg", "weibo"], league: "LPL" },
  { slug: "g2-esports", names: ["g2"], league: "LEC" },
  { slug: "fnatic", names: ["fnc", "fnatic"], league: "LEC" },
  { slug: "karmine-corp", names: ["kc", "karmine corp"], league: "LEC" },
  { slug: "team-bds", names: ["bds"], league: "LEC" },
  { slug: "giantx-lec", names: ["giantx", "giant x"], league: "LEC" },
  { slug: "cloud9", names: ["c9", "cloud9"], league: "LCS" },
  { slug: "team-liquid", names: ["tl", "team liquid", "liquid"], league: "LCS" },
  { slug: "flyquest", names: ["fly", "flyquest"], league: "LCS" },
  { slug: "100-thieves", names: ["100t", "100 thieves"], league: "LCS" },
];

export interface CitoVerifiedFact {
  fact: string;
  entityType: "player" | "team" | "other";
  entityId: string;
  factKind: "career" | "roster" | "fact";
  citoPath: string;
}

export interface CitoSearchResult {
  context: string;
  facts: CitoVerifiedFact[];
  hit: boolean;
}

export type CitoSearchIntent =
  | "career"
  | "roster"
  | "stats"
  | "schedule"
  | "meta"
  | "general";

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function unwrapData(payload: unknown): unknown {
  if (payload == null) return null;
  if (Array.isArray(payload)) return payload;
  const obj = asObject(payload);
  if (obj && "data" in obj) return obj.data;
  return payload;
}

async function citoGet(apiKey: string, path: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CITO_BASE}${path}`, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function detectLeague(text: string): string | null {
  const t = text.toUpperCase();
  if (/\bLCK\b/.test(t)) return "lck";
  if (/\bLPL\b/.test(t)) return "lpl";
  if (/\bLEC\b/.test(t)) return "lec";
  if (/\bLCS\b/.test(t)) return "lcs";
  return null;
}

function extractTeams(text: string): Array<{ slug: string; league: string; label: string }> {
  const lower = text.toLowerCase();
  const out: Array<{ slug: string; league: string; label: string }> = [];
  const seen = new Set<string>();
  for (const team of TEAM_SLUGS) {
    if (team.names.some((n) => lower.includes(n))) {
      if (!seen.has(team.slug)) {
        seen.add(team.slug);
        out.push({ slug: team.slug, league: team.league, label: team.names[0]!.toUpperCase() });
      }
    }
  }
  return out.slice(0, 3);
}

export function detectCitoIntent(message: string): CitoSearchIntent {
  const t = message.toLowerCase();
  if (/\b(mvp|award|title|championship|won worlds|worlds winner|msi winner|career)\b/.test(t)) {
    return "career";
  }
  if (/\b(roster|lineup|transfer|signed|joined|left|sub|backup|who plays for)\b/.test(t)) {
    return "roster";
  }
  if (/\b(schedule|when does|plays next|match today|fixture|upcoming)\b/.test(t)) {
    return "schedule";
  }
  if (/\b(meta|pick rate|ban rate|champion tier|most picked|most banned)\b/.test(t)) {
    return "meta";
  }
  if (/\b(form|trend|win rate|winrate|stats|kda|gd@?15|objective|ranking)\b/.test(t)) {
    return "stats";
  }
  return "general";
}

function summarizeJson(path: string, data: unknown, maxLen = 2400): string {
  try {
    const raw = JSON.stringify(data, null, 0);
    return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
  } catch {
    return `[cito ${path}] (unparseable response)`;
  }
}

function factsFromTransfers(path: string, data: unknown, league: string): CitoVerifiedFact[] {
  const rows = unwrapData(data);
  if (!Array.isArray(rows) || !rows.length) return [];
  const facts: CitoVerifiedFact[] = [];
  for (const row of rows.slice(0, 6)) {
    const r = asObject(row);
    if (!r) continue;
    const player = String(r.playerName ?? r.player ?? r.name ?? "").trim();
    const team = String(r.teamName ?? r.team ?? r.toTeam ?? "").trim();
    const role = String(r.role ?? r.position ?? "").trim();
    if (!player || !team) continue;
    const fact = role
      ? `${player} is on ${team} (${role}) per recent ${league.toUpperCase()} transfer data`
      : `${player} is on ${team} per recent ${league.toUpperCase()} transfer data`;
    facts.push({
      fact,
      entityType: "player",
      entityId: player.toLowerCase(),
      factKind: "roster",
      citoPath: path,
    });
  }
  return facts;
}

function factsFromRankings(path: string, data: unknown): CitoVerifiedFact[] {
  const rows = unwrapData(data);
  if (!Array.isArray(rows) || !rows.length) return [];
  const facts: CitoVerifiedFact[] = [];
  for (const row of rows.slice(0, 8)) {
    const r = asObject(row);
    if (!r) continue;
    const team = String(r.teamName ?? r.team ?? r.name ?? "").trim();
    const rank = r.rank ?? r.position ?? r.standing;
    const league = String(r.league ?? r.leagueName ?? "").trim();
    if (!team || rank == null) continue;
    facts.push({
      fact: `${team}${league ? ` (${league})` : ""} ranked #${rank} in current Cito rankings`,
      entityType: "team",
      entityId: team.toLowerCase(),
      factKind: "fact",
      citoPath: path,
    });
  }
  return facts;
}

function factsFromTrend(path: string, teamLabel: string, data: unknown): CitoVerifiedFact[] {
  const obj = asObject(unwrapData(data));
  if (!obj) return [];
  const wr = obj.winRate ?? obj.winrate ?? obj.recentWinRate;
  const games = obj.games ?? obj.sampleSize ?? obj.gameCount;
  if (wr == null && games == null) return [];
  const parts: string[] = [];
  if (wr != null) parts.push(`win rate ${wr}`);
  if (games != null) parts.push(`${games} recent games`);
  return [{
    fact: `${teamLabel} recent form from Cito: ${parts.join(", ")}`,
    entityType: "team",
    entityId: teamLabel.toLowerCase(),
    factKind: "fact",
    citoPath: path,
  }];
}

function factsFromSchedule(path: string, data: unknown): CitoVerifiedFact[] {
  const rows = unwrapData(data);
  if (!Array.isArray(rows) || !rows.length) return [];
  const facts: CitoVerifiedFact[] = [];
  for (const row of rows.slice(0, 5)) {
    const r = asObject(row);
    if (!r) continue;
    const t1 = asObject(r.team1);
    const t2 = asObject(r.team2);
    const name1 = String(t1?.name ?? t1?.code ?? "").trim();
    const name2 = String(t2?.name ?? t2?.code ?? "").trim();
    const tournament = String(r.tournamentName ?? r.leagueName ?? "").trim();
    const start = String(r.startTime ?? r.scheduledAt ?? "").trim();
    if (!name1 || !name2) continue;
    facts.push({
      fact: `Upcoming match: ${name1} vs ${name2}${tournament ? ` (${tournament})` : ""}${start ? ` at ${start}` : ""}`,
      entityType: "other",
      entityId: `${name1}-vs-${name2}`.toLowerCase(),
      factKind: "fact",
      citoPath: path,
    });
  }
  return facts;
}

/** Whether Cito context plausibly answers the intent (skip Tavily when true). */
export function citoCoversIntent(intent: CitoSearchIntent, context: string): boolean {
  const ctx = context.toLowerCase();
  if (!ctx.trim() || ctx.length < 80) return false;
  switch (intent) {
    case "career":
      return /\b(mvp|award|title|champion|ranked|ranking|winner)\b/.test(ctx);
    case "roster":
      return /\b(roster|transfer|joined|plays for|lineup|player)\b/.test(ctx);
    case "schedule":
      return /\b(vs|match|schedule|start|tournament|bo\d)\b/.test(ctx);
    case "meta":
      return /\b(champion|pick|ban|meta|rate)\b/.test(ctx);
    case "stats":
      return /\b(win|rate|form|trend|kda|gold|objective|games)\b/.test(ctx);
    default:
      return ctx.length > 160;
  }
}

/**
 * Query CitoAPI for structured esports data based on message intent.
 * Returns formatted context + atomic facts for immediate RAG write-back.
 */
export async function fetchCitoContext(
  apiKey: string,
  message: string,
  intent: CitoSearchIntent,
  leagueFilter?: string,
): Promise<CitoSearchResult> {
  if (!apiKey.trim()) return { context: "", facts: [], hit: false };

  const league = (leagueFilter && leagueFilter !== "ALL" ? leagueFilter : detectLeague(message) ?? "lck")
    .toLowerCase();
  const teams = extractTeams(message);
  const blocks: string[] = [];
  const facts: CitoVerifiedFact[] = [];

  const add = (label: string, path: string, data: unknown, extraFacts: CitoVerifiedFact[] = []) => {
    if (data == null) return;
    const summary = summarizeJson(path, data);
    if (!summary || summary === "{}" || summary === "[]") return;
    blocks.push(`[cito — ${label}]\n${summary}`);
    facts.push(...extraFacts);
  };

  if (intent === "roster" || intent === "general" || intent === "career") {
    const path = `/lol/transfers?league=${league}&limit=12`;
    const data = await citoGet(apiKey, path);
    add("transfers", path, data, factsFromTransfers(path, data, league));
  }

  if (intent === "career" || intent === "stats" || intent === "general") {
    const path = `/lol/rankings?league=${league}`;
    const data = await citoGet(apiKey, path);
    add("rankings", path, data, factsFromRankings(path, data));
  }

  if (intent === "stats" || intent === "general") {
    for (const team of teams) {
      const trendPath = `/lol/analytics/teams/${team.slug}/trend`;
      const trendData = await citoGet(apiKey, trendPath);
      add(`${team.label} trend`, trendPath, trendData, factsFromTrend(trendPath, team.label, trendData));

      const objPath = `/lol/teams/${team.slug}/objectives`;
      const objData = await citoGet(apiKey, objPath);
      add(`${team.label} objectives`, objPath, objData);
    }
  }

  if (intent === "schedule" || intent === "general") {
    for (const path of ["/lol/schedule/today", "/lol/schedule/upcoming"]) {
      const data = await citoGet(apiKey, path);
      add(path.includes("today") ? "schedule today" : "schedule upcoming", path, data,
        factsFromSchedule(path, data));
    }
  }

  if (intent === "meta" || intent === "general") {
    const metaPath = "/lol/champions/meta";
    const metaData = await citoGet(apiKey, metaPath);
    add("champion meta", metaPath, metaData);
  }

  if (intent === "career" || intent === "general") {
    const trendingPath = "/lol/trending";
    const trendingData = await citoGet(apiKey, trendingPath);
    add("trending", trendingPath, trendingData);
  }

  const context = blocks.join("\n\n");
  const hit = context.trim().length > 0;
  return { context, facts: facts.slice(0, 12), hit };
}
