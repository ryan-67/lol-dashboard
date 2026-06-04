# RAG indexer (proprietary)

Weekly pipeline that scrapes tier-1 esports context, embeds chunks, and upserts into Supabase `documents`. **Implementation is not published.**

## Sources (production)

- Liquipedia — teams, players, matches, tournaments
- Riot patch notes (26.x+)
- r/lolesports post-match threads
- Kalshi tier-1 LoL odds
- Riot LoL Esports schedule API → `esports_schedules`

## Stack

- TypeScript (`tsx`), OpenRouter embeddings, Supabase service role

## Commands (local maintainer only)

```bash
npm run index:rag
npm run index:rag:dry
```

Requires private `scripts/rag-indexer/src/` and root `.env` secrets. See [docs/PRIVATE_COMPONENTS.md](../../docs/PRIVATE_COMPONENTS.md).
