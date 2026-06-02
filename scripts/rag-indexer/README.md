# RAG indexer (Part 2)

Scrapes Liquipedia + Riot patch notes, chunks text, embeds via OpenRouter (`openai/text-embedding-3-small`), upserts into Supabase `documents`.

## Setup

1. Apply migration: `supabase/migrations/20260602120000_documents.sql` (Supabase SQL editor or `npx supabase db push`).
2. Root `.env` needs:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENROUTER_API_KEY`

## Commands

```bash
npm run index:rag       # full pipeline
npm run index:rag:dry   # scrape + chunk only (no embed/upsert)
```

## Sources

- **Liquipedia**: tier-1 Spring splits, team/player pages, recent match pages (MediaWiki API)
- **Patch notes**: [Riot patch notes tag](https://www.leagueoflegends.com/en-us/news/tags/patch-notes/) from Patch 26.1+ (2026 Spring)
- **Reddit**: r/lolesports post-match discussion threads — top-level comments with score ≥ 10 (PullPush fallback if Reddit JSON is blocked)
- **Kalshi**: open tier-1 LoL match odds from `KXLOLGAME` and related series ([Kalshi market data API](https://docs.kalshi.com/getting_started/quick_start_market_data))

## Env vars

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | yes | Upsert target |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Upsert auth |
| `OPENROUTER_API_KEY` | yes (full run) | Embeddings |
| `KALSHI_API_KEY` | optional | Kalshi API key ID header (public market data works without it) |

## Idempotency

Upserts on `(source, source_url, chunk_index)`. Stale chunk indexes are pruned when a page shrinks.
