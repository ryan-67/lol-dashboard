# nucky.gg

[![Live](https://img.shields.io/badge/live-nucky.gg-c5a059)](https://nucky.gg)
[![Refresh Dashboard Data](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml/badge.svg)](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)

**Tier-1 League of Legends esports analytics** — a public dashboard, **nuckyAI** analyst (SaaS), and live match hub roadmap. Built and shipped as a solo full-stack product.

[Live product](https://nucky.gg) · [Support](https://buymeacoffee.com/geonbu) · [Issues](https://github.com/ryan-67/lol-dashboard/issues)

---

## What this project is

| Surface | What it does |
|---------|----------------|
| **Dashboard** | Tier-1 analytics: Overview hub, Players, Teams, Champions, Tournaments, Matchups |
| **Entity pages** | Player, team, champion, tournament, and series identity pages with scoped filters |
| **nuckyAI** | Subscription-gated chat analyst (client in repo; edge backend private) |
| **Live hub** | Schedule-driven match hub (roadmap; not real-time spectator API) |

Data spans **LCK, LPL, LEC, LCS**, international events (MSI, Worlds, First Stand), and multiple splits. Oracle's Elixir is the historical backbone; **CitoAPI Pro** enriches 2026 tier-1 postgame timelines where linked.

---

## Public repo vs. private production code

This repository is **portfolio-ready** and safe to publish. Proprietary backend source is **gitignored** (agent orchestration, Stripe webhooks, RAG indexer, full SQL migrations).

| Public in this repo | Private (local / production only) |
|---------------------|-----------------------------------|
| Dashboard UI + `src/lib` analytics | `supabase/functions/agent-chat/` implementations |
| nuckyAI **client** (chat shell, SSE hook) | Stripe edge functions |
| OE ingest + Supabase seed + CI refresh | `scripts/rag-indexer/src/` |
| Auth & profile **frontend** | Full `supabase/migrations/` |

See [docs/PRIVATE_COMPONENTS.md](docs/PRIVATE_COMPONENTS.md) and [NOTICE.md](NOTICE.md).

---

## Dashboard features

- **Overview** — weekly/monthly player & team hubs, champion of the week, hottest team, weekly recap
- **Players** — role radars, form charts, champion pool, multi-select compare, fair composite scoring
- **Teams** — radar grid, comparison overlay, full metrics table, Cito gold/objective timelines on entity pages
- **Champions** — OP spotlight, presence/winrate deltas, role filters
- **Tournaments** — series standings, match list, scoped entity analytics
- **Matchups** — H2H team compare, lane player radars
- **Entity pages** — career filters (ALL year on player/team/champion pages), match history, series pages

### Filters

- **Main tabs** (Overview, Players, Teams, …): League + specific **Year** + Split (ALL split allowed; ALL year is **not** offered)
- **Entity pages** (player/team/champion): League + Year (**ALL** for career) + Split (canonical seasons when year is ALL — Winter, Spring, MSI, etc.)

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 5, React Router 6 |
| Styling | Tailwind 3 + `src/theme/tokens.css` |
| Charts | Recharts 2, GSAP + Lenis |
| Data | Supabase Postgres (`oe_slices` JSONB) |
| Pipeline | Python 3.11 — `ingest_csv.py`, `seed_supabase.py`, weekly CI |
| Enrichment | CitoAPI postgame gold/objectives (2026 tier-1, optional sync scripts) |
| Hosting | Cloudflare Pages → [nucky.gg](https://nucky.gg) |

---

## Local development

### Prerequisites

- Node.js 20+
- Python 3.11+ (for ingest/seed)
- Supabase project with `oe_slices` seeded
- `.env` from `.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

### Commands

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
npm run ingest       # rebuild slices from lol/ CSVs (optional)
npm run seed:supabase
```

---

## Data pipeline

**`scripts/ingest_csv.py`** aggregates Oracle's Elixir into per-`(split, league)` slices. Partial stats (e.g. LPL @15, solo kills) are omitted when absent rather than zero-filled.

**CI** (`refresh-data.yml`, weekly): download CSVs → ingest → seed → verify.

---

## Contributing

Issues and PRs welcome for dashboard UI, analytics, and data pipeline. Please do not paste proprietary agent, Stripe, or RAG source.

1. `npm run build` must pass
2. Follow `src/theme/` conventions
3. Keep analytics in `src/lib/`

---

## License

Dashboard and pipeline code: [MIT](LICENSE). Proprietary SaaS components: [NOTICE.md](NOTICE.md).

---

*nucky.gg — pro-play analytics for the Rift. Dashboard open for portfolio review; production AI and billing backends maintained separately.*
