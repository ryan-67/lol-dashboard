# Fable 5 prompt — nucky.gg dashboard design overhaul (v1)

Copy everything below the line into a **new Cursor Agent chat with Fable 5**.
Before starting: restart Cursor if needed so project skills are picked up; enable MCP servers `shadcn` / `reactbits` / Playwright; keep the landing page (`/`, `src/components/landing/`, `landing.css`) **untouched**.

---

## Mission

You are Cursor Fable 5. **Completely redesign and elevate the logged-in nucky.gg product dashboard** — AppShell, `/dashboard/*`, `/duo/*`, `/chat`, `/predictions`, and all entity pages — into a premium, living **Signal Instrument**: matte black + turquoise, calm enough to read dense data for hours, expressive enough that it no longer feels like a static analytics grid.

Reference quality bar (dashboard / product UI, not marketing pages):

- https://bklit.com/
- https://www.untitledui.com/react/docs/introduction
- https://github.com/satnaing/shadcn-admin
- https://blocks.tremor.so/
- Plus the motion language already shipped on https://nucky.gg/ (landing) — **adapt**, do not copy cinematic scroll theater into the product.

**Scope lock — product app ONLY.** Do **not** touch:

- Landing page (`/`, `Landing.tsx`, `src/components/landing/**`, `landing.css`, wireframe companion, cursor trail as currently wired for marketing)
- Auth/billing backends, Stripe edge functions, subscriptions tables
- ML pipeline / retrain / artifact generation
- Supabase edge (`agent-chat`, RAG, ingest)
- Legal pages

You **may** restyle chat UI, prediction paywall chrome, and shell navigation. Keep all data wiring, filters, gates, and routes functional.

## Critical instruction: FULL REDESIGN of the product UI, not incremental polish

**Do NOT restrict yourself to existing card layouts, table chrome, KPI tiles, sidebar styling, or page composition.** The current dashboard exists as context for *what data and workflows exist* — not as a design ceiling. You are expected to:

- Redesign shell, page headers, section composition, chart chrome, tables, empty states, and entity heroes
- Keep **content and data** (same charts, rankings, radars, model cards, filters, series recaps, prediction board) but **drastically** improve design / UI / UX / motion
- Be creative, expressive, experimental, and bold — while staying true to nucky as a LoL esports **instrument** (signal, not casino; evidence, not hype)
- Delete or replace presentational wrappers that fight the new system; prefer new shared primitives over one-off CSS

Hard constraints:

- **Matte black + turquoise** theme (tokens in `src/theme/tokens.css`; accent ≈ `oklch(0.8 0.115 195)` / `#57c4cf`)
- Cream ink for primary text / comparison series; turquoise reserved for **model output / signal**
- Fonts: **IBM Plex Sans** (UI) + **Noto Sans Mono** (data)
- All existing filters, entity links, prediction gating, and scorecard/model artifact reads must keep working
- Nested scroll on app shell (Lenis is off here — use `getAppScrollScroller()` for ScrollTrigger)

## Product thesis (do not abandon)

**Signal Instrument.** Turquoise means *model / signal*. Surfaces should feel like a precision tool: hairline borders, restrained radius, sparse glow, no purple, no glassmorphism soup, no bounce/elastic eases, no emoji decoration.

Dashboard motion register ≠ landing motion register:

| Landing (already shipped) | Dashboard (this pass) |
| --- | --- |
| Cinematic scrub, pinned scenes, wireframe companion | Short reveals, state feedback, hierarchy |
| Long scrub timelines | 150–400ms micro-motion; counters 0.8–1.6s once |
| Immersive storytelling | Legibility-first; motion never hides numbers |

## Skills / references you MUST read before coding

1. `.agents/skills/nucky-dashboard-motion/SKILL.md` — counters, chart draw, radar, stagger, reduced-motion
2. `.agents/skills/emil-design-eng/SKILL.md` — animation decision framework
3. `.agents/skills/ui-ux-pro-max/SKILL.md` (+ data CSVs for dashboard / charts / react)
4. `.agents/skills/design-taste-frontend/SKILL.md` or taste / impeccable skills if available in the agent skill list
5. `.agents/skills/bklit-ui/SKILL.md` if present — chart/card composition cues
6. Existing helpers: `src/theme/animations.ts`, `AnimatedCounter`, `useScrollReveal`, `chartTheme.ts`

Optional MCP / refs: shadcn components for primitives (button, tabs, tooltip, dialog) **only if they match the Signal Instrument tokens** — do not dump default shadcn zinc/violet themes.

External inspiration (steal *structure*, not brand):

- Bklit — product polish, chart framing, quiet motion
- Untitled UI — density, spacing, component hierarchy
- shadcn-admin — admin shell patterns, data tables
- Tremor blocks — KPI / chart / sparklines layouts

## Surface map (redesign all of these)

### Shell

