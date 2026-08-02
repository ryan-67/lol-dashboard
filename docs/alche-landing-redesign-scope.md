# nucky.gg Landing Redesign — Alche-Referenced Scope

> Status: **Ready for Fable 5 implementation** (2026-08-01)  
> Reference capture: `src/components/assets/ui/alchestudio.mp4` + [alche.studio](https://alche.studio/)  
> Product promise: understand, analyze, and predict tier-1 LoL esports.

---

## 1. Goal

Rebuild the nucky.gg marketing landing to the **quality bar** of alche.studio:

- Dense, impressive animation choreography
- Silky Lenis/GSAP scroll storytelling
- Rich hover + persistent ambient motion
- Immersive, interactive, premium product narrative

### Anti-clone rule (critical)

Alche is a **strong craft reference**, not a template to copy.

- **Observe:** animation density, scroll physics, hover polish, depth, timing, atmosphere  
- **Do not copy:** layout, IA, composition, HUD chrome, type treatment, or brand marks 1:1  
- **Invent** a nucky-native structure that *feels* equally premium

---

## 2. Brand lock (confirmed)

| Token | Decision |
| --- | --- |
| Base | **Matte black** |
| Accent | **Turquoise** (`src/theme/tokens.css` — ≈ `#57c4cf` / `oklch(0.8 0.115 195)`) |
| Accent play | Allow **rotating / shifting accent accents** like Alche’s color switches — secondary hues may cycle for atmosphere, but turquoise remains the identity signal |
| Type | Prefer IBM Plex Sans + Noto Sans Mono (existing); expressive upgrades OK if still “instrument,” not Inter/SaaS defaults |
| Wordmark | **nucky** lowercase hero-level brand |

Avoid: purple-glass AI sludge, cream+terracotta, generic glow soup, emoji decoration.

---

## 3. Target IA (scroll narrative)

| # | Section | Job |
| --- | --- | --- |
| 0 | **Loader** | Construction / signal lock; copy: *understand, analyze, and predict lolesports* |
| 1 | **Hero** | Immersive 3D **N** + background **nucky**; pointer/ambient motion; one CTA group |
| 2 | **Features gallery** (horizontal scroll) | Dashboard · Prediction model · AI analyst chat — real product media |
| 3 | **nucky knows** | Keep existing idea; deepen with `animmaster_3d_12` + `animmaster_3d_20` 3D/interactive language |
| 4 | **Proof gallery** (horizontal scroll) | Coverage · model explanation · prediction receipts |
| 5 | **Pricing** | Keep substance (current free / future paid); restyle chrome + motion |
| 6 | **FAQ** | Keep substance; restyle + motion |
| 7 | **Closing hero / CTA** | Final brand plane → enter product |

Map from today’s `src/pages/Landing.tsx` sections as needed; structure may change as long as jobs above survive.

---

## 4. Product media (ready)

| Asset | Path | Use |
| --- | --- | --- |
| Predictions / model UI | `src/components/assets/prediction_model.png` | Features / proof gallery |
| Player of the month (Hub) | `src/components/assets/pom.png` | Dashboard / Hub feature |
| Matchup comparison | `src/components/assets/matchup.png` | Dashboard / analysis feature |
| AI chat (Faker) | `src/components/assets/faker_vid.mp4` | Analyst chat feature (video) |
| Alche reference reel | `src/components/assets/ui/alchestudio.mp4` | Motion reference only — never ship as product media |
| 3D refs | `src/components/assets/ui/animmaster_3d_12/`, `.../animmaster_3d_20/` | Knows / depth patterns (port, don’t paste Next demos) |

Capture timestamps / beat notes from the Alche reel live in this doc’s companion notes (owner-annotated). Prioritize matching **animation density + scroll feel**, not specific layouts.

---

## 5. Craft pillars

1. **Brand-first hero** — nucky + 3D N + one line + CTA; no stat strips in first viewport.  
2. **Live 3D where it counts** — R3F/Three for hero (and gallery depth if performant); AI stills only for art direction / fallbacks.  
3. **Scroll is the director** — Lenis + GSAP ScrollTrigger; horizontal galleries pin and scrub.  
4. **Always-on ambient** — idle drift, grid/atmosphere, accent color shifts; hover intensifies.  
5. **Product truth** — galleries use the real assets above (plus generated loops derived from them).  
6. **Performance** — desktop cinematic; mobile reduced; honor `prefers-reduced-motion`.  
7. **Original composition** — if a layout could be mistaken for Alche after swapping logos, redesign it.

---

## 6. Skills, craft references & tooling

Fable 5 should **read skills before coding**, then ship real landing code. Use craft sites as **quality bar**, not layout templates.

### 6.1 External craft references (study feel, don’t clone)

| Reference | Why |
| --- | --- |
| [alche.studio](https://alche.studio/) + `src/components/assets/ui/alchestudio.mp4` | Primary bar: animation density, scroll physics, hover polish, ambient life |
| [animejs.com](https://animejs.com/) | Kinetic type, hero composition, playful-but-precise motion |
| [lenis.dev](https://www.lenis.dev/) | Silky smooth scroll as product feeling |
| [remix.run](https://remix.run/) | Premium product marketing: clarity, typography, scroll storytelling (do **not** migrate stack to Remix) |
| [animations.dev](https://animations.dev/) / Emil Kowalski | Invisible polish, timing, micro-interactions that compound |
| Three.js / R3F demos + local `animmaster_3d_*` | Immersive 3D hero / depth (port patterns; don’t paste demos) |

### 6.2 Must-read skills (before writing landing code)

**Taste / design engineering**

| Skill | Path |
| --- | --- |
| Impeccable | `C:/Users/Ryan/.claude/skills/impeccable/SKILL.md` (and related craft/audit flows) |
| Taste | `C:/Users/Ryan/.claude/skills/taste-skill/SKILL.md` (+ `taste-skill-v1` if needed) |
| GPT taste / design taste | `.agents/skills/gpt-taste/SKILL.md`, `.agents/skills/design-taste-frontend/SKILL.md` |
| Emil Kowalski design eng | `.agents/skills/emil-design-eng/SKILL.md` |
| High-end visual design | `.agents/skills/high-end-visual-design/SKILL.md` |
| Apple design (restraint/hierarchy) | `.agents/skills/apple-design/SKILL.md` |
| UI/UX pro max | `.agents/skills/ui-ux-pro-max/SKILL.md` |
| Redesign existing projects | `.agents/skills/redesign-existing-projects/SKILL.md` |

**Scroll / GSAP / Lenis motion system**

| Skill | Path |
| --- | --- |
| Cinematic scroll storytelling | `.agents/skills/cinematic-scroll-storytelling/SKILL.md` (+ `REFERENCES.md`) |
| Cinematic GSAP + Lenis system | `.agents/skills/cinematic-gsap-lenis-motion-system/SKILL.md` (+ `REFERENCES.md`) |
| GSAP ScrollTrigger storytelling | `.agents/skills/gsap-scrolltrigger-storytelling/SKILL.md` |
| GSAP core / timeline / plugins / React / perf / utils | `.agents/skills/gsap-*.md` (esp. `gsap-react`, `gsap-performance`, `gsap-scrolltrigger`) |
| Animation vocabulary | `.agents/skills/animation-vocabulary/SKILL.md` |
| Find / improve / review animations | `.agents/skills/find-animation-opportunities`, `improve-animations`, `review-animations` |
| Nucky dashboard motion | `.agents/skills/nucky-dashboard-motion/SKILL.md` (reuse motion language where it fits marketing) |
| Nucky animation toolkit | `.cursor/skills/nucky-animation-toolkit/SKILL.md` |
| Scroll World | `.agents/skills/scroll-world/SKILL.md` |

**3D / WebGL**

| Skill | Path |
| --- | --- |
| Three.js fundamentals → postprocessing | `.agents/skills/threejs-fundamentals` … `threejs-postprocessing`, `threejs-materials`, `threejs-shaders`, `threejs-interaction`, `threejs-animation`, `threejs-lighting`, `threejs-geometry`, `threejs-textures`, `threejs-loaders` |

**Micro-motion / UI libraries / MCP**

| Skill / MCP | Path / note |
| --- | --- |
| Anime.js ref | `.cursor/skills/animejs-ref/SKILL.md` + MCP `anime-js` (`.cursor/mcp.json`) |
| Motion (Framer) ref | `.cursor/skills/motion-ref/SKILL.md` — optional for UI micro-motion if it doesn’t fight GSAP |
| React Bits | `.cursor/skills/reactbits-ref/SKILL.md` + MCP `reactbits` — patterns only; restyle to nucky |
| shadcn MCP | MCP `shadcn` — primitives if needed; don’t let default shadcn look dominate the landing |
| Kokonut / OriginKit | `.cursor/skills/kokonutui-ref`, `originkit-ref` — optional interaction ideas |
| Bklit UI | `.agents/skills/bklit-ui/SKILL.md` — composition / theming / tooltips polish |
| Brand / design system | `.cursor/skills/brand/SKILL.md`, `.cursor/skills/design-system/SKILL.md`, `.cursor/skills/ui-styling/SKILL.md` |

**Optional media / QA**

| Tool | Note |
| --- | --- |
| video-shotcraft | `.agents/skills/video-shotcraft` — optional short loops from captures |
| imagegen-frontend-web | Section comps if needed (prefer real product media first) |
| Playwright skill / MCP | Visual QA after spikes |
| Remotion | **Skip for MVP** (no company Remotion ship; no license needed for this pass) |

### 6.3 Runtime libraries (already in app unless noted)

| Library | Status | Role |
| --- | --- | --- |
| `gsap` + `@gsap/react` | Installed | ScrollTrigger, timelines, pin/scrub, reveals |
| `lenis` | Installed | Silky smooth scroll; wire to GSAP ticker per cinematic skill |
| `three` | Installed | Hero / knows 3D |
| `@react-three/fiber` + `@react-three/drei` | Add if needed | React 18–compatible only |
| `anime.js` | Add if needed | Hero/micro kinetic accents via animejs-ref + MCP; don’t dual-drive the same property with GSAP |
| Tailwind + CSS variables | Installed | Layout + brand tokens (`tokens.css`) |

**Stack note:** Stay on **Vite + React 18 + react-router-dom**. Remix.run is a **design/storytelling reference only**.

### 6.4 How to use them (priority)

1. **Impeccable + taste + Emil** → composition, hierarchy, restraint, anti-slop  
2. **Cinematic GSAP/Lenis + ScrollTrigger storytelling** → scroll director, pin/scrub galleries, motion tokens  
3. **Three.js skills + animmaster_3d_*** → hero N + knows depth  
4. **Anime.js / React Bits / Motion** → accents and interaction ideas; restyle heavily to matte black + turquoise  
5. **Alche / animejs.com / lenis.dev / remix.run** → quality bar for immersiveness; never 1:1 layout clones  

Use one coherent motion language (eases, scrub ranges, stagger) from the cinematic GSAP–Lenis skill so the page feels authored, not stacked demos.

---

## 7. Phased delivery (for Fable 5)

1. **Spike** — Loader + Hero (3D N, ambient, hover, accent shift) on a branch  
2. **Features horizontal gallery** — wire `pom` / `prediction_model` / `faker_vid`  
3. **Knows 3D upgrade** — absorb animmaster patterns  
4. **Proof horizontal gallery** — coverage / model / receipts (reuse model + matchup assets)  
5. **Pricing + FAQ + closing CTA** — motion + visual system  
6. **Polish / QA** — reduced motion, mobile, 60fps laptop target  

Multi-pass expected. Do not claim Alche parity in one turn.

---

## 8. Decisions locked

| # | Decision |
| --- | --- |
| 1 | Alche timestamps / moments annotated by owner (see reel) |
| 2 | Product media paths above |
| 3 | Matte black + turquoise; rotating accent switches OK |
| 4 | Copy Alche **craft** (animation + scroll quality), not layout/design |
| 5 | Remotion license: ignore for now; no company Remotion ship planned |
| 6 | Implement with **Cursor Fable 5** |

---

## 9. Success criteria

- Landing feels as motion-rich and scroll-silky as a top-tier studio site, while remaining clearly **nucky**  
- Someone who knows Alche should recognize the *ambition*, not the *layout*  
- Hero interactive on desktop; galleries tell product story with real media  
- Pricing/FAQ/CTA still convert  
- Reduced-motion and mobile remain usable  

---

## 10. Fable 5 kickoff

Use the prompt in `docs/fable-5-alche-landing-prompt.md`.
