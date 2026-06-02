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

- **Liquipedia**: tier-1 Spring 2026 splits, team/player pages, recent match pages (API `action=parse`).
- **Patch notes**: [Riot patch notes tag](https://www.leagueoflegends.com/en-us/news/tags/patch-notes/) from Patch 26.1+ (2026 Spring).

## Idempotency

Upserts on `(source, source_url, chunk_index)`. Stale chunk indexes are pruned when a page shrinks.
