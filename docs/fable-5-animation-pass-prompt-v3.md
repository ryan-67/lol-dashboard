# Fable 5 prompt — nucky.gg animation / motion pass (v3)

Copy everything below the line into a **new Cursor Agent chat with Fable 5**. Attach player/team card screenshots when available. Enable MCP servers: `shadcn`, `reactbits`, `anime-js`.

---

## Mission

Perform a **bold animation + UI motion upgrade** of **nucky.gg** (repo: `lol-dashboard`).

The prior Fable 5 design overhaul cleaned the visual system (matte black + turquoise, Signal Instrument) and added basic entrances. The product still feels mostly static. This pass should make landing, chat, and dashboard feel **premium, silky, and alive** — creative freedom encouraged.

**Scope lock**

- Design, UI/UX, and animations only.
- **Do not** change product backend architecture: no Supabase schema/migrations, edge function logic, Stripe contracts, ingest pipelines, OE data shape, or auth/billing behavior.
- Keep essential product content, CTAs, subscribe/paywall paths, and dashboard information architecture.
- Maintain brand: **matte black + turquoise** (`src/theme/tokens.css`). Fonts: IBM Plex Sans + Noto Sans Mono. Avoid AI-slop (purple gradients, cream+terracotta, Inter defaults, glow soup, emoji decoration).

## Skills & tools you MUST use

Read before coding:

1. `.cursor/skills/nucky-animation-toolkit/SKILL.md`
2. GSAP: `.agents/skills/gsap-core`, `gsap-scrolltrigger`, `gsap-timeline`, `gsap-react`, `gsap-plugins`, `gsap-performance`
3. `.cursor/skills/nucky-dashboard-motion/SKILL.md` + extend `src/theme/animations.ts`
4. Taste: `design-taste-frontend`, `gpt-taste`, `high-end-visual-design`, `ui-ux-pro-max`
5. Refs: `reactbits-ref`, `animejs-ref`, `motion-ref`, `kokonutui-ref`, `originkit-ref`, `bklit-charts-ref`
6. `docs/animation-toolkit-setup.md`

**MCP:** query `reactbits`, `anime-js`, `shadcn` for concrete components — adapt to brand; don’t invent mediocre copies.

**Motion priority:** GSAP + ScrollTrigger + Lenis first → React Bits → Anime patterns → Motion for presence/layout → Bklit/Kokonut for chart/UI quality.

---

## Part A — Landing additions

Current landing already has: ambient canvas, horizontal story scrub (`StoryScroll`), dual ticker, ScrambleText use-case cycle, league cards.

### Required

1. **Orbit images for league/tournament logos**
   - Reference: https://reactbits.dev/animations/orbit-images
   - Target section: league/tournament cards (LCK, LPL, LEC, LCS, First Stand, MSI, Worlds, EWC) currently inside the horizontal scroll “every stage” panel.
   - **Move this coverage block to the leftmost / first panel** of the horizontal scrub.
   - Logos should **persistently orbit** (respect `prefers-reduced-motion` → static grid).
   - Reuse `LeagueLogo` / existing assets; brighten EWC if needed.

2. **Cursor-reactive background**
   - References: https://reactbits.dev/animations/cursor-grid and https://animate-ui.com/docs/components/backgrounds/hexagon
   - Extend or replace ambient bg so pointer movement drives subtle grid/hex/node reactions.
   - On-brand: turquoise signal on matte black; tasteful, not busy; reduce-motion → static.

3. **Example player/team flip cards**
   - References: https://animate-ui.com/docs/components/community/flip-card
   - Persistently cycle or allow hover-flip between example entity cards and **nucky model rating** backside (Elo / player power style — mock or load public artifacts only; no new backend).
   - User may attach screenshots of desired card faces — match those compositions.

4. **Image mouse-trail section**
   - Reference: https://www.ui-layouts.com/components/image-mousetrail
   - Section copy like **“nucky knows”** with trail of player headshots / team / league logos on hover.
   - Headshots: popular players (Faker, Chovy, ShowMaker, Canyon, Caps, Knight, Viper, Gumayusi, Zeus, …) from public sources (e.g. lol.fandom) or local/public assets if present; logos already in repo.

