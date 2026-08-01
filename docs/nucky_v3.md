# nucky.gg v3 — Product Repositioning Scope

> Status: **In progress** (2026-08-01) — V3-0…V3-2 implemented in product UI; V3-3+ not started.  
> Supersedes the *product thesis* of `docs/nucky_v2.md` for dashboard IA and monetization.  
> Keeps v2 engineering assets (rating system, scorecard, shell, chat pipeline) as the substrate.  
> Cito current-week probe: §9.4 / `.tmp/cito-current-audit.json` (2026-08-01).

---

## 1. One-sentence promise

**nucky tells LoL esports fans what matters now and who’s favored next — with model-backed analysis, not a raw-stats archive.**

Fans (including fantasy/betting-curious viewers) and creators who today open a stats site and *do the analysis themselves* should open nucky and get that analysis already formed, visualized, and easy to digest.

Do **not** mention competitor products in marketing or in-product copy. Compete by category, not by name.

---

## 2. Why v3 (diagnosis)

v2 shipped a capable triple stack:

1. Filterable analytics dashboard (archive-shaped: year / split / deep tables)
2. Proprietary prediction / rating model
3. Grounded analyst chat

The model is the only non-substitutable asset. The dashboard still *presents* as a general stats encyclopedia, so users evaluate nucky on archive-completeness terms — a fight we should not pick.

**v3 rule:** stop optimizing for “can I look up any past split?” Start optimizing for “what’s the current picture, and what happens next?”

| Layer | Role in v3 |
| --- | --- |
| Model + ratings | Product center — form, rankings, odds, explainability |
| Dashboard | Evidence + visualization of **current** form/trends; not an archive browser |
| Chat | Interactive analyst over the same packets (depth, custom Q, draft paste) |
| Community | Post-series (and player) discourse + ratings — free, logged-in |

History remains in the **training / Elo / artifact pipeline**. It is not a first-class product surface.

---

## 3. Locked decisions (from 2026-08-01 product discussion)

| # | Decision |
| --- | --- |
| Audience | Broad LoL esports fans interested in current trends/stats — info, fantasy, betting-curious. Creators/analysts are a high-value segment who want analysis already done. |
| Competitors | Never named in product or marketing. |
| Year / split filters | **Removed everywhere** (tabs + entity pages). |
| Matchups tab | **Removed**; matchup content lives under predictions / Board analysis. |
| Gol-parity deep tables | **Stop investing**; keep minimal evidence tables only. |
| Form window | **Last 8 completed series**; **no calendar-day cap** (see §5). Domestic and international series both count. |
| Idle / miss events | Form **freezes** at last 8-series value; UI shows idle gap — do **not** zero or expire form after N days (see §5.2). |
| Default home | **New users → Overview (Hub)**. Overview sub-tabs: Hub (default) + Board; Hub-vs-Board preference changeable in settings. |
| Form surfaces | Keep **three tabs**: Players, Teams, Champions (current-form only). |
| Entity pages | **Current + upcoming** only (no past year/split archaeology). |
| Tournaments | **Keep** — within-event context and series history stay useful. |
| Overview hub | **Keep** weekly/monthly catch-up with narrative context. |
| Monetization (surface) | **Current** free; **future** predictions paid (see §7). |
| Chat entitlements | **Logged-in only.** Free: **25 messages/month**, current-only tools. Paid: significantly higher message/credit limit + future packet access (see §7.3). |
| Live model | **Post-draft only** (no mid-game live win%). |
| Community | Free for **logged-in** users; series + per-game threads; player hubs; **1–10 ratings** with site-displayed average + tags (see §8). |
| Naming | Board / Predictions labels can change later — not a blocker. |
| Freshness | Ingest and reflect new match data ASAP from the best reliable SoR (Cito candidate — §9.4). |
| Chat product scope | Keep; quality must improve so it isn’t a dashboard regurgitation bot. |

---

## 4. Information architecture

