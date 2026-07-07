/** Live Kalshi esports prediction markets (Kalshi trade API v2). */

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";

export interface KalshiMarketQuote {
  ticker: string;
  title: string;
  subtitle: string;
  /** Implied yes probability 0–100. */
  yesPercent: number | null;
  eventTicker: string;
  url: string;
  /** Where the price came from. */
  priceSource: "market" | "orderbook" | "unavailable";
}

interface KalshiMarketsResponse {
  markets?: Array<{
    ticker?: string;
    title?: string;
    subtitle?: string;
    yes_bid?: number;
    yes_ask?: number;
    last_price?: number;
    event_ticker?: string;
    status?: string;
    series_ticker?: string;
  }>;
  cursor?: string;
}

interface KalshiOrderbookResponse {
  orderbook_fp?: {
    yes_dollars?: Array<[string, string]>;
    no_dollars?: Array<[string, string]>;
  };
  orderbook?: {
    yes?: Array<[number, number]>;
    no?: Array<[number, number]>;
  };
}

const ODDS_HINTS =
  /\b(odds|kalshi|prediction|predict|favorite|favou?rite|who wins|who's gonna win|who is gonna win|betting|market|implied|line)\b/i;

/** LoL-specific — avoid matching generic Kalshi "ESPORTS" multigame parlays. */
const LOL_ESPORTS_HINTS =
  /\b(league of legends|lol esports|mid-?season invitational|\bmsi\b|\bworlds\b|world championship|lck|lpl|lec|lcs)\b/i;

const TEAM_TOKENS =
  /\b(T1|Gen\.?G|G2|DK|DRX|HLE|Hanwha|KT|BLG|Bilibili|TES|Top Esports|JDG|WBG|C9|Cloud9|TL|Liquid|FNC|Fnatic|100T|GAM|PSG|FlyQuest|NRG|LYON|Secret Whales|FURIA|DCG|GiantX)\b/gi;

/** Kalshi series tickers for League of Legends markets. */
const LOL_SERIES_BY_INTENT: Array<{ series: string[]; match: RegExp }> = [
  {
    series: ["KXLOL", "KXMIDSEASONINVITATIONAL", "KXMIDSEASONINVITATIONALB", "KXEWCRENNSPORT"],
    match: /\b(msi|mid-?season invitational|mid season invitational)\b/i,
  },
  {
    series: ["KXLEAGUE", "KXLEAGUEWORLDS", "KXLOL"],
    match: /\b(worlds|world championship|worlds \d{4})\b/i,
  },
  {
    series: ["KXLOL", "KXLOLGAME", "KXLOLGAMES", "KXLOLMAP", "KXLOLTOTAL", "KXLOLTOTALMAPS", "KXEWCLEAGUEOFLEGENDS"],
    match: /\b(league of legends|lol esports|\blol\b)\b/i,
  },
];

const DEFAULT_LOL_SERIES = ["KXLOL", "KXMIDSEASONINVITATIONAL", "KXLEAGUE", "KXLEAGUEWORLDS"];

export function isOddsQuestion(message: string): boolean {
  return ODDS_HINTS.test(message);
}

function kalshiAuthHeaders(apiKey?: string): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

function impliedYesFromMarket(m: {
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

/** Derive yes mid-price (0–100 cents) from orderbook when market summary is empty. */
async function impliedYesFromOrderbook(
  ticker: string,
  apiKey?: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${KALSHI_API_BASE}/markets/${encodeURIComponent(ticker)}/orderbook`, {
      headers: kalshiAuthHeaders(apiKey),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as KalshiOrderbookResponse;
    const fp = json.orderbook_fp;
    if (fp?.yes_dollars?.length || fp?.no_dollars?.length) {
      const yesBid = fp.yes_dollars?.length
        ? Math.max(...fp.yes_dollars.map(([p]) => parseFloat(p)))
        : null;
      const noBid = fp.no_dollars?.length
        ? Math.max(...fp.no_dollars.map(([p]) => parseFloat(p)))
        : null;
      const yesAsk = noBid != null ? 1 - noBid : null;
      if (yesBid != null && yesAsk != null) {
        return Math.round(((yesBid + yesAsk) / 2) * 100);
      }
      if (yesBid != null) return Math.round(yesBid * 100);
      if (yesAsk != null) return Math.round(yesAsk * 100);
    }

    const ob = json.orderbook;
    if (ob?.yes?.length || ob?.no?.length) {
      const yesBid = ob.yes?.length ? Math.max(...ob.yes.map(([p]) => p)) : null;
      const noBid = ob.no?.length ? Math.max(...ob.no.map(([p]) => p)) : null;
      const yesAsk = noBid != null ? 100 - noBid : null;
      if (yesBid != null && yesAsk != null) return Math.round((yesBid + yesAsk) / 2);
      if (yesBid != null) return yesBid;
      if (yesAsk != null) return yesAsk;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveLoLSeries(message: string): string[] {
  const out = new Set<string>();
  for (const { series, match } of LOL_SERIES_BY_INTENT) {
    if (match.test(message)) {
      for (const s of series) out.add(s);
    }
  }
  if (!out.size) {
    for (const s of DEFAULT_LOL_SERIES) out.add(s);
  }
  return [...out];
}

function isOutrightMarket(title: string, subtitle: string): boolean {
  const hay = `${title} ${subtitle}`.toLowerCase();
  const outrightHints =
    /\b(win (the )?(msi|worlds|tournament|event|championship|title)|tournament winner|outright|to win msi|to win worlds|msi champion|worlds champion|win msi|win worlds)\b/;
  const matchupHints = /\b(vs\.?|versus| v |beat|defeat|match|series|game \d|map \d|bo[35])\b/i;
  return outrightHints.test(hay) && !matchupHints.test(hay);
}

/** Both teams must appear — excludes tournament-outright markets (e.g. "T1 wins MSI"). */
export function isHeadToHeadMarket(
  m: { title?: string; subtitle?: string },
  teamA: string,
  teamB: string,
): boolean {
  const title = m.title ?? "";
  const subtitle = m.subtitle ?? "";
  if (isOutrightMarket(title, subtitle)) return false;
  const hay = `${title} ${subtitle}`.toLowerCase();
  const tokensA = [teamA.toLowerCase(), normKalshiTeam(teamA)];
  const tokensB = [teamB.toLowerCase(), normKalshiTeam(teamB)];
  const hasA = tokensA.some((t) => t.length >= 2 && hay.includes(t));
  const hasB = tokensB.some((t) => t.length >= 2 && hay.includes(t));
  return hasA && hasB;
}

function normKalshiTeam(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Which team does YES on this market refer to? Returns canonical-ish token or null. */
export function inferYesTeamFromMarket(
  m: { title?: string; subtitle?: string },
  teamA: string,
  teamB: string,
): string | null {
  const hay = `${m.title ?? ""} ${m.subtitle ?? ""}`.toLowerCase();
  for (const team of [teamA, teamB]) {
    const t = team.toLowerCase();
    const n = normKalshiTeam(team);
    if (
      new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b.*\\b(win|beat|defeat|advance|qualify)`, "i").test(hay) ||
      new RegExp(`(will|does)\\s+.*\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay)
    ) {
      return team;
    }
    if (n.length >= 2 && hay.includes(n) && /\bwin\b/.test(hay)) return team;
  }
  // "Team A vs Team B" with no winner named — cannot infer side
  return null;
}

export function filterHeadToHeadMarkets(
  markets: KalshiMarketQuote[],
  teamA: string,
  teamB: string,
): KalshiMarketQuote[] {
  return markets.filter((m) => isHeadToHeadMarket(m, teamA, teamB));
}

export function pickMatchupKalshiEdge(
  teamA: string,
  teamB: string,
  markets: KalshiMarketQuote[],
  modelProbA: number,
): MatchupKalshiEdge | null {
  const h2h = filterHeadToHeadMarkets(markets, teamA, teamB);
  if (!h2h.length) return null;

  for (const m of h2h) {
    if (m.yesPercent == null) continue;
    const yesTeam = inferYesTeamFromMarket(m, teamA, teamB);
    const implied = m.yesPercent / 100;
    let modelForYes = modelProbA;
    if (yesTeam && normKalshiTeam(yesTeam) === normKalshiTeam(teamB)) {
      modelForYes = 1 - modelProbA;
    } else if (yesTeam && normKalshiTeam(yesTeam) !== normKalshiTeam(teamA)) {
      continue;
    }
    return {
      ticker: m.ticker,
      title: m.subtitle ? `${m.title} — ${m.subtitle}` : m.title,
      impliedYesPercent: m.yesPercent,
      modelProbPercent: Math.round(modelForYes * 1000) / 10,
      edgePp: Math.round((modelForYes - implied) * 1000) / 10,
      marketKind: "head_to_head",
      yesTeam: yesTeam ?? teamA,
    };
  }
  return null;
}

export interface MatchupKalshiEdge {
  ticker: string;
  title: string;
  impliedYesPercent: number;
  modelProbPercent: number;
  edgePp: number;
  marketKind?: string;
  yesTeam?: string;
}

function marketMatchesTeams(
  m: NonNullable<KalshiMarketsResponse["markets"]>[0],
  teamTokens: string[],
): boolean {
  if (!teamTokens.length) return true;
  const hay = `${m.title ?? ""} ${m.subtitle ?? ""} ${m.ticker ?? ""}`.toLowerCase();
  return teamTokens.some((t) => hay.includes(t.toLowerCase()));
}

function extractOrderedTeamPair(message: string): [string, string] | null {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of message.matchAll(TEAM_TOKENS)) {
    const tok = match[0]!.trim();
    const key = tok.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      found.push(tok);
    }
  }
  if (found.length >= 2) return [found[0]!, found[1]!];
  return null;
}

function isLoLMarket(m: NonNullable<KalshiMarketsResponse["markets"]>[0]): boolean {
  const hay = `${m.title ?? ""} ${m.subtitle ?? ""} ${m.ticker ?? ""} ${m.series_ticker ?? ""}`;
  return LOL_ESPORTS_HINTS.test(hay) || /^KXLOL/i.test(m.ticker ?? "");
}

async function fetchSeriesMarkets(
  seriesTicker: string,
  apiKey?: string,
): Promise<NonNullable<KalshiMarketsResponse["markets"]>> {
  const params = new URLSearchParams({
    status: "open",
    series_ticker: seriesTicker,
    limit: "100",
  });
  const res = await fetch(`${KALSHI_API_BASE}/markets?${params.toString()}`, {
    headers: kalshiAuthHeaders(apiKey),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as KalshiMarketsResponse;
  return json.markets ?? [];
}

async function enrichQuote(
  m: NonNullable<KalshiMarketsResponse["markets"]>[0],
  apiKey?: string,
): Promise<KalshiMarketQuote | null> {
  if (!m.ticker || !m.title) return null;

  let yesPercent = impliedYesFromMarket(m);
  let priceSource: KalshiMarketQuote["priceSource"] = yesPercent != null ? "market" : "unavailable";

  if (yesPercent == null) {
    yesPercent = await impliedYesFromOrderbook(m.ticker, apiKey);
    if (yesPercent != null) priceSource = "orderbook";
  }

  return {
    ticker: m.ticker,
    title: m.title,
    subtitle: String(m.subtitle ?? ""),
    yesPercent,
    eventTicker: String(m.event_ticker ?? ""),
    url: `https://kalshi.com/markets/${encodeURIComponent(m.ticker)}`,
    priceSource,
  };
}

/**
 * Fetch Kalshi LoL/esports markets for the user's question.
 * Uses series-targeted lookup (KXLOL for MSI) + orderbook fallback for live implied %.
 */
export async function fetchEsportsMarketOdds(
  message: string,
  apiKey?: string,
): Promise<{ block: string; markets: KalshiMarketQuote[] }> {
  if (!isOddsQuestion(message) && !LOL_ESPORTS_HINTS.test(message)) {
    return { block: "", markets: [] };
  }

  try {
    const teamTokens = [...(message.match(TEAM_TOKENS) ?? [])].map((t) => t.trim());
    const seriesList = resolveLoLSeries(message);
    const seenTickers = new Set<string>();
    const rawMarkets: NonNullable<KalshiMarketsResponse["markets"]> = [];

    for (const series of seriesList) {
      const batch = await fetchSeriesMarkets(series, apiKey);
      for (const m of batch) {
        if (!m.ticker || seenTickers.has(m.ticker)) continue;
        if (!isLoLMarket(m)) continue;
        if (!marketMatchesTeams(m, teamTokens)) continue;
        seenTickers.add(m.ticker);
        rawMarkets.push(m);
      }
    }

    // Fallback: scan generic open markets only for explicit LoL titles (not ESPORTS parlays).
    if (rawMarkets.length < 3) {
      let cursor: string | undefined;
      for (let page = 0; page < 2 && rawMarkets.length < 12; page++) {
        const params = new URLSearchParams({ status: "open", limit: "200" });
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`${KALSHI_API_BASE}/markets?${params.toString()}`, {
          headers: kalshiAuthHeaders(apiKey),
        });
        if (!res.ok) break;
        const json = (await res.json()) as KalshiMarketsResponse;
        for (const m of json.markets ?? []) {
          if (!m.ticker || seenTickers.has(m.ticker)) continue;
          if (!isLoLMarket(m)) continue;
          if (!marketMatchesTeams(m, teamTokens)) continue;
          seenTickers.add(m.ticker);
          rawMarkets.push(m);
        }
        cursor = json.cursor;
        if (!cursor) break;
      }
    }

    if (!rawMarkets.length) return { block: "", markets: [] };

    const toEnrich = rawMarkets.slice(0, 16);
    const quotes: KalshiMarketQuote[] = [];
    const batchSize = 6;
    for (let i = 0; i < toEnrich.length; i += batchSize) {
      const batch = await Promise.all(
        toEnrich.slice(i, i + batchSize).map((m) => enrichQuote(m, apiKey)),
      );
      for (const q of batch) {
        if (q) quotes.push(q);
      }
    }

    // Prefer markets with live prices; still list unavailable at end.
    quotes.sort((a, b) => {
      const aScore = a.yesPercent ?? -1;
      const bScore = b.yesPercent ?? -1;
      return bScore - aScore;
    });

    const priced = quotes.filter((q) => q.yesPercent != null);
    let display = (priced.length ? priced : quotes);

    const pair = extractOrderedTeamPair(message);
    if (pair) {
      const h2h = filterHeadToHeadMarkets(display, pair[0], pair[1]);
      if (h2h.length) {
        display = h2h;
      } else {
        display = display.filter((q) => !isOutrightMarket(q.title, q.subtitle));
      }
    } else {
      display = display.filter((q) => !isOutrightMarket(q.title, q.subtitle));
    }
    display = display.slice(0, 12);

    if (!display.length) return { block: "", markets: [] };

    const header = pair
      ? "Live Kalshi head-to-head markets for this matchup (implied yes %). For series predictions use ONLY markets naming BOTH teams — never tournament-outright lines (e.g. 'win MSI')."
      : "Live Kalshi League of Legends markets (implied yes % from market or orderbook).";

    const lines = display.map((q) => {
      const label = q.subtitle ? `${q.title} — ${q.subtitle}` : q.title;
      if (q.yesPercent != null) {
        return `- ${label}: yes ${q.yesPercent}% (${q.ticker}, ${q.priceSource})`;
      }
      return `- ${label}: no live price on book right now (${q.ticker})`;
    });

    return {
      block: `[KALSHI_ODDS]\n${header} Cite these numbers casually; do NOT invent odds beyond this block.\n${lines.join("\n")}`,
      markets: display,
    };
  } catch {
    return { block: "", markets: [] };
  }
}
