# License notice

## Open source (this repository)

Unless stated otherwise, the **published** files in this repository are available under the [MIT License](./LICENSE).

That includes, in particular:

- `src/` — dashboard UI and client-side analytics
- `scripts/ingest_csv.py`, `scripts/seed_supabase.py`, schedule/recap public tooling, and related pipeline scripts
- `public/` assets and SPA configuration
- `supabase/functions/agent-chat/` — nuckyAI edge pipeline (published for portfolio review)

## Proprietary (not published)

The following are part of the **nucky.gg** commercial product and are **not** licensed for redistribution:

- Stripe billing edge functions (`stripe-checkout`, `stripe-webhook`, `stripe-portal`, `stripe-sync`) and shared billing helpers
- RAG indexer implementation (`scripts/rag-indexer/src/`)
- Full Supabase SQL migrations as applied in production (beyond allowlisted stubs)
- Internal product strategy, monetization, and deep model-design documents

You may not use the nucky.gg name, branding, or hosted backend to operate a competing service. The live product is at [https://nucky.gg](https://nucky.gg).

Reviewing this repository for hiring / portfolio purposes is welcome. For licensing questions, open a GitHub issue or use the contact links on [nucky.gg](https://nucky.gg).