### 4.1 Target nav (dashboard mode)

```text
Overview          Hub (default) | Board
Players           current form / model rankings
Teams             current form / model rankings
Champions         current form / model meta
Tournaments       active / recent events
Predictions       future board + analysis (paid depth)  ← rename/position as needed
Chat              /chat + duo left pane
Community         series + player hubs (logged-in)
```

**Removed from nav:** Matchups.  
**Removed from chrome:** Year filter, Split filter.  
**Retained:** League scope (All Tier-1 / LCK / LPL / LEC / LCS) as a *watching lens*, not an archive control.

### 4.2 Overview composition

| Sub-tab | Job | Access |
| --- | --- | --- |
| **Hub** | Weekly / monthly catch-up: recaps, standouts, “who mattered” | Free |
| **Board** | Upcoming schedule as a foresight surface: matchups, timing, tournament context; **future odds / packets gated** | Schedule + context free; win% / edge / full packet paid |

Default sub-tab: **Hub**. Profile setting may default Overview to Board instead.

### 4.3 Players / Teams / Champions

Each tab is a **current-form instrument**, not a season browser:

- Model-ranked boards (power / Elo / OP-style meta scores as appropriate)
- Form signals over the form window (§5)
- Compact evidence (last-N series sparks, key deltas) — not career encyclopedias
- Deep “why” may deep-link into chat or paid prediction analysis where relevant

### 4.4 Entity pages (player / team / champion)

Single composition mindset: **Now + Next**.

| Block | Content |
| --- | --- |
| Hero | Identity + model readout (rating, rank, Δ over form window) |
| Current | Form spark, style / win-condition notes, recent series results |
| Evidence | Short role-relevant stat strip from the form window only |
| Upcoming | Next scheduled series card (odds/packet gated if “future”) |
| Out of scope | Year/split selectors; full historical match tables as primary UX |

Series / tournament entity pages remain event-native (series is inherently a unit of “what just happened / is happening”).

### 4.5 Predictions surface

Absorbs former Matchups jobs:

- Upcoming series board
- Team / player / champion model rankings (may also appear mirrored on Form tabs)
- Prematch analysis packet
- **Post-draft** analysis packet when draft is known (Cito / schedule-linked)
- Track record / scorecard adjacent to picks
- No separate “pick two teams and compare radars” tab — that flow becomes “open a matchup on the Board” or chat

### 4.6 Modes (shell)

Keep AppShell modes: `/dashboard`, `/duo`, `/chat`.  
**New-user default home = Overview (Hub).** Existing users who already chose duo/chat keep their preference unless we run an explicit migration later.

---

## 5. Defining “current form”

### 5.1 Locked window

**Primary unit: last 8 completed series** (Bo1/Bo3/Bo5 = one series), not last N games.

| Parameter | Locked value | Rationale |
| --- | --- | --- |
| N | **8 series** | Enough signal, still “now” |
| Floor | ≥ **4 series** before “stable”; thinner samples → low-confidence badge | Avoid overconfident 1–2 series spikes |
| Calendar-day cap | **None** | Teams/players who miss playoffs/internationals can sit idle for weeks; dropping them from the window would punish non-qualification |
| Domestic vs intl | Equal eligibility in the 8 | Recent series matter regardless of stage |
| Weighting | Recency weights *within* the 8 (e.g. exponential by series index) | Prefer newer series without inventing a day cutoff |

Display copy examples: `form · last 8 series`, `thin sample · 3 series`, `idle · 37d since last series`.

### 5.2 Idle gaps (missed internationals / long waits) — locked behavior

**Question:** player is playing excellently, fails to qualify for an international, then doesn’t play for 45+ days. What happens to performance / current form?

