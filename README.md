# nucky.gg

[![Live](https://img.shields.io/badge/live-nucky.gg-c5a059)](https://nucky.gg)
[![Refresh Dashboard Data](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml/badge.svg)](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)

**Tier-1 League of Legends esports analytics SaaS** — a design-forward dashboard plus **nuckyAI**, a grounded analyst for pro play. Built and shipped as a solo full-stack product.

[Live product](https://nucky.gg) · [Support](https://buymeacoffee.com/geonbu) · [Issues](https://github.com/ryan-67/lol-dashboard/issues)

---

## What this project is

**nucky.gg** is a production SaaS, not a weekend demo:

| Surface | What it does |
|---------|----------------|
| **Dashboard** | Five-tab analytics (Overview, Players, Teams, Champions, Matchups) over Oracle's Elixir pro data |
| **nuckyAI** | Subscription-gated chat analyst with streaming answers, radar compares, and retrieval-augmented context |
| **Accounts** | Supabase Auth (OAuth), profiles, favorites |
| **Billing** | Stripe Pro subscription ($9.99/mo) with portal cancel/renew |

Data spans **LCK, LPL, LEC, LCS**, international events (MSI, Worlds, First Stand), and multiple splits — filtered globally from a sticky header.

---

## Portfolio snapshot vs. private SaaS code

This repository is **portfolio-ready**: it shows UI craft, data engineering, and architecture clearly enough for recruiters and hiring managers.

**Proprietary backend source is intentionally excluded** from GitHub (agent orchestration, Stripe webhooks, RAG indexer, SQL migrations) so the live product cannot be copy-pasted. Your local checkout can still contain those folders; they are gitignored.

| Public in this repo | Private (local / production only) |
|---------------------|-----------------------------------|
| Dashboard UI + `src/lib` analytics | `supabase/functions/agent-chat/` |
| nuckyAI **client** (chat shell, SSE hook) | Stripe edge functions |
| OE ingest + Supabase seed + CI refresh | `scripts/rag-indexer/src/` |
| Auth & profile **frontend** | Full `supabase/migrations/` |

Details: [docs/PRIVATE_COMPONENTS.md](docs/PRIVATE_COMPONENTS.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Licensing: [NOTICE.md](NOTICE.md)

---

## Highlights for recruiters

- **End-to-end ownership** — data pipeline, SPA, auth, payments integration, and AI product surface
- **Real dataset** — Oracle's Elixir CSVs (100MB+ yearly files), not mock JSON
- **Client-side analytics** — role-aware composite scores, cohort normalization, weekly meta deltas, H2H matchups
- **Production ops** — scheduled GitHub Actions ingest, Supabase hosting, Cloudflare Pages deploy
- **SaaS constraints** — usage limits, RLS, subscription gating, streaming edge API (documented, source private)
- **Design system** — custom monolith-minimal tokens, GSAP + Lenis, zero border-radius / no shadows

---

## Product features

### Dashboard (open source)

- **Overview** — team winrate bars, player scatter (GD@15 vs KDA), champion presence vs winrate
- **Champions** — OP spotlight (z-score), rising/falling presence & winrate, role filters, sortable table
- **Teams** — multi-select compare with overlay radar, cohort scatter, expandable metrics
- **Players** — form trajectory, champion pool, consistency strip, role-specific radars, multi-select compare
- **Matchups** — team H2H, dual radars, unique picks, lane-by-lane player mini-radars
- **FAQ** — product docs, about, support link

### nuckyAI (product; backend private)

- Grounded answers from **Oracle's Elixir** stats (not solo-queue sites)
- Deterministic tools: matchups, player rankings, champion meta, team form, lane breakdowns, schedules
- **pgvector RAG** over Liquipedia, patch notes, Reddit, and other tier-1 sources (weekly refresh)
- Team/player **radar charts** streamed before analysis text
- Conversation history, daily/monthly usage caps, Pro subscription gate

### Platform

- Supabase Auth + `profiles` (username, favorites, avatar)
- Stripe Checkout + Customer Portal
- Privacy policy and profile management pages

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 5, React Router 6 |
| Styling | Tailwind 3 + `src/theme/tokens.css` (Noto Sans Mono, matte gold `#c5a059`) |
| Charts | Recharts 2 |
| Motion | GSAP 3 + ScrollTrigger, Lenis smooth scroll |
| Data store | Supabase Postgres (`oe_slices` JSONB) |
| Data pipeline | Python 3.11 — download, ingest, seed, verify |
| AI product | Supabase Edge Functions + OpenRouter (private source) |
| Vector search | pgvector `documents` table (private indexer) |
| Payments | Stripe (private webhooks) |
| Hosting | Cloudflare Pages → [nucky.gg](https://nucky.gg) |

---

## Architecture (summary)

```
Oracle's Elixir CSVs
        │
        ▼
ingest_csv.py ──► JSON shards ──► seed_supabase.py ──► oe_slices
        │                                              │
        └──────── refresh-data.yml (weekly CI) ────────┘
                                                       │
Browser SPA ◄──────── Supabase PostgREST ──────────────┘
        │
        ├── Dashboard: mergeSlices() + src/lib analytics
        └── nuckyAI UI ──► agent-chat edge (private) ──► LLM + RAG + tools
```

Full diagram: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Repository layout (public)

```
lol-dashboard/
├── src/
│   ├── pages/              # Overview, Players, Teams, Champions, Matchups, nuckyAI, FAQ, Profile
│   ├── components/         # Tab UIs + nuckyai/ chat client
│   ├── lib/                # Analytics engines (mergeSlices, championAnalytics, …)
│   ├── context/            # Dashboard + Auth providers
│   └── theme/              # Design tokens, GSAP helpers, chart theme
├── scripts/
│   ├── ingest_csv.py       # OE CSV → slice JSON
│   ├── seed_supabase.py    # JSON → Supabase
│   ├── download_oe_csv.py  # Drive fetch (CI)
│   └── verify_supabase_seed.py
├── supabase/functions/     # README stubs only (implementations private)
├── docs/                   # ARCHITECTURE.md, PRIVATE_COMPONENTS.md
├── .github/workflows/
│   └── refresh-data.yml    # Weekly OE refresh
└── public/                 # SPA assets, _redirects
```

---

## Data pipeline (public)

**`scripts/ingest_csv.py`** aggregates Oracle's Elixir into per-`(split, league)` slices: players (with `gameLog`), teams, champions (weekly buckets), matchups, team-champion pools. Schema **v2.1**.

**`scripts/seed_supabase.py`** upserts shards into `oe_slices`.

**CI** (`refresh-data.yml`, Sunday 22:00 UTC): download CSVs → ingest → seed → verify → commit JSON backup.

```bash
pip install -r scripts/requirements-ingest.txt
npm run ingest
npm run seed:supabase   # needs SUPABASE_* in .env
```

---

## Design system

Monolith-minimal: charcoal surfaces, cream text, matte gold accent, **no border-radius, no shadows**. GSAP scroll entrances; Lenis + ScrollTrigger scroller proxy; tab fades via `AnimatedOutlet`.

---

## Local development (dashboard)

### Prerequisites

- Node.js 20+
- Python 3.11+ (optional, for ingest/seed)
- Supabase project with `oe_slices` seeded
- `.env` from `.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

### Commands

```bash
npm install
npm run dev          # http://localhost:5173 — loads slices from Supabase
npm run build
npm run preview
```

**nuckyAI** requires the hosted `agent-chat` function on your Supabase project; edge function source is not in this repo.

---

## Deployment

| Setting | Value |
|---------|-------|
| Platform | Cloudflare Pages |
| Domain | [nucky.gg](https://nucky.gg) |
| Build | `npm run build` → `dist/` |
| SPA | `public/_redirects` → `/* /index.html 200` |

Data is not baked at build time; the SPA fetches `oe_slices` at runtime.

---

## Roadmap / limitations

| Area | Status |
|------|--------|
| Live match state | Schedule table + OE lag; not real-time spectator API |
| Leagues | Tier-1 + MSI / Worlds / First Stand |
| nuckyAI clone | Backend intentionally private |
| Mobile | Usable; chart-heavy layouts favor desktop |

---

## Contributing

Issues and PRs are welcome for **dashboard UI, analytics, and data pipeline** improvements. Please do not open PRs that paste proprietary agent, Stripe, or RAG source — those are maintained out of band.

1. `npm run build` must pass
2. Follow `src/theme/` conventions (tokens, no radius/shadows)
3. Keep analytics in `src/lib/`

---

## Author

**geonbu** — solo developer, LoL esports fan. [Buy Me a Coffee](https://buymeacoffee.com/geonbu)

---

## License

Published dashboard and pipeline code: [MIT](LICENSE). Proprietary SaaS components: see [NOTICE.md](NOTICE.md).

---

*nucky.gg — pro-play analytics and a grounded analyst for the Rift. Dashboard open for portfolio review; production AI and billing backends maintained separately.*
