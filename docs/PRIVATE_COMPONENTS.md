# Private / proprietary components

**nucky.gg** is a live SaaS product. This public repository is a **portfolio snapshot** of the analytics dashboard and data pipeline. The revenue-bearing backend (AI agent, billing, RAG indexer, and full database migrations) is **not published** so the product cannot be trivially cloned.

## What stays on your machine only

| Path | Why it is private |
|------|-------------------|
| `supabase/functions/agent-chat/` | nuckyAI orchestration: prompts, tool router, RAG/SQL tools, streaming, usage limits |
| `supabase/functions/stripe-*` | Checkout, portal, webhook handlers |
| `scripts/rag-indexer/src/` | Weekly embedding pipeline (Liquipedia, patch notes, Reddit, Kalshi, schedules) |
| `supabase/migrations/` | Full Postgres schema, RLS, `match_documents`, subscriptions |
| `.github/workflows/index-rag.yml` | RAG CI (if present locally) |

These paths are listed in `.gitignore`. Your local copies are unchanged when you pull; they simply are not pushed to GitHub.

## What is public (safe to show recruiters)

- React dashboard UI, design system, GSAP motion
- Client-side analytics engines (`src/lib/*`)
- Oracle's Elixir ingest + Supabase seed scripts
- Auth **client** integration (Supabase Auth + profile UI)
- nuckyAI **client** shell (chat UI, streaming hook — calls hosted edge functions)
- FAQ, privacy policy, profile pages

## Restoring after clone

If you clone this repo on a new machine, proprietary folders will be empty until you copy them from a private backup or your original dev environment. Recommended: keep a **private** git remote or encrypted archive with the full monorepo.

## Git history note

Commits before the portfolio split may still contain proprietary files. For a fully clean public history, use `git filter-repo` (one-time maintainer task). The current `main` branch going forward omits those paths.