| Signal | Behavior while idle |
| --- | --- |
| **Current form (product)** | **Freezes** at the last completed 8-series window. Do **not** decay to zero, do **not** eject old series solely because calendar time passed. |
| **UI** | Show an **idle / gap** badge: days (or series slots) since last match. Make “stale schedule” obvious without erasing the excellent run. |
| **Team / player Elo / power artifacts** | Continue existing rating rules (e.g. rating deviation / inactivity widening already in the stack). That is **strength uncertainty**, separate from the form spark. |
| **Prematch blend when they return** | May down-weight frozen form slightly vs “fresh” opponents *as a blend input* (engineering detail), but the **displayed form number** remains the frozen last-8 until new series append. |
| **After they play again** | New series enter the window FIFO (drop oldest of the 8); idle badge clears. |

So: missing Worlds/MSI does **not** delete a strong domestic form reading. It marks the reading as **not recently stress-tested**.

### 5.3 Roster / role changes

**Soft reset unless identity changes.**

| Event | Behavior |
| --- | --- |
| Same team, same role | Continue window |
| Team change | **Hard reset** form window |
| Role change (e.g. mid → support) | **Hard reset** |
| Sub ↔ starter same team/role | Soft keep; tag bench-inclusive sample |

Team form: if ≥3/5 starters changed since window start → “roster shift” and down-weight pre-change series.

### 5.4 What form feeds

- Players / Teams / Champions tab rankings and sparks  
- Entity “Now” blocks  
- Prematch blend inputs (with idle handling above)  
- Hub standouts (“hottest”, “form climbers”)

Implement once in shared helpers — not per-chart snowflakes.

### 5.5 Revisit later (non-blocking)

- N = 6 vs 10 via creator feedback  
- Patch breakpoints if mid-window patches prove noisy  
- Optional dual readout: peak (last 3) vs stable (last 8)

---

## 6. Model product roadmap (priority)

Ordered for dependency and differentiation:

| Priority | Work | Why |
| --- | --- | --- |
| **P0** | **Current-data path** — Hub/Board series completeness from **Cito results** (academy-filtered); OE remains deep stats + training. Probe 2026-08-01: Cito already has Jul 29–31 mains while OE tops out Jul 28 / missing Summer LCK+LPL slices (§9.4) | Foresight product dies if the week is blank |
| **P1** | **Dashboard remodel to v3 IA** — kill year/split + Matchups; Hub+Board Overview; Form tabs; entity Now+Next | Stops selling the wrong product |
| **P2** | **Board + free/paid future split** — schedule free; win% / packets gated; track record visible | Monetization without hiding the whole model |
| **P3** | **Post-draft predictions** — when draft is available via Cito/schedule, run draft-aware packet; show on Board + chat | Real wedge vs pre-series-only boards |
| **P4** | **Community v1** — §8 | Differentiation + retention; free logged-in |
| **P5** | **Chat quality** — grounded on form + packets; custom analysis; not a mirror of free tiles | Makes sub valuable beyond “see the %” |

### 6.1 Post-draft (in scope)

- Trigger: series/game is live or draft complete; draft champions + sides known  
- Output: draft-aware win probability, role matchup notes, priority-champ / comp-style edges (existing draft model path)  
- **Out of scope for v3:** mid-game live win% from unreliable frame feeds  

### 6.2 Kalshi / markets (recommendation)

- **Never** a model input (unchanged from v2 Component 5 policy).  
- **Paid future cards** may show market-implied % as a *comparison readout* (“market” vs “nucky”) when a liquid H2H exists.  
- Free Board: schedule + teams + tournament only — no market line required.  
- Closing-line archive / CLV remains a later analytics nicety, not a v3 blocker.

### 6.3 Track record

Keep the public / near-public scorecard as trust infrastructure next to the Board. Free users should see that nucky has a record; paid users see the forward odds that record is meant to support.

---

## 7. Monetization

### 7.1 Principle (locked)

