export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/** Primary wiki sources — rosters, patch notes, tournament formats, career facts. */
export const TAVILY_WIKI_DOMAINS = [
  "liquipedia.net",
  "lol.fandom.com",
  "leaguepedia.fandom.com",
] as const;

/** Heavy pro stats — builds, pick/ban rates, historical player stats. */
export const TAVILY_STATS_PRIMARY_DOMAINS = ["gol.gg"] as const;

/** Champion matchup / patch meta when OE sample is thin. */
export const TAVILY_META_SECONDARY_DOMAINS = ["u.gg", "leagueofgraphs.com"] as const;

/** Official schedules / broadcasts. */
export const TAVILY_SECONDARY_DOMAINS = ["lolesports.com"] as const;

/** Community sentiment (subjective debates — not auto-written as facts). */
export const TAVILY_SENTIMENT_DOMAINS = ["reddit.com"] as const;

/** Full allowlist for verification + ranking. */
export const TAVILY_ALLOWLIST = [
  ...TAVILY_WIKI_DOMAINS,
  ...TAVILY_STATS_PRIMARY_DOMAINS,
  ...TAVILY_META_SECONDARY_DOMAINS,
  ...TAVILY_SECONDARY_DOMAINS,
  ...TAVILY_SENTIMENT_DOMAINS,
];

const TAVILY_URL = "https://api.tavily.com/search";

interface TavilyApiResponse {
  results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
}

export interface TavilySearchOptions {
  maxResults?: number;
  includeDomains?: string[];
  searchDepth?: "basic" | "advanced";
}

export type TavilySearchIntent =
  | "career"
  | "roster"
  | "patch"
  | "tournament"
  | "stats"
  | "matchup"
  | "meta"
  | "subjective"
  | "general";

export async function searchTavily(
  apiKey: string,
  query: string,
  options: TavilySearchOptions = {},
): Promise<TavilyResult[]> {
  if (!apiKey) return [];

  try {
    const response = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: options.searchDepth ?? "basic",
        max_results: options.maxResults ?? 5,
        include_domains: options.includeDomains ?? [...TAVILY_ALLOWLIST],
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!response.ok) return [];

    const json = (await response.json()) as TavilyApiResponse;
    return (json.results ?? [])
      .filter((r) => r.url && r.content)
      .map((r) => ({
        title: String(r.title ?? ""),
        url: String(r.url ?? ""),
        content: String(r.content ?? ""),
        score: Number(r.score ?? 0),
      }));
  } catch {
    return [];
  }
}

