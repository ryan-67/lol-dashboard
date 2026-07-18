# Fable 5 Holistic Design Overhaul Prompt

Copy the fenced prompt into a **new Cursor Agent chat** with model **Fable 5**. Do not attach a long bug/feature checklist in the same message.

## Skill routing

| Priority | Path | Role |
|---|---|---|
| 1 | `C:/Users/Ryan/.claude/skills/impeccable/SKILL.md` + `reference/product.md` | Product-register craft |
| 2 | `.agents/skills/redesign-existing-projects/SKILL.md` | Audit-then-upgrade |
| 3 | `.agents/skills/ui-ux-pro-max/SKILL.md` | Chart/layout/motion options |
| 4 | `.agents/skills/nucky-dashboard-motion/SKILL.md` | GSAP helpers |
| 5 | `.agents/skills/design-taste-frontend/SKILL.md` + impeccable `reference/brand.md` | Landing only |
| 6 | `C:/Users/Ryan/.claude/skills/image-to-code-skill/SKILL.md` | Optional art-direction spike |

Avoid as primary direction: `gpt-taste`, `high-end-visual-design` / `soft-skill`, `minimalist-skill`, `brutalist-skill`.

## Prompt

```markdown
# nucky.gg — Holistic Design / UI / UX / Motion Overhaul (Fable 5)

You are Cursor Fable 5. This is a **creative product-design mission**, not a bugfix list and not an incremental chart add-on.

## Mission

Redesign and elevate **the entirety of nucky.gg** into a high-quality, modern, impressive LoL esports analytics product — from the public landing page through the chat interface and every dashboard tab, entity page, chart, table, and micro-interaction.

I want the kind of work Fable 5 is known for online: bold, cohesive, memorable, technically excellent. Treat this as permission to rethink presentation, hierarchy, motion, composition, and interaction design across the product.

**Show me what Fable 5 can do. Impress me.**

## Product truth (do not water this down)

nucky.gg is **not** another raw stats mirror (gol.gg / tabesports-style). It is an **analytics product** grounded in a proprietary model trained over thousands of tier-1 games: player power ratings, team Elo / region strength, champion OP scores, form/performance scoring, series analysis, and nucky AI explanations grounded in real match data.

Every visual upgrade should make that analytical identity *feel* sharper — not bury it under generic SaaS chrome.

## Surfaces in scope (all of them)

1. **Marketing landing** — `/` (and related marketing chrome)
2. **App shell** — sidebar, filters, duo/chat/dashboard modes (`/duo`, `/chat`, `/dashboard`)
3. **nucky chat** — empty state, message UI, prompts, paywall, inline charts in chat
4. **Dashboard tabs** — Overview, Players, Teams, Champions, Matchups, Tournaments
5. **Entity / identity pages** — player, team, champion, series, tournament
6. **Charts, tables, rankings, radars, trend explorers, model cards, standouts, recaps**
7. **Shared motion, typography, spacing, hover/focus, loading/empty states**

If a surface exists in the app, it is in scope.

## Creative freedom (read carefully)

You have a **high degree of creative freedom**. You may:

- Redesign layouts, section order, visual hierarchy, and information architecture of *presentation*
- Replace, merge, or reinvent charts/graphics/visuals when a better analytical expression exists
- Upgrade motion system-wide (entrances, chart draws, tab transitions, hover presence, chat micro-motion)
- Evolve the visual language (composition, texture, depth, type scale, accent use) as long as the product still reads as nucky
- Change component structure and CSS architecture when needed to achieve the design
- Be experimental and opinionated — avoid “safe AI dashboard” aesthetics

**Minimal hard constraints (only these):**

1. **Keep the product working** — routing, data loading, auth, filters, model score logic, and entity links must still function. Do not break ingest pipelines or invent fake stats.
2. **Preserve analytical meaning** — scores/rankings/model cards must remain honest to existing data (`player_ratings.json`, `region_strength.json`, OE slices, computeGameScore / OP scores, etc.). You can change *how* they look and where they live, not fabricate numbers.
3. **Brand DNA, not brand prison** — matte black atmosphere + turquoise as the signature accent + distinctive typography (currently Noto Sans Mono) are the identity spine. You may intensify, refine, or reinterpret them dramatically. Do **not** converge on generic purple-glass SaaS, warm cream editorial, or broadsheet newspaper clichés.
4. **Respect `prefers-reduced-motion`** — cinematic motion is encouraged; reduced-motion users get instant final states.
5. **Ship for desktop and mobile** — dashboard can stay density-forward on desktop; mobile must remain usable.
6. **Commit and push when a coherent overhaul pass is done** (atomic commits OK if staged by surface).

Everything else is negotiable: card usage, section density, nav treatment, chart library styling, landing hero structure, chat chrome, animation intensity, typography scale, and layout grids.

## Explicit overrides (so skills don’t shrink your ambition)

- Do **not** apply marketing-page laws (AIDA, giant `py-32/48`, gapless bento-only, “no stats in first viewport”) to the **dashboard or chat**. Those surfaces are product register: density and analytical clarity are features.
- Do **not** force Apple/Linear pill-island nav, ethereal purple orbs, or soft “expensive SaaS” templates.
- Do **not** flatten nucky into a light minimalist theme.
- `nucky-dashboard-motion` helpers are the preferred *implementation* layer — you may expand motion ambition beyond the short product timings where it creates presence, as long as motion still conveys hierarchy/state (not endless decorative loops).
- Prior landing/docs mentioning gold accents are outdated; **turquoise on matte black** is current (`src/theme/tokens.css`).
- There is no root `PRODUCT.md` / `DESIGN.md`. Treat the files below as context, then **supersede presentation freely**.

## Read first (in this order), then redesign

1. `.agents/skills/redesign-existing-projects/SKILL.md`
2. `C:/Users/Ryan/.claude/skills/impeccable/SKILL.md`
3. `C:/Users/Ryan/.claude/skills/impeccable/reference/product.md`
4. `.agents/skills/ui-ux-pro-max/SKILL.md` (use as option space for charts/layout/motion — not a locked skin)
5. `.agents/skills/nucky-dashboard-motion/SKILL.md`
6. `.agents/skills/design-taste-frontend/SKILL.md` + `C:/Users/Ryan/.claude/skills/impeccable/reference/brand.md` (**landing/brand surfaces only**)
7. `docs/superpowers/specs/2026-07-17-nucky-landing-design.md` (current landing intent — elevate freely)
8. `docs/nucky_v2.md` (IA / shell modes / product intent — presentation is not sacred)
9. `src/theme/tokens.css`, `src/theme/animations.ts`, `src/theme/chartTheme.ts`, `src/theme/shell.css`, `src/theme/landing.css`
10. Key shells/pages: `src/components/shell/*`, `src/pages/Landing.tsx`, `src/pages/Overview.tsx`, `src/pages/Players.tsx`, `src/pages/Teams.tsx`, `src/pages/Champions.tsx`, `src/pages/Matchups.tsx`, `src/pages/Tournaments.tsx`, `src/pages/entities/*`, `src/components/nuckyai/*`

Optional if you want an art-direction spike before coding landing: `C:/Users/Ryan/.claude/skills/image-to-code-skill/SKILL.md`.

## Design brief

**Scene:** A serious LoL esports analyst at 11pm, dual monitors, living inside matchups and form — the UI should feel like a precision instrument with taste, not a crypto dashboard or a sportsbook.

**Positioning:** Model-grounded analytics. Proprietary ratings and explanations are first-class UI, not footnotes under box scores.

**Emotional target:** Confidence, clarity, controlled intensity, modern craft. When someone opens nucky after using tabesports/gol.gg, they should feel they’ve stepped into a sharper product — not a clone with a teal accent.

**Quality bar:**
- One coherent visual system across landing → shell → chat → every tab/entity page
- Intentional motion (2–3 strong moments per major surface; no animation spam)
- Charts that feel designed, not default-Recharts-on-dark
- Hierarchy so strong that a new user knows where to look in under a second
- Anti-slop: if it looks like “AI made a dashboard,” rewrite it

## Working process (required)

1. **Shape first (short):** Before large edits, write a brief design direction (1 screen): visual thesis, motion thesis, what will change on landing / shell+chat / dashboard identity pages. Do not ask me a long questionnaire — make strong choices and proceed.
2. **Execute holistically:** Implement across the product. Prefer system-level token/motion/shell upgrades that cascade, plus deep passes on the highest-visibility surfaces (landing, overview, player/team/series identity, chat).
3. **Verify visually:** Run the app, screenshot key surfaces (landing, overview, player page, series page, chat empty + thread), and fix anything that still feels generic or broken.
4. **Commit and push** when the overhaul is in a coherent, shippable state. Use clear commit messages focused on the design intent.

## Out of scope

- GRID / commercial data partnerships
- Rewriting the ML training pipeline
- SEO/content marketing copy decks
- Pixel-cloning tabesports or gol.gg

## Success criteria

nucky.gg should feel like a **premium analytical product** with a distinctive identity — cohesive from first landing scroll through deep entity analysis and chat. Someone should be able to tell it’s nucky with the logo removed. The upgrade should be obviously large-scale, not a handful of new cards on old layouts.

Begin by reading the skills and theme files above, stating your design thesis, then implementing the overhaul.
```

## How to run

- New chat, model = Fable 5, paste the prompt alone (optional: 1–2 current screenshots; no TODO dump).
- Continue mid-build with: “Continue the overhaul — next: chat + entity pages. Same creative brief.”
- Keep a faster model for follow-up bugfixes; keep Fable for creative passes.