| Class | Free | Subscription |
| --- | --- | --- |
| **Current** | Hub, Form tabs, entity Now, tournaments, model rankings for *current* power/form, track-record summary | — |
| **Future** | Upcoming schedule listing on Board (who plays whom, when, format) | Win probabilities, confidence, full prematch/post-draft packets, edge/explain cards, market comparison |
| **Chat** | Limited free tier TBD (see §7.3) | Full analyst: custom asks, draft paste, deep compare, packet narration |
| **Community** | Full (logged-in) | — |

This resolves the earlier tension (“if the model is free, why pay for chat?”):

- The **model’s current read of the meta** is free (acquisition + habit).  
- The **model’s claim about the next series** is paid (clear value).  
- **Chat** is paid for *interaction and synthesis*, not for reading a tile that already exists.

### 7.2 What must never feel paywalled

- “Is Chovy in form?” / power boards / Hub recaps  
- That a series exists on the schedule  
- That nucky has a published track record  

### 7.3 Chat entitlements (locked)

| | Guest | Free (logged-in) | Paid |
| --- | --- | --- | --- |
| Access | No chat (auth gate) | Yes | Yes |
| Quota | — | **25 messages / calendar month** | Significantly higher message/credit limit (exact paid quota TBD at billing design) |
| Tools | — | **Current-only** (form, rankings, Hub facts, historical OE/RAG as needed for “now” questions) | Current + **future** (prematch/post-draft packets, upcoming odds narration) |

Logged-out users hit auth before chat. Free users who hit the cap see upgrade CTA. Free users asking future-odds questions get a clear upsell, not a hallucinated %.

### 7.4 Explicit non-goal

Do not gate the entire Predictions nav item behind a hard wall that shows nothing. Show the Board shell + schedule; gate the **forecast**.

---

## 8. Community hub (expanded from v2 Phase 4)

Reference UX patterns (internal only — do not market as clones): dense post-match rating cultures (e.g. Hupu-style player grades) and structured sports discussion apps (e.g. The Real App–style rooms).

### 8.1 Surfaces

| Surface | Behavior |
| --- | --- |
| Series thread | Parent discussion after/during a series |
| Game threads | Child threads per game in the series |
| Player hub | Each player has a discussion thread |
| Ratings / tags | Post-series **1–10** ratings; site displays **average** (and n); optional tags |

### 8.2 Rules

- **Free**, **logged-in only**  
- Auth, rate limits, word filters, report + moderation queue (real product surface)  
- Ratings: **one rating per user per player per series**; store raw 1–10; display mean  
- Tag taxonomy v1 = short fixed list at implement time  
- v1 may ship series+game threads before player hubs if needed — player hubs remain in scope

### 8.3 Relationship to model

Community is **not** a substitute for the Board. Optional enrichment: show model prematch % (if entitled) as a frozen stub on the series thread header after lock-in — never editable by users.

---

## 9. Data strategy

### 9.1 Roles

| Source | v3 role |
| --- | --- |
| **OE (Oracle’s Elixir)** | Long-horizon training, backfill, historical features; **not** the freshness SLA for “current” product |
| **CitoAPI** | Candidate system-of-record for **recent/current** schedules, results, drafts; post-draft triggers |
| **RAG + Tavily** | Chat grounding for careers / news / non-OE facts (unchanged philosophy) |
| **Artifacts** | `region_strength`, `player_ratings`, scorecard, etc. — published freshness must track current matches |

### 9.2 Freshness SLA (target)

- **Ideal:** new completed series visible in Hub/Form/Board as soon as Cito (or chosen SoR) confirms completion.  
- **Acceptable v3 launch:** &lt;12h for tier-1 completed series under normal conditions; visible “data as of” stamp when lagging.  
- Model artifacts: retrain/publish path must not silently stall while current results advance (carry forward v2 Phase 6 freshness work).

### 9.3 Cito reliability gate

Before declaring Cito SoR for current:

1. Coverage audit: tier-1 leagues + internationals, draft availability timing  
2. Identity linkage vs OE/canonical names  
3. Strip academy/challengers pollution under parent league IDs (known LCK issue)  
4. Failure mode: if Cito gaps, fall back to OE without presenting stale data as fresh  