export function urlDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isAllowlisted(url: string): boolean {
  const domain = urlDomain(url);
  return TAVILY_ALLOWLIST.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function isWikiDomain(url: string): boolean {
  const domain = urlDomain(url);
  return [...TAVILY_WIKI_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function isStatsDomain(url: string): boolean {
  const domain = urlDomain(url);
  return [...TAVILY_STATS_PRIMARY_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function isMetaDomain(url: string): boolean {
  const domain = urlDomain(url);
  return [...TAVILY_META_SECONDARY_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function isSentimentDomain(url: string): boolean {
  const domain = urlDomain(url);
  return domain === "reddit.com" || domain.endsWith(".reddit.com");
}

export function isAuthoritativeSingle(url: string): boolean {
  const domain = urlDomain(url);
  return (
    domain === "liquipedia.net" ||
    domain.endsWith(".liquipedia.net") ||
    domain === "lol.fandom.com" ||
    domain === "leaguepedia.fandom.com"
  );
}

/** Stats sites can support numeric facts when cross-verified (not opinion). */
export function isStatsFactSource(url: string): boolean {
  return isStatsDomain(url) || isAuthoritativeSingle(url);
}

export function dedupeSnippets(snippets: TavilyResult[]): TavilyResult[] {
  const byUrl = new Map<string, TavilyResult>();
  for (const s of snippets) {
    const prev = byUrl.get(s.url);
    if (!prev || s.score > prev.score) byUrl.set(s.url, s);
  }
  return [...byUrl.values()];
}

type SnippetTier = "wiki" | "stats" | "meta" | "other";

function snippetTier(url: string): SnippetTier {
  if (isWikiDomain(url)) return "wiki";
  if (isStatsDomain(url)) return "stats";
  if (isMetaDomain(url)) return "meta";
  return "other";
}

/** Rank snippets by domain tier (wiki > stats > meta > other), then Tavily score. */
export function rankSnippets(snippets: TavilyResult[], prefer: SnippetTier = "wiki"): TavilyResult[] {
  const tierOrder: Record<SnippetTier, number> = {
    wiki: 4,
    stats: 3,
    meta: 2,
    other: 1,
  };
  const preferWeight = tierOrder[prefer];

  return [...snippets]
    .filter((s) => isAllowlisted(s.url))
    .sort((a, b) => {
      const ta = snippetTier(a.url);
      const tb = snippetTier(b.url);
      const aBoost = ta === prefer ? 1 : 0;
      const bBoost = tb === prefer ? 1 : 0;
      if (bBoost !== aBoost) return bBoost - aBoost;
      if (tierOrder[tb] !== tierOrder[ta]) return tierOrder[tb] - tierOrder[ta];
      return b.score - a.score;
    });
}

/** @deprecated use rankSnippets */
export function rankWikiSnippets(snippets: TavilyResult[]): TavilyResult[] {
  return rankSnippets(snippets, "wiki");
}

export async function searchTavilyWikiFirst(
  apiKey: string,
  query: string,
  options: TavilySearchOptions = {},
): Promise<TavilyResult[]> {
  const maxResults = options.maxResults ?? 6;
  const wikiResults = await searchTavily(apiKey, query, {
    maxResults,
    includeDomains: [...TAVILY_WIKI_DOMAINS],
    searchDepth: options.searchDepth ?? "advanced",
  });

  if (wikiResults.length >= 3) {
    return rankSnippets(dedupeSnippets(wikiResults), "wiki").slice(0, maxResults);
  }

  const secondary = await searchTavily(apiKey, query, {
    maxResults: Math.max(3, maxResults - wikiResults.length),
    includeDomains: [...TAVILY_SECONDARY_DOMAINS],
    searchDepth: "basic",
  });

  return rankSnippets(dedupeSnippets([...wikiResults, ...secondary]), "wiki").slice(0, maxResults);
}

/** gol.gg-first for builds, pick/ban rates, historical pro stats. */
export async function searchTavilyStatsFirst(
  apiKey: string,
  query: string,
  options: TavilySearchOptions = {},
): Promise<TavilyResult[]> {
  const maxResults = options.maxResults ?? 6;
  const statsResults = await searchTavily(apiKey, query, {
    maxResults,
    includeDomains: [...TAVILY_STATS_PRIMARY_DOMAINS],
    searchDepth: "advanced",
  });

  const wikiTopUp = statsResults.length < 3
    ? await searchTavily(apiKey, query, {
      maxResults: 3,
      includeDomains: [...TAVILY_WIKI_DOMAINS],
      searchDepth: "basic",
    })
    : [];

  return rankSnippets(dedupeSnippets([...statsResults, ...wikiTopUp]), "stats").slice(0, maxResults);
}

/** u.gg / leagueofgraphs when matchup or patch meta needs broader samples. */
export async function searchTavilyMetaFirst(
  apiKey: string,
  query: string,
  options: TavilySearchOptions = {},
): Promise<TavilyResult[]> {
  const maxResults = options.maxResults ?? 6;
  const metaResults = await searchTavily(apiKey, query, {
    maxResults,
    includeDomains: [...TAVILY_META_SECONDARY_DOMAINS],
    searchDepth: "advanced",
  });

  const statsTopUp = metaResults.length < 2
    ? await searchTavily(apiKey, query, {
      maxResults: 3,
      includeDomains: [...TAVILY_STATS_PRIMARY_DOMAINS],
      searchDepth: "basic",
    })
    : [];

  return rankSnippets(dedupeSnippets([...metaResults, ...statsTopUp]), "meta").slice(0, maxResults);
}

/** Reddit/community threads for subjective GOAT/clutch debates (opinion, not facts). */
export async function searchTavilySentiment(
  apiKey: string,
  query: string,
  options: TavilySearchOptions = {},
): Promise<TavilyResult[]> {
  const maxResults = options.maxResults ?? 5;
  return dedupeSnippets(
    await searchTavily(apiKey, query, {
      maxResults,
      includeDomains: [...TAVILY_SENTIMENT_DOMAINS],
      searchDepth: "basic",
    }),
  ).slice(0, maxResults);
}

export function formatSnippetsAsContext(
  snippets: TavilyResult[],
  label: string,
  maxContentLen = 500,
): string {
  if (!snippets.length) return "";
  return snippets
    .map((s) => `[${label} — ${urlDomain(s.url)}] ${s.title}: ${s.content.slice(0, maxContentLen)}`)
    .join("\n\n");
}
