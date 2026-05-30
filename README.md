# nucky

[![Refresh Dashboard Data](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml/badge.svg)](https://github.com/ryan-67/lol-dashboard/actions/workflows/refresh-data.yml)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)

**A static, design-forward analytics dashboard for tier-1 League of Legends esports — built on Oracle's Elixir data.**

[Live site](https://nucky.gg) · [Report an issue](https://github.com/ryan-67/lol-dashboard/issues)

---

## Motivation / Why

Professional LoL generates an enormous amount of structured match data, but most of it lives in spreadsheets and CSV exports that are painful to explore in real time. **nucky** turns that raw Oracle's Elixir feed into something you can actually *use*: a fast, filterable dashboard for analysts, fans, and portfolio visitors who want to understand the meta, compare players, and break down head-to-head matchups without spinning up a backend.

It scratches the itch of "I want Rift data at a glance" — league standings, champion trends, player form curves, team radars — in a single cohesive UI that loads instantly and ships as static HTML.

---

## Overview

**nucky** is a five-tab analytics experience scoped by **league** (LCK, LPL, LEC, LCS, or All Tier 1) and **split** (individual seasons and international events). Pick a context from the sticky header, then move across tabs to follow the story from macro (league snapshot) down to micro (lane-level matchup radars).

Every chart, table, and radar is driven by a preprocessed JSON store (`public/data/oe_slices.json`) that is rebuilt from Oracle's Elixir CSVs at build time. There is no API server, no database, and no loading spinner waiting on a query — just fetch, filter, and render.

### Global filters & defaults

| Control | Options | Default |
|---------|---------|---------|
| **League** | All Tier 1, LCK, LPL, LEC, LCS | All Tier 1 |
| **Split** | All splits + individual events (MSI, Worlds, First Stand, regional splits) | **2026 Spring** |

Filters live in the sticky `TopBar` and propagate to every tab via `DashboardContext`. A manual **Refresh** button re-fetches the data store at runtime.

---

## Features

### Overview
- League/split-aware **team winrate bar chart** and summary stat cards
- **Player performance scatter** (GD@15 vs KDA) with role-colored points and toggleable legend
- **Champion presence vs winrate scatter** with pick-rate sizing
- Animated counters and scroll-triggered section entrances

### Champions
- Global **league + split filters** inherited from the header
- **Role filter bar** (All, Top, Jungle, Mid, ADC, Support)
- **Most OP Champion** spotlight with z-score composite scoring (presence, winrate, ban rate, KDA)
- **Champion Presence** stacked bar chart (pick % + ban %, capped at 200% presence)
- **Pick rate vs win rate scatter** with role toggles and champion focus
- **Rising & Falling Presence** — recent 2 weeks vs prior 2 weeks meta shifts
- **Rising & Falling Winrates** — games 1–5 vs 6–10 win % over each champion's last 10 picks
- **Top Performer cards** — best champion per role with mini sparklines
- Expandable full metrics table (sortable columns)

### Teams
- **Scope toggle**: top-ranked teams vs full cohort
- **Multi-select team comparison** with overlay radar (winrate, objectives, gold/min, etc.)
- Per-team **radar grid** normalized against cohort averages
- **Team scatter plot** (winrate vs average GD@15)
- Expandable full team metrics table

### Players
- **Role filter** with best-player-per-role radar grid (or top-10 when filtered to one role)
- **Multi-select player dropdown** for comparative analytics (defaults to Canyon / GEN.G when available)
- **Form trajectory** — composite performance score with 3-game rolling average and linear regression trend
- **Champion pool** — top 5 champions by games with winrate labels
- **Game-to-game consistency** — jittered scatter strip with mean ± 1σ reference lines
- **Role-specific radar charts** with cohort-normalized axes (different stat weights per role)
- All player trend charts share the same composite score formula as the radar charts
- Expandable full player metrics table

### Matchups
- **Team A / Team B selectors** with swap control
- **Head-to-head record** display (games, wins per side)
- **Dual-team radar comparison** vs cohort averages (Team A cream, Team B teal)
- **Unique champions** panel — picks exclusive to each team's pool
- **Player matchup grid** — lane-by-lane mini radars (KDA, GD@15, DPM, CS@15)

---

## Architecture

| Layer | Technology |
|-------|------------|
| UI | React 18, TypeScript, React Router 6 |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 + custom design tokens (`src/theme/tokens.css`) |
| Charts | Recharts 2 |
| Motion | GSAP 3 + ScrollTrigger, `@gsap/react` |
| Scroll | Lenis smooth scroll (integrated with ScrollTrigger scroller proxy) |
| Data | Python 3 ingestion → static JSON |
| Hosting | Cloudflare Pages |

The app follows a **static-site philosophy**: Oracle's Elixir CSVs are ingested once (locally or in CI) into a slice-indexed JSON store keyed by `{split}|{league}`. At runtime, `mergeSlices()` combines the relevant slices based on the user's league and split selection, and all analytics run client-side in pure TypeScript helpers. This keeps latency low and the deployment surface minimal — a `dist/` folder served from the root domain at `/`.

React Router runs **without a basename** — the app is built for root-domain hosting, not a repo-named subpath.

```
Oracle's Elixir CSVs (lol/)
        │
        ▼
scripts/ingest_csv.py  ──►  public/data/oe_slices.json
        │                           │
        ▼                           ▼
   refresh-data.yml            npm run build
   (scheduled CI)                    │
                                     ▼
                              dist/ → Cloudflare Pages (nucky.gg)
```

---

## Project Structure

```
lol-dashboard/
├── public/
│   ├── _redirects              # Cloudflare SPA fallback (/* → index.html)
│   ├── favicon.svg               # nucky "N" mark
│   └── data/
│       └── oe_slices.json        # Preprocessed slice store (committed, ~16 MB)
├── scripts/
│   ├── ingest_csv.py             # Primary CSV → slice store pipeline
│   └── process_oe_csv.py         # Legacy single-file processor
├── src/
│   ├── pages/                    # Route-level views (Overview, Players, Teams, …)
│   ├── components/
│   │   ├── champions/            # Champions tab charts & cards
│   │   ├── players/              # Player analytics, radars, dropdown
│   │   ├── teams/                # Team radars, scatter, comparison
│   │   ├── matchups/             # H2H team & lane matchup views
│   │   ├── ui/                   # Shared ChartTooltip, Select, SortableTh, …
│   │   ├── Layout.tsx            # Shell, nav, header branding
│   │   ├── TopBar.tsx            # League/split filters
│   │   └── AnimatedOutlet.tsx    # Tab fade transitions
│   ├── lib/                      # Analytics engines (see below)
│   ├── context/                  # DashboardContext — league, split, filtered data
│   ├── hooks/                    # useDashboardData — fetches oe_slices.json
│   └── theme/                    # tokens.css, animations.ts, chartTheme.ts
├── .github/workflows/
│   └── refresh-data.yml          # Daily data refresh (no deploy step)
└── lol/                          # Oracle's Elixir CSVs (local only, not committed)
```

---

## Data Pipeline

### `scripts/ingest_csv.py` (primary)

The main ingestion script reads Oracle's Elixir CSV files from the `lol/` directory (`2024_oracle_elixir.csv`, `2025_oracle_elixir.csv`, `2026_oracle_elixir.csv`) and writes a slice-indexed store to `public/data/oe_slices.json` (schema version **2.1**).

Each slice contains:
- **Players** — aggregated stats plus per-game `gameLog` and `championPool`
- **Teams** — win/loss records, objectives, economy, vision
- **Champions** — pick/ban/presence rates, winrate, weekly buckets (picks, bans, wins, winrate), last-10-game sparklines
- **Matchups** — head-to-head team records
- **Team champions** — per-team champion pick/win data

Rows are bucketed by `{year} {split}` and league. Tier-1 leagues (LCK, LPL, LEC, LCS) are included alongside international events (MSI, Worlds, First Stand). LPL partial-completeness rows are retained alongside complete data.

**Rate calculations:** pick rate, ban rate, and presence use **match count** as the denominator (`team_games / 2`), not player-row count. Presence is capped at 200% (pick % + ban %).

### `scripts/process_oe_csv.py` (legacy utility)

An earlier single-file processor that aggregates a single CSV into `public/dashboard_data.json`. The live dashboard uses the slice store produced by `ingest_csv.py`; this script remains for ad-hoc single-file processing.

### Automated refresh — `refresh-data.yml`

The only GitHub Actions workflow in this repo. It runs on a **daily schedule** (06:00 UTC) and on manual dispatch:

1. Checkout + Python 3.11 setup
2. `python scripts/ingest_csv.py`
3. Commit and push `public/data/oe_slices.json` if changed

There is **no deploy workflow** — Cloudflare Pages watches `main` and rebuilds automatically after every push (including data refresh commits).

---

## Design System

The UI follows a **monolith-minimal** aesthetic defined in `src/theme/`:

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0c0c0c` / `#141414` | Base and surface layers |
| Text | `#f0ece2` / `#9e9a8e` | Primary and secondary copy |
| Accent | `#c5a059` | Matte gold highlights, chart accents |
| Font | Noto Sans Mono | All UI and chart labels |

**Rules:** no border-radius, no box shadows, sharp card borders, warm charcoal palette.

**Branding:** header and browser tab title read **nucky**; the favicon is a matte gold **N** on charcoal (`public/favicon.svg`).

**Motion:** GSAP ScrollTrigger drives scroll entrances and staggered reveals (`src/theme/animations.ts`). Lenis provides smooth scrolling and is wired into ScrollTrigger via `scrollerProxy`. Tab transitions fade through `AnimatedOutlet`. Nested scroll regions (e.g. the player multi-select dropdown) use `data-lenis-prevent` so wheel/trackpad input works correctly.

Chart styling is centralized in `src/theme/chartTheme.ts` with shared tooltip components in `src/components/ui/ChartTooltip.tsx`.

---

## Analytics Engines

All computation lives in `src/lib/` — no magic in JSX.

| Module | Responsibility |
|--------|----------------|
| `mergeSlices.ts` | Selects and merges `{split\|league}` slices; dedupes game logs; merges champion pools; recomputes aggregated rates |
| `championAnalytics.ts` | Pick/ban/presence rates, scatter cohort stats, rising/falling presence (weekly), rising/falling winrate (last 10 games), OP z-scores, role filtering |
| `teamAnalytics.ts` | Team radar normalization, multi-team comparison overlay, scope filtering, composite team scores |
| `playerRadar.ts` | Role-specific radar metrics, cohort min-max normalization, weighted composite performance score |
| `playerAnalytics.ts` | Form trajectory, champion pool bars, consistency strip, multi-player chart series |
| `matchupAnalytics.ts` | Positional matchup grouping, mini radar series, unique champion detection |
| `format.ts` | Shared number and percentage formatters |

**Example — player composite score:** `computeAggregateScore()` in `playerRadar.ts` applies role-specific weights (e.g. jungle weights KP and objective control; ADC weights DPM and gold share), normalizes each stat against the role cohort, and produces a 0–1 score reused across radar charts, form trajectory, and consistency plots.

**Example — rising winrates:** `computeRisingFallingWinrate()` splits each champion's last 10 game results (W/L sparkline) into two halves (games 1–5 vs 6–10) and ranks champions by winrate delta — surfacing champions heating up or cooling off within the current split.

---

## Deployment

The site is hosted on **Cloudflare Pages** at [nucky.gg](https://nucky.gg). Every push to `main` triggers an automatic build and deploy.

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 20+ |
| Base path | `/` (no Vite `base` override) |

SPA routing is handled by `public/_redirects`:

```
/* /index.html 200
```

This ensures React Router routes (`/teams`, `/players`, etc.) resolve correctly on refresh and direct navigation. The redirect file is copied into `dist/` automatically by Vite's public-asset handling.

**Previous hosting:** the project formerly deployed to GitHub Pages at a `/lol-dashboard/` subpath. That workflow has been removed; Cloudflare Pages handles all production deploys.

---

## Local Development

### Prerequisites

- **Node.js** 20+
- **Python** 3.11+ (for ingestion)
- Oracle's Elixir CSV files placed in `lol/` (not committed — large files)

### Commands

```bash
# Install frontend dependencies
npm install

# Regenerate the data store from lol/*.csv
npm run ingest

# Start dev server (http://localhost:5173/)
npm run dev

# Production build (ingest + tsc + vite build)
npm run build

# Preview production build locally
npm run preview
```

`npm run build` automatically runs ingestion via the `prebuild` hook, so a fresh clone with CSVs in `lol/` will produce an up-to-date `oe_slices.json` before compiling.

If you don't have local CSVs, the committed `public/data/oe_slices.json` is sufficient for frontend development.

---

## Roadmap / Known Limitations

| Area | Status |
|------|--------|
| Live / in-progress match data | Not supported — data refreshes on schedule, not in real time |
| Leagues beyond tier-1 + internationals | Limited to LCK, LPL, LEC, LCS, MSI, Worlds, First Stand |
| Deep time-series exploration | Weekly buckets and last-N-game sparklines; no full interactive timeline yet |
| Player/champion search | Filter by league/split/role; no global search bar |
| Mobile layout | Responsive but chart-heavy; best on tablet/desktop |
| CSV source files | Must be downloaded separately from Oracle's Elixir and placed in `lol/` |

Planned directions include richer time-series views, cross-split comparison mode, and expanded league coverage as data availability grows.

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss scope. When submitting:

1. Run `npm run build` locally and confirm it passes
2. Match the existing design system (tokens, no radius/shadows, Noto Sans Mono)
3. Keep analytics logic in `src/lib/`, not inline in components

---

## License

MIT

---

*nucky — built for the Rift. Powered by Oracle's Elixir. Shipped as static HTML on Cloudflare.*