5. **Extra scroll/text craft (pick what fits)**
   - https://morphin.dev/components/scroll-scramble-section
   - https://morphin.dev/components/scroll-text-reveal-animation
   - https://morphin.dev/components/saas-hero-with-animated-background
   - https://morphin.dev/components/animated-feature-cards-for-react-tailwind-framer-motion
   - Integrate without fighting existing Lenis + StoryScroll pins.

Keep hero as one composition; don’t dump dashboard clutter into the first viewport.

---

## Part B — Dashboard / shell / chat motion

Dashboard is cleaner but still too static. Add motion that conveys hierarchy and state — not perpetual noise on dense tables.

### Required

1. **Section / chart appear-on-scroll**
   - Cards, charts, radars, rankings blocks should slide/fade into view (extend `scrollEntrance`, `animateChartDraw`, `animateRadarDraw`, `staggerListReveal`).
   - Prefer transform + opacity; one hero motion moment per fold.

2. **Richer hover / cursor / micro-interactions**
   - Rows, KPI tiles, nav items, buttons — subtle lift, accent underline, focus rings already exist; deepen craft.

3. **Animated shell chrome**
   - Sidebar, navbar active states, profile button, primary CTAs (save profile, subscribe, sign in).
   - Refs: https://morphin.dev/components/motion-system-dock-navigation-component-for-react-and-framer-motion  
     https://morphin.dev/components/animated-navbar-menu-with-morphing-hover-state  
     https://morphin.dev/components/animated-gradient-button-react  
   - Restyle to nucky tokens (no default purple gradients).

4. **Chart motion inspiration**
   - https://morphin.dev/components/animated-dashboard-performance-chart  
   - https://morphin.dev/components/animated-dot-matrix-sales-chart-for-react-framer-motion-ui-component  
   - Apply patterns to existing Recharts/radar wrappers; keep data hooks intact.

5. **Loading UX (10–15s cold loads)**
   - Premium loaders for dashboard tabs/sections while data resolves.
   - Refs: https://morphin.dev/components/parametric-orbit-loader  
     https://morphin.dev/components/chaotic-dots-loader-for-data-tables  
   - Replace bare “loading…” strings; skeletons + branded loaders; no fake live data.

6. **Preserve recent fixes**
   - Tab/route changes must keep scrolling to top of the nested pane (`.duo-dashboard` / `.dashboard-frame--scroll`).
   - Stat bars (OP spotlight etc.) stay proportional (pct → /100; KDA → /max in filter).
   - Footer stays above ambient layer (`z-index`); don’t reintroduce dim wash over footer.

---

## Creative freedom

Be bold. Prefer fewer, higher-quality signature moments over dozens of weak floaties. If a reference fights brand or performance, adapt the *idea* with GSAP rather than shipping a heavy off-brand clone.

## Anti-goals

- No backend / Stripe / ingest / schema changes.
- No noisy infinite animations on dense ranking tables.
- No WebGL that tanks Lighthouse on dashboard routes.
- Respect `prefers-reduced-motion` everywhere.

## Implementation order

1. Audit landing `StoryScroll` / ambient / shell scroll containers; list files to touch.
2. Query MCP for Orbit Images, cursor grid, flip card patterns.
3. Landing: orbit logos (first story panel) + cursor bg + flip cards + mouse-trail section.
4. Dashboard: scroll reveals, shell/button motion, loaders.
5. Reduced-motion + mobile pass.
6. `npx tsc --noEmit` / build; fix errors.
7. Focused design-only commits + push.
8. Summarize changes + any registry packages added.

## Commit

Focused commits, design-only files. Do not commit secrets. Push when done.

## Success criteria

- Landing has orbiting league logos, cursor-reactive atmosphere, flip entity cards, and a “nucky knows” mouse-trail moment.
- Dashboard feels premium: sections enter on scroll, chrome/buttons animate, loading states are branded.
- Matte black + turquoise preserved end-to-end; product CTAs and IA intact.
