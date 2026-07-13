# nucky.gg

[![Live](https://img.shields.io/badge/live-nucky.gg-c5a059)](https://nucky.gg)
[![Refresh Dashboard Data](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml/badge.svg)](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)

**Production LoL esports analytics SaaS** — public tier-1 dashboard, subscription **nuckyAI** analyst, and schedule-driven live hub. Solo-built end-to-end: product UI, data ETL, Postgres, edge AI, billing client, and CI.

[Live product](https://nucky.gg) · [Support](https://buymeacoffee.com/geonbu) · [Issues](https://github.com/ryan-67/lol-dashboard/issues)

> **For recruiters:** start with the live site, then skim this README and `src/lib/` (analytics) + `.github/workflows/refresh-data.yml` (ETL). nuckyAI’s edge pipeline lives under `supabase/functions/agent-chat/` (portfolio-visible); Stripe billing handlers and the RAG indexer stay private — see [docs/PRIVATE_COMPONENTS.md](docs/PRIVATE_COMPONENTS.md).

---

## Product surfaces

| Surface | What ships today |
|---------|------------------|
| **Dashboard** | Overview hub, Players, Teams, Champions, Tournaments, Matchups — league/year/split filters |
| **Entity pages** | Player, team, champion, tournament, and **series** identity pages (match history, radars, gold timelines) |
| **nuckyAI** | Auth + Stripe-gated chat analyst: SSE streaming, hybrid retrieval, deterministic tools, ML matchup packet |
| **Live hub** | Schedule-driven match rooms (roadmap toward richer live context; not a Riot spectator feed) |
| **Account** | Supabase Auth, profile, FAQ, privacy policy |

**Leagues / events:** LCK, LPL, LEC, LCS + internationals (MSI, Worlds, First Stand) across multiple splits.

**Data sources:** [Oracle's Elixir](https://oracleselixir.com/) historical match CSVs (backbone) · **CitoAPI Pro** (2026 schedules, series scores, postgame gold/objectives) · optional gol.gg gold backfill · Kalshi odds inside nuckyAI.

---

## Why this repo exists

This is a **portfolio-ready** public snapshot of a live commercial product. Recruiters can review architecture and dashboard/pipeline code without getting a turnkey clone of the paid backend.

| Public here (safe to review) | Private (local / production only) |
|------------------------------|-----------------------------------|
| Dashboard UI + `src/lib` analytics engines | Stripe edge functions (checkout / webhook / portal / sync) |
| nuckyAI **client** + **agent-chat** edge source (3-layer pipeline) | `scripts/rag-indexer/src/` embedding workers |
| OE ingest, CDN shard publish, Supabase seed, CI refresh | Full production SQL migrations (allowlisted stubs only) |
| Auth & billing **frontend** | Secrets, service-role keys, Stripe secret keys |

See [NOTICE.md](NOTICE.md) for license boundaries.

---

## Highlights (what to click)

1. **[nucky.gg](https://nucky.gg)** — Overview weekly hubs, tournament match lists, series pages during MSI/Worlds
2. **Automated ETL** — GitHub Actions every **2 hours**: OE Drive change-detect → ingest → CDN shards → `oe_slices` seed → Cito schedule/results sync → weekly recap generation → gold backfill → ML artifact refresh
3. **Series correctness** — OE mid-Bo5 lag is overlaid with Cito completed scores so tournament lists and recaps don’t freeze on stale 2–0 / 2–2 stubs
4. **nuckyAI** — Guardrail → tool decider (OE / RAG / Cito / Tavily / Kalshi) → grounded SSE synthesis; prediction packet blends structural form, GPR, draft signals, and live market odds

---

## Dashboard features

- **Overview** — weekly/monthly player & team hubs, champion of the week, hottest team, LLM-assisted weekly recap blurbs (concluded series only)
- **Players** — role radars, form charts, champion pool, multi-select compare, composite game scoring
- **Teams** — radar grid, H2H overlay, metrics tables, Cito gold/objective timelines on entity pages
- **Champions** — OP spotlight, presence/winrate deltas, role filters
- **Tournaments** — series standings, match list (Cito-aware scores), scoped player/team/champion analytics
- **Matchups** — team compare + lane player radars
- **Series pages** — per-game tabs, score labels (in-progress Bo3/Bo5), gold charts when timelines exist
- **Entity filters** — main tabs: league + year + split; identity pages: career **ALL** year supported

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 5, React Router 6 |
| UI / motion | Tailwind 3, design tokens (`src/theme/`), Recharts, GSAP, Lenis |
| Backend | Supabase Postgres (`oe_slices` JSONB), Auth, Edge Functions, pgvector RAG |
| AI | OpenRouter routing, SSE streaming, hybrid retrieval (SQL tools + RAG + web allowlist) |
| ML | Python feature mart + series/draft models → exported JSON artifacts for edge inference |
| Pipeline | Python 3.11 ingest/seed; Node/tsx Cito sync + recap generation |
| Enrichment | CitoAPI schedules/scores/gold; gol.gg gold fallback; Kalshi markets (agent) |
| Billing | Stripe Checkout / Customer Portal (handlers private); usage-gated nuckyAI |
| Hosting | Cloudflare Pages → [nucky.gg](https://nucky.gg) |

---

## Data pipeline

```text
Oracle's Elixir (Drive) ──► ingest_csv.py ──► public CDN shards + Supabase oe_slices
                                      │
CitoAPI schedules/results ────────────┼──► series scores, recaps, gold timelines
                                      │
ML train/export ──────────────────────┴──► agent-chat/ml/*.json (nuckyAI predictions)
```

**CI** ([`refresh-data.yml`](.github/workflows/refresh-data.yml)):

1. Check current-year OE Drive metadata (skip full ingest if unchanged)
2. On change (or manual dispatch): download → history backfill → ingest → publish CDN → seed + verify
3. Sync Cito schedules/results (hard failure — scores must land)
4. Generate weekly recap summaries for **concluded** series only
5. Optional: Cito/gol gold backfill, nuckyAI ML retrain (soft-fail)
6. If OE unchanged: still run a lighter **sync-scores** job (Cito + recaps)

---

## Local development

### Prerequisites

- Node.js 20+
- Python 3.11+ (ingest/seed/ML)
- Supabase project with `oe_slices` seeded
- `.env` from [`.env.example`](.env.example) (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

### Commands

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
npm run ingest       # rebuild slices from lol/ CSVs (optional)
npm run seed:supabase
```

---

## Contributing

Issues and PRs welcome for dashboard UI, analytics, and the public data pipeline. Please do not paste proprietary Stripe, RAG indexer, or full migration SQL into PRs.

1. `npm run build` must pass
2. Follow `src/theme/` conventions
3. Keep analytics in `src/lib/`

---

## License

Published dashboard and pipeline code: [MIT](LICENSE). Commercial SaaS backends and branding: [NOTICE.md](NOTICE.md).

---

*nucky.gg — pro-play analytics for the Rift.*
