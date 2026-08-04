# Private / proprietary components

**nucky.gg** is a live SaaS product. This public repository is a **portfolio snapshot**: dashboard, data pipeline, and nuckyAI edge source for recruiter review. Revenue-critical handlers, the RAG indexer, full DB migrations, and internal strategy docs stay **out of GitHub** so the paid product is not a one-click clone.

## What stays on your machine only

| Path / class | Why it is private |
|--------------|-------------------|
| `supabase/functions/stripe-*` (impl) | Checkout, portal, webhook, sync handlers |
| `supabase/functions/_shared/billingSync.ts` | Shared Stripe ↔ Supabase billing sync |
| `scripts/rag-indexer/src/` | Weekly embedding pipeline |
| `supabase/migrations/` (most files) | Full Postgres schema, RLS, subscriptions |
| Internal product / model strategy docs | Monetization IA, deep model design, vendor spike notes, design prompts |
| `.env` / service-role / Stripe / enrichment secrets | Never commit |

These paths are listed in `.gitignore`. README stubs under `stripe-*/README.md` remain public so the architecture is understandable without shipping handlers.

## What is public (safe to show recruiters)

- React dashboard UI, design system, GSAP / Lenis motion
- Client-side analytics engines (`src/lib/*`)
- Match ingest + CDN publish + Supabase seed + refresh CI
- Auth **client** integration (Supabase Auth + profile UI)
- nuckyAI **client** shell + **agent-chat** edge function source (portfolio-visible)
- High-level `docs/ARCHITECTURE.md` + this file
- Public accuracy scorecard artifact / summary (product quality signal)
- FAQ, privacy policy, profile pages
- Allowlisted migration stubs needed for ops docs / CI clarity

## Restoring after clone

If you clone this repo on a new machine, proprietary folders will be empty until you copy them from a private backup or your original dev environment. Recommended: keep a **private** git remote or encrypted archive with the full monorepo.

## Git history note

Commits before the portfolio split may still contain proprietary files. For a fully clean public history, use `git filter-repo` (one-time maintainer task). The current `main` branch going forward omits private billing / RAG / strategy paths.