- `AppShell`, `AppSidebar`, brand mark, mode switch (dashboard / duo / chat)
- Sticky `DashboardFrame` filter strip (`TopBar`, entity portal slots)
- `SectionSubnav`, `PageHeader`, `EntitySearch`, `ProfileMenu`
- Duo mode seam; chat conversation list chrome

### Tabs (`/dashboard` and `/duo`)

| Tab | Keep data / sections | Redesign |
| --- | --- | --- |
| Overview | Weekly/monthly recap, standouts, rankings | Hub composition, KPI strip, recap cards |
| Players | Rankings, radars, compare, tables | Boards, radar grid, trends |
| Teams | Power board, radars, tables | Same |
| Champions | OP spotlight, trajectories, trends, table | Same |
| Matchups | Dual pickers, H2H KPIs, dual radars, lane grid | Same |
| Tournaments | List → entity | Table / list chrome |
| Predictions | Schedule, Log, rankings, Analysis + paywall | Board density, gated chrome |

### Entity pages

Player / Team / Champion / Series / Tournament / PredictionPreview — heroes, model outlook cards (`PlayerModelCard`, `TeamModelCard`), tabs, history tables, gold/objectives charts, series tug-of-war, etc.

### Chat (`/chat`)

Empty state, bubbles, input, paywall — product register, not landing manifesto.

## Motion suite (required)

Ship a coherent product motion language across the app (respect `prefers-reduced-motion`):

1. **Route / tab transitions** — content swap via existing `tabContentSwap` / `tabTransitionIn|Out` or improved equivalent; avoid full-page flash
2. **Scroll reveals** — sections, cards, chart panels fade/slide once into view (`revealDashboardSections`, `scrollEntranceStagger`); stagger ≤ 0.08s
3. **Number tickers** — every major KPI / power / accuracy / Elo readout uses `AnimatedCounter` (or extend it); integers vs 1–2 decimals correctly
4. **Chart / radar entrance** — card reveal then short draw (`animateChartDraw`, `animateRadarDraw`, Recharts `isAnimationActive` gated on visibility)
5. **Hover / press** — row lift, card hairline accent, button press scale (`bindPressScale`, `bindRowHoverLift`); magnetic only where it does not fight dense tables
6. **Cursor trail** — port / adapt the landing Three.js turquoise cursor trail (`CursorTrail` / `animmaster_mouse_11`) as an **opt-in ambient layer for desktop fine pointers only** inside the app shell; disable on coarse pointer, reduced motion, and when it harms chart interaction (or auto-hide while dragging/brushing). Do **not** reintroduce the Faker wireframe companion into the dashboard
7. **Loaders** — elevate `SignalLoader` / skeletons so loading feels intentional

Anti-goals: scroll-hijacking pins, multi-scene scrub storytelling, bounce/elastic, glow soup, purple gradients, animating layout width/height, motion on every table cell.

## Design system work

- Extend `tokens.css` / `dashboard.css` / `shell.css` as needed; keep one coherent surface language
- Rebuild shared primitives: KPI tile, signal card, data table, empty state, chart frame, entity hero
- Chart theme stays turquoise = primary series, cream = comparison; W/L green/red convention preserved
- Empty states: dashed / hatch / quiet copy (no illustrations that fight the brand)

## What to keep (data & wiring)

- `DashboardContext`, league/year/split filters, OE shard loading
- Entity slugs, `EntityLink`, logos, tier-1 gating
- Model artifacts display (`player_ratings`, `region_strength`, scorecard) — read-only
- Predictions board + client Elo + subscription gate UX
- Portal slots for sticky entity chrome
- GSAP scroller proxy via `getAppScrollScroller()`

## Execution loop (required)

1. Read skills listed above. Survey Overview + one entity page + Players tab as the three reference surfaces.
2. Establish / rebuild shared primitives + shell first (so every tab inherits the new language).
3. Sweep tabs → entity pages → chat/predictions chrome.
4. Layer motion: route/tab → scroll reveals → counters → chart/radar → hover → optional cursor trail.
5. Playwright QA: Overview, Players, a Player entity, Teams, Matchups, Predictions (logged-out gate + logged-in if possible), Chat empty/paywall, mobile width ~390, reduced-motion.
6. `npx tsc --noEmit` and `npm run build` clean.
7. Summarize: files changed, primitives added/cut, motion systems shipped, any new deps.

## Success criteria

- Dashboard no longer reads as a “static admin table farm” — it feels like a living instrument
- Same information architecture and data, dramatically better visual hierarchy and feedback
- Motion is purposeful, fast, and consistent; reduced-motion remains usable
- Matte black + turquoise identity matches the redesigned landing without copying its cinematic companion
- Auth, filters, entity navigation, and checkout/subscribe gates still work
- Build clean; Playwright-verified on key surfaces

## Suggested first commit shape (after a working vertical slice)

`feat(dashboard): overhaul shell and shared signal primitives`  
then tab-by-tab commits — avoid one 10k-line dump if possible.
