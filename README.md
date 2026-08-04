# nucky.gg

[![Live](https://img.shields.io/badge/live-nucky.gg-c5a059)](https://nucky.gg)
[![Refresh Dashboard Data](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml/badge.svg)](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)

**Production LoL esports analytics SaaS** — current-form dashboard, schedule foresight, series recaps, power ratings, and subscription **nuckyAI** analyst. Solo-built end-to-end: product UI, data ETL, Postgres, edge AI, ML training, billing client, and CI.

[Live product](https://nucky.gg) · [Support](https://buymeacoffee.com/geonbu) · [Issues](https://github.com/ryan-67/lol-dashboard/issues)

> **For recruiters:** start at [nucky.gg](https://nucky.gg), then skim this README, `src/` (dashboard + entity UX), `scripts/ml/` (ratings + prediction training), and `.github/workflows/refresh-data.yml` (ETL). nuckyAI’s edge pipeline is under `supabase/functions/agent-chat/` for portfolio review. Stripe billing handlers, the RAG indexer, full DB migrations, and internal product strategy docs stay private — see [docs/PRIVATE_COMPONENTS.md](docs/PRIVATE_COMPONENTS.md).

---

## Product identity

nucky is a **current-form foresight product** for tier-1 League of Legends esports — not a historical stats dump.

| Pillar | What users get |
|--------|----------------|
| **Hub** | Weekly / monthly catch-up: concluded series, standouts, LLM-assisted recap blurbs |
| **Board** | Upcoming schedule + foresight surface for futures / series context |
| **Form** | Players · Teams · Champions boards weighted toward recent play |
| **Predictions** | Matchup foresight shell + model packets (subscriber foresight depth) |
| **nuckyAI** | Stripe-gated chat analyst grounded on warehouse stats, RAG, and schedules |
| **Duo** | Side-by-side dashboard + analyst mode for subscribers |

**Leagues / events:** LCK, LPL, LEC, LCS + internationals (MSI, Worlds, First Stand, EWC when applicable).

---

## Product surfaces

| Surface | Routes | Notes |
|---------|--------|-------|
| Marketing landing | `/` | Auth entry, product story, pricing |
| Dashboard | `/dashboard/*` | Hub, Form tabs, Tournaments, Predictions, entity + series pages |
| Duo | `/duo/*` | Same tabs in split layout (subscriber) |
| nuckyAI | `/chat` | SSE streaming analyst (subscriber) |
| Entity pages | `players|teams|champions|tournaments/:slug`, `series/:seriesId` | Identity pages with match history, radars, timelines |
| Account / legal | `/profile`, `/contact`, privacy + terms | Supabase Auth + Stripe portal client |

**Deferred (not current product claims):** Community threads, dense Live spectator hub (route redirects to dashboard for now).

---

## Highlights

1. **[nucky.gg](https://nucky.gg)** — Hub catch-up, Board schedule, Form rankings, series pages during internationals
2. **Automated ETL + model refresh** — GitHub Actions ~every **2 hours**: match-data change-detect → ingest → CDN shards → Supabase seed → schedule/score sync → series recaps → ML artifact refresh
3. **Current-form analytics** — role radars, form trajectories, champion pools, team H2H, power / performance ratings from recent games
4. **Prediction stack** — series + draft feature marts (XGBoost / LightGBM), exported JSON for edge inference, walk-forward accuracy scorecard + prediction holdout logging
5. **nuckyAI** — Guardrail → tool decider → grounded SSE synthesis over stats tools, pgvector RAG, schedules, and allowlisted web; prediction packets for matchup questions

---

## Dashboard features

- **Overview Hub / Board** — weekly & monthly hubs, hottest / standout signals, upcoming schedule, concluded-series recaps
- **Players** — role radars, form charts, champion pool, multi-select compare, composite scoring
- **Teams** — radar grid, H2H overlay, metrics tables, gold / objective timelines when available
- **Champions** — OP spotlight, presence / winrate deltas, role filters
- **Tournaments** — series standings, match lists with live-aware scores, scoped analytics
- **Predictions** — upcoming matchup board + detail preview (deeper foresight gated)
- **Series pages** — per-game tabs, Bo3 / Bo5 score labels, gold charts when timelines exist
- **Filters** — league + year + split on main tabs; career **ALL** year on identity pages

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 5, React Router 6, Tailwind 3 |
| UI / motion | Design tokens (`src/theme/`), Recharts, GSAP + ScrollTrigger, Lenis; Three.js / R3F accents |
| Backend | Supabase Postgres, Auth, Edge Functions (Deno), pgvector RAG |
| AI | OpenRouter routing, SSE streaming, hybrid retrieval (SQL tools + RAG + allowlisted web) |
| ML | Python feature mart + XGBoost / LightGBM series & draft models → JSON artifacts for edge inference |
| Pipeline | Python ingest / seed / train; Node / tsx schedule sync + recap generation |
| Enrichment | Historical Oracle’s Elixir CSVs; live schedule / score APIs; Leaguepedia schedule enrichment; Kalshi odds (agent comparison) |
| Billing | Stripe Checkout / Customer Portal (handlers private); usage-gated nuckyAI |
| Hosting / CI | Cloudflare Pages → [nucky.gg](https://nucky.gg); GitHub Actions refresh + publish |

---

## Data pipeline

```text
Historical match CSVs (OE) ──► ingest ──► CDN shards + Supabase oe_slices
                                      │
Schedule / score sync ────────────────┼──► Board, Hub scores, series grouping, recaps
                                      │
ML train / export ────────────────────┴──► agent-chat/ml/*.json + public ratings artifacts
```

**CI** ([`refresh-data.yml`](.github/workflows/refresh-data.yml)):

1. Change-detect current-year source data (skip heavy ingest if unchanged)
2. On change (or manual dispatch): download → history backfill → ingest → publish CDN → seed + verify
3. Sync schedules / completed series scores (required for Hub / Board freshness)
4. Generate weekly recap summaries for **concluded** series
5. Optional enrichment + ML retrain / artifact publish (soft-fail so scores still ship)
6. If match CSVs unchanged: still run a lighter **sync-scores** job (schedules + recaps)

nucky is evolving the **current** match warehouse toward official Riot esports feeds for fresher box scores while keeping multi-year historical CSVs for training baselines and nuckyAI deep history.

---

## Why this repo exists

This is a **portfolio-ready** public snapshot of a live commercial product. Recruiters can review architecture and dashboard / pipeline code without getting a turnkey clone of the paid backend.

| Public here (safe to review) | Private (local / production only) |
|------------------------------|-----------------------------------|
| Dashboard UI + `src/lib` analytics | Stripe edge functions (checkout / webhook / portal / sync) |
| nuckyAI **client** + **agent-chat** edge source | `scripts/rag-indexer/src/` embedding workers |
| Ingest, CDN publish, Supabase seed, CI refresh | Full production SQL migrations (allowlisted stubs only) |
| Auth & billing **frontend** | Secrets, service-role keys, Stripe secret keys |
| High-level architecture docs | Internal product / monetization / model design docs |

See [NOTICE.md](NOTICE.md) for license boundaries and [docs/PRIVATE_COMPONENTS.md](docs/PRIVATE_COMPONENTS.md) for the full split.

---

## Local development

### Prerequisites

- Node.js 20+
- Python 3.11+ (ingest / seed / ML)
- Supabase project with `oe_slices` seeded
- `.env` from [`.env.example`](.env.example) (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

### Commands

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
npm run ingest       # rebuild slices from local CSVs (optional)
npm run seed:supabase
```

---

## Contributing

Issues and PRs welcome for dashboard UI, analytics, and the public data pipeline. Please do not paste proprietary Stripe handlers, RAG indexer source, full migrations, or internal strategy docs into PRs.

1. `npm run build` must pass
2. Follow `src/theme/` conventions
3. Keep analytics in `src/lib/`

---

## License

Published dashboard and pipeline code: [MIT](LICENSE). Commercial SaaS backends and branding: [NOTICE.md](NOTICE.md).

---

*nucky.gg — current-form analytics for the Rift.*
