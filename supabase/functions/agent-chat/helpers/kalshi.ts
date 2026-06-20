/** Live Kalshi esports prediction markets (public market data API). */

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";

export interface KalshiMarketQuote {
  ticker: string;
  title: string;
  subtitle: string;
  /** Implied yes probability 0–100 (from last price or mid of bid/ask, in cents). */
  yesPercent: number | null;
  eventTicker: string;
  url: string;
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
  }>;
  cursor?: string;
}

const ODDS_HINTS =
  /\b(odds|kalshi|prediction|predict|favorite|favou?rite|who wins|who's gonna win|who is gonna win|betting|market|implied|line)\b/i;

const ESPORTS_HINTS =
  /\b(league of legends|lol esports|lck|lpl|lec|lcs|msi|worlds|esports|t1|gen\.?g|g2|cloud9|blg|tes)\b/i;

const TEAM_TOKENS =
  /\b(T1|Gen\.?G|G2|DK|DRX|HLE|KT|BLG|TES|JDG|WBG|C9|TL|FNC|100T|GAM|PSG|Cloud9|FlyQuest|Liquid|NRG)\b/gi;

export function isOddsQuestion(message: string): boolean {
  return ODDS_HINTS.test(message);
}

function impliedYesPercent(m: {
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

function marketMatchesQuery(
  m: NonNullable<KalshiMarketsResponse["markets"]>[0],
  tokens: string[],
): boolean {
  const hay = `${m.title ?? ""} ${m.subtitle ?? ""} ${m.ticker ?? ""}`.toLowerCase();
  if (!ESPORTS_HINTS.test(hay) && tokens.length === 0) return false;
  if (tokens.length === 0) return ESPORTS_HINTS.test(hay);
  return tokens.some((t) => hay.includes(t.toLowerCase()));
}

/**
 * Fetch open Kalshi markets and filter for LoL/esports + entities in the user message.
 * Public endpoint — no auth required; KALSHI_API_KEY reserved for future signed routes.
 */
export async function fetchEsportsMarketOdds(
  message: string,
  _apiKey?: string,
): Promise<{ block: string; markets: KalshiMarketQuote[] }> {
  if (!isOddsQuestion(message) && !ESPORTS_HINTS.test(message)) {
    return { block: "", markets: [] };
  }

  try {
    const tokens = [...(message.match(TEAM_TOKENS) ?? [])].map((t) => t.trim());
    const quotes: KalshiMarketQuote[] = [];
    let cursor: string | undefined;
    let pages = 0;

    while (pages < 3 && quotes.length < 8) {
      const params = new URLSearchParams({
        status: "open",
        limit: "200",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${KALSHI_API_BASE}/markets?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) break;

      const json = (await res.json()) as KalshiMarketsResponse;
      for (const m of json.markets ?? []) {
        if (!m.ticker || !m.title) continue;
        if (!marketMatchesQuery(m, tokens)) continue;
        const yesPercent = impliedYesPercent(m);
        if (yesPercent == null) continue;
        quotes.push({
          ticker: m.ticker,
          title: m.title,
          subtitle: String(m.subtitle ?? ""),
          yesPercent,
          eventTicker: String(m.event_ticker ?? ""),
          url: `https://kalshi.com/markets/${encodeURIComponent(m.ticker)}`,
        });
        if (quotes.length >= 8) break;
      }

      cursor = json.cursor;
      if (!cursor) break;
      pages++;
    }

    if (!quotes.length) return { block: "", markets: [] };

    const lines = quotes.map((q) => {
      const label = q.subtitle ? `${q.title} — ${q.subtitle}` : q.title;
      return `- ${label}: yes ${q.yesPercent}% (${q.ticker})`;
    });

    return {
      block: `[KALSHI_ODDS]\nLive Kalshi esports markets (implied yes %). Cite casually; do NOT invent odds beyond this block.\n${lines.join("\n")}`,
      markets: quotes,
    };
  } catch {
    return { block: "", markets: [] };
  }
}