### 9.4 Current-week probe (2026-08-01) — PASS for scores, FAIL for product freshness path

**Symptom (prod Hub screenshot):** “Past 7 days: Jul 25–31” + “Refreshed Jul 31” but **data through Jul 28**; recap list stops at Jul 26 LCS/LEC. Refresh ≠ new match rows.

**Local OE CDN shards (`public/data/oe_slices_2026_*.json`):**

| Check | Result |
| --- | --- |
| File mtime | ~2026-07-29 |
| Global max `gameLog.date` | **2026-07-28** (`2026 Summer\|INT`) |
| `2026 Summer\|LEC` / `LCS` max | **2026-07-26** |
| `2026 Summer\|LCK` | **Missing slice** |
| `2026 Summer\|LPL` | **Missing slice** |

**Live Cito `/lol/leagues/{lol-lck,lpl,lec,lcs}/results` since 2026-07-25** (`scripts/cito/probe-current-week.ts` → `.tmp/cito-current-audit.json`):

| Day | League | Public crosscheck | Cito main result |
| --- | --- | --- | --- |
| Jul 29 | LCK | KT beat T1 2-0; NS series | **T1 0-2 kt Rolster**; NS 0-2 vs DRX also present |
| Jul 29 | LPL | BLG beat LGD 2-1 | **BILIBILI GAMING 2-1 LGD GAMING**; TES 0-2 AL |
| Jul 30 | LCK | DK beat HLE 2-1; FearX/DNS | **HLE 1-2 Dplus KIA**; **DNS 2-0 FearX** |
| Jul 31 | LCK | T1 beat GEN 2-0; DRX vs BRO | **Gen.G 0-2 T1**; DRX/BRO rows present (see caveat) |
| Jul 31 | LEC | Week 2 | **VIT 2-0 TH**; **MKOI 2-1 Shifters** |
| Jul 25–26 | LCS | Week 1 only; Week 2 starts Aug 1 | Cito matches TL/C9, SR/DSG, etc.; **no LCS Jul 29–31 expected** |

**Also:** `public/data/cito_schedule_cache.json` mtime **~2026-07-10** — static cache is stale; live API is fine. Prod Hub is OE-backed → inherits OE lag even when Cito already has scores.

**Caveats before SoR:**

1. **Academy leak:** `lol-lck` results include Challengers/Academy (e.g. Gen.G Global Academy, DK Challengers) — must filter (same class of bug as Predictions academy leak).  
2. **Possible duplicate / odd DRX–BRO rows** on Jul 31 (2-0 and 1-2) — validate against games endpoint before trusting series score alone.  
3. Cito gives **schedule/scores** quickly; full box-score form/radar still needs OE or Cito postgame enrichment — SoR for *results/Board/Hub series list* can lead; SoR for *full player logs* is a second gate.

**Conclusion:** Cito is **viable and currently ahead of OE** for tier-1 completed series scores this week. P0 is wire Hub/Board/recap completeness to Cito results (filtered), not wait on OE CSV. Keep OE for deep stats + training until postgame coverage is audited.

Probe command (repeatable): `npx tsx scripts/cito/probe-current-week.ts`

---

## 10. Phased delivery (v3)

Phases are product slices, not calendar promises.

| Phase | Name | Exit criteria |
| --- | --- | --- |
| **V3-0** | Positioning lock | ✅ This doc accepted; form/chat/community/defaults locked; Cito week probe done (§9.4) |
| **V3-1** | Current-data path | ✅ Hub series completeness uses Cito results (academy-filtered); OE lag no longer blanking the week; freshness stamps honest |
| **V3-2** | IA remodel | ✅ Year/split gone; Matchups gone; Hub+Board Overview; Form tabs + entity Now+Next; league filter only |
| **V3-3** | Future gate | Board schedule free; win%/packets paid; track record adjacent; paywall copy clear |
| **V3-4** | Post-draft | Draft-complete games get draft-aware packet on Board + chat |
| **V3-5** | Community v1 | Series + game threads, ratings/tags; player hubs; moderation basics; logged-in free |
| **V3-6** | Chat as analyst | Current vs future tool gating; packet narration; less regurgitation; richer cards |

