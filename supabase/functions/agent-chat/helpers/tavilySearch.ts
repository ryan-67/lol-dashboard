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

/** Secondary sources when wiki pages are thin (stats sites, official lolesports). */
export const TAVILY_SECONDARY_DOMAINS = ["gol.gg", "lolesports.com"] as const;

/** Full allowlist (wiki first in ranking). Web answers must come from these. */
export const TAVILY_ALLOWLIST = [
  ...TAVILY_WIKI_DOMAINS,
  ...TAVILY_SECONDARY_DOMAINS,
];

const TAVILY_URL = "https://api.tavily.com/search";

interface TavilyApiResponse {
  results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
}

export interface TavilySearchOptions {
  maxResults?: number;
  includeDomains?: string[];
  /** "advanced" for wiki-heavy queries (better snippet quality on Leaguepedia/Liquipedia). */
  searchDepth?: "basic" | "advanced";
}

export type TavilySearchIntent =
  | "career"
  | "roster"
  | "patch"
  | "tournament"
  | "general";

/**
 * Query Tavily for agent-time web search. Returns [] on any failure (fail-closed —
 * callers must not hallucinate when this is empty).
 */
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

/** Domain of a URL, lowercased, without leading www. */
export function urlDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** True if the URL belongs to an allowlisted authoritative source. */
export function isAllowlisted(url: string): boolean {
  const domain = urlDomain(url);
  return TAVILY_ALLOWLIST.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Liquipedia / Leaguepedia / Fandom count as single-source authoritative for facts. */
export function isAuthoritativeSingle(url: string): boolean {
  const domain = urlDomain(url);
  return (
    domain === "liquipedia.net" ||
    domain.endsWith(".liquipedia.net") ||
    domain === "lol.fandom.com" ||
    domain === "leaguepedia.fandom.com"
  );
}

/** True when the URL is a primary wiki domain (Leaguepedia / Liquipedia / Fandom). */
export function isWikiDomain(url: string): boolean {
  const domain = urlDomain(url);
  return [...TAVILY_WIKI_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Sort wiki-first, then by Tavily score. Drop non-allowlisted URLs. */
export function rankWikiSnippets(snippets: TavilyResult[]): TavilyResult[] {
  return [...snippets]
    .filter((s) => isAllowlisted(s.url))
    .sort((a, b) => {
      const aWiki = isWikiDomain(a.url) ? 1 : 0;
      const bWiki = isWikiDomain(b.url) ? 1 : 0;
      if (bWiki !== aWiki) return bWiki - aWiki;
      return b.score - a.score;
    });
}

/** Dedupe snippets by URL, keeping the highest-scored copy. */
export function dedupeSnippets(snippets: TavilyResult[]): TavilyResult[] {
  const byUrl = new Map<string, TavilyResult>();
  for (const s of snippets) {
    const prev = byUrl.get(s.url);
    if (!prev || s.score > prev.score) byUrl.set(s.url, s);
  }
  return [...byUrl.values()];
}

/**
 * Wiki-first Tavily search: hits Leaguepedia/Liquipedia/Fandom aggressively, then
 * backfills from secondary allowlisted domains if wiki results are thin.
 */
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
    return rankWikiSnippets(dedupeSnippets(wikiResults)).slice(0, maxResults);
  }

  const secondary = await searchTavily(apiKey, query, {
    maxResults: Math.max(3, maxResults - wikiResults.length),
    includeDomains: [...TAVILY_SECONDARY_DOMAINS],
    searchDepth: "basic",
  });

  return rankWikiSnippets(dedupeSnippets([...wikiResults, ...secondary])).slice(0, maxResults);
}