v2 Phases 5–6 (agent quality, perf) **merge into** V3-6 and ongoing eng hygiene — not abandoned.

---

## 11. Sunset / stop-invest list

| Stop or remove | Notes |
| --- | --- |
| Year filter | Product UI |
| Split filter | Product UI |
| Matchups tab / routes | Redirect to Board / Predictions analysis |
| Gol-parity wide historical tables | Replace with form-window evidence |
| Mid-game live win% | Explicit non-goal until feed quality changes |
| Archive-first marketing language | Landing + app copy → now/next |
| Gating *all* model surfaces | Only **future** forecasts gate |

Pipeline code that *computes* from multi-year history stays.

---

## 12. Relationship to `nucky_v2.md`

| v2 | v3 |
| --- | --- |
| Model quality, shell, prediction tab, scorecard | **Keep** as substrate |
| Dashboard as filterable analytics product | **Replace** with current-form foresight IA |
| Predictions largely subscription-gated as a whole tab | **Refine** → current free / future paid |
| Community = series threads + ratings | **Expand** → + game threads + player hubs |
| Live hub deferred | Still deferred; post-draft ≠ full live hub |
| Phase 4–6 sequencing ambiguous | **Replaced** by V3-0…V3-6 above |

When v3 IA ships, update `nucky_v2.md` header to point here for product direction; keep v2 as build log / model history.

---

## 13. Success metrics (product)

| Signal | Direction |
| --- | --- |
| Activation | Free user hits Hub or Form within first session |
| Habit | Return visits on patch days / series days |
| Conversion | Free → paid when clicking a future series odds/packet |
| Retention (paid) | Board + post-draft opens per week |
| Community | Ratings per series; thread posts per series (logged-in) |
| Trust | Track-record visibility; freshness lag &lt; SLA |
| Chat | Paid prompts that are not answerable by a single free tile |

Vanity to ignore: “number of historical splits supported.”

---

## 14. Open items (remaining)

Most product locks are closed. Left for implement-time / billing design:

1. **Paid chat quota** — exact messages/credits per month (free is 25/mo).  
2. **Community tag taxonomy v1** — short fixed list.  
3. **DRX–BRO Cito row validation** — confirm true score via `/matches/{id}/games` before SoR.  
4. **Cito postgame coverage** — whether player box stats for Form can leave OE for recent window.  
5. **Duo preference** — new users default Overview; existing `default_view=duo` users keep preference unless migrated.

---

## 15. Non-goals (v3)

- Rebuilding a full historical stats encyclopedia  
- Naming or comparing to other stats sites in copy  
- Mid-game live win probability  
- Community without auth  
- Calendar-day expiry of form after idle gaps  
- Shipping community before a coherent Now/Next dashboard (sequence: V3-2 before V3-5 preferred; V3-1 parallel)  
- Treating more raw columns as a substitute for form + forecast clarity  

---

## 16. Next action

1. ~~Lock form / chat / ratings / default / Cito probe~~ **done 2026-08-01**  
2. ~~**V3-1** current-data path~~ **done 2026-08-01** — Hub recap invents Cito-complete series when OE lags; academy filter on `fetchCitoSeriesResults`; freshness uses max(OE, Cito)  
3. ~~**V3-2** IA remodel~~ **done 2026-08-01** — league-only chrome; Matchups → Overview; Hub|Board Overview; form helpers + entity Now+Next  
4. Next: **V3-3** future gate — Board schedule free (shipped); gate win%/packets on Predictions; track record adjacent; paywall copy clear
