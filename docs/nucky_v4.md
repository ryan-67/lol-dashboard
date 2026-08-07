# nucky.gg v4 — Data Reliability & Product Hardening

> Status: **V4 warehouse cutover shipped (2026-08-05)** · **Active P0: dashboard cold-load / tab lag** · **Next P0: nuckyAI quality**  
> **Blocked:** GitHub Actions major outage (2026-08-06) — hosted runners failing/queueing; cannot verify Refresh Dashboard Data until [githubstatus.com](https://www.githubstatus.com) recovers.  
> Supersedes the *data strategy* of `docs/nucky_v3.md` §9 for source-of-record decisions.  
> Keeps v3 product IA (Hub / Board / current-form / future paid) as the UI contract.  
> Related: `docs/data-sources-research.md` (Jul 2026 enrichment notes), `docs/CITOAPI.md`, Aug 3 prod audit.  
> Spike artifacts: `.tmp/riot_gw_spike_report.json`, `.tmp/riot_livestats_quality.json`, `.tmp/riot_oe_column_parity.json`

---

## 1. One-sentence goal

**Make nucky’s current-form surfaces, recaps, model, and chat trustworthy by replacing the broken OE+Cito freshness path with a data stack that actually delivers enriched tier-1 box scores on time.**

UI polish is not the bottleneck. Data reliability is.

---

## 1.5 System map — is the product description complete?

### What you listed (core loop) — correct and complete for the *data → model → dashboard* spine

1. **Historical OE** stays for nuckyAI deep history only (not current form).  
2. **Current SoR** must be timely + enriched for Form / power scores / recaps.  
3. **Refresh Dashboard Data** must: ingest → (filter display to tier-1 + international guests) → retrain → update scores → current-form UI → series grouping → completed-series recaps → schedule for futures → log prediction W/L.  
4. Goal: **replace OE+Cito for the current path**; keep OE for historical chat KB.

That is the right spine. Nothing material is missing from that operational loop.

### Adjacent product surfaces you should still keep in the v4 plan (not “data SoR,” but part of nucky.gg)

| Surface | Why it matters for the same Refresh path |
| --- | --- |
| **Chat current tools** | Must read the *same* warehouse as Hub (today OE-first skips fresh Cito and lies about “this week”) |
| **Prediction holdout log + accuracy scorecard** | You already said “log all predictions W/L” — this is `prediction_holdout_log.json` / `accuracy_scorecard.json` in CI |
| **Post-draft packets** | Paid foresight layer; drafts currently Cito → move to Leaguepedia (+ warehouse) |
| **Kalshi edge** | Comparison-only (live blend removed); still a Predictions UX input |
| **Identity / academy filters** | Schedule noise (Challengers, academy) must stay filtered for dashboard display while still ingesting guest orgs at internationals |
| **Auth / billing / Duo / Community** | Product shell; not blocked by SoR choice, but out of P0 data scope |
| **Live hub** | Deferred until warehouse green; livestats already proves MV live is possible (§7) |
| **Cold-load perf** | Stop blocking Hub on ~36 MB OE year shards regardless of SoR |

**Verdict on TODO 1:** Your description is the full *core system*. Treat the table above as explicit P1/P2 attachments, not as missing SoR requirements.

---

## 2. Why v4 (diagnosis from 2026-08-03 audit)

### 2.1 What we observed in production

| Symptom | Evidence |
| --- | --- |
| Hub shows series scores but Form is empty | ACTIVE PLAYERS **0**, GAME ROWS **0**, standouts “no weekly game log” for Jul 28–Aug 3 |
| OE missing current LCK/LPL Summer | CDN shards have `2026 Summer\|LEC`, `\|LCS`, `\|INT` only — **no `Summer\|LCK` / `Summer\|LPL`**; OE max dates ~Jul 26–28 |
| Cito player box scores not usable | `cito_player_stats_cache.json` → `rowCount: 0` since 2026-08-01 |
| Recaps are thin / wrong-context | Score-only blurbs; invented “lower bracket” language on regular-season weeks |
| Chat cannot answer “what happened this week” | Claims LCK Summer not started; cites MSI June — while Hub already lists Aug 2 Cito scores |
| Cold dashboard load ~15s+ | ~36 MB OE shards (`p01` 22.5 MB + `p02` 15.3 MB) block first paint |

### 2.2 Root cause (not a UI bug)

We pivoted Hub/Board **schedules/scores** to Cito, but **Form, recaps, chat tools, and model features still need per-player box scores**. Those were supposed to come from:

1. **OE CSVs** — historically rich, but recently lagging / missing Summer LCK+LPL slices  
2. **Cito player-stats sync** — intended lag-fill; currently empty in prod and historically spotty on advanced fields

Result: scores look “current,” everything that needs stats looks “broken.”

### 2.3 What “good” looks like

For every completed tier-1 game (LCK / LPL / LEC / LCS + MSI / Worlds / First Stand / EWC when applicable), within hours of series end we need:

- Series score + BoX + tournament/block context  
- Per-player: champion, role, K/D/A, CS, gold, damage, damage share, vision/wards  
- Early/mid diffs usable for form + recaps (GD/CSD/XPD@10–15 at minimum; @20/@25 preferred)  
- Team objectives (dragons/barons/towers/heralds/etc.)  
- Draft: picks/bans (ordered if possible)  
- Gold/objective timelines for graphs + model features  
- Stable IDs linkable across schedule ↔ game ↔ player  

Plus for live hub (deferred in v3): in-progress gold/kills/objectives/player frames at ≤~10–15s cadence.

---

## 3. Product fixes that must happen (independent of which vendor we pick)

These are product/engineering outcomes. The data research in §5–7 chooses *how*.

### P0 — Data reliability (blocking everything else)

1. **Choose and implement a Current SoR** for recent tier-1 box scores (see §8 recommendation).  
2. **Stop presenting stale OE as “current form.”** Freshness stamps must match the window that Form/standouts actually use.  
3. **Repair or replace Cito player-stats path** — empty cache must never silently ship as “synced.”  
4. **Backfill 2026 Summer LCK + LPL** into the warehouse used by Form / ML / chat.  
5. **QA gates in CI:** fail (or alert loudly) when lookback window has scores without box scores, or when Summer regional slices are missing.

### P1 — Recaps regain insight quality

1. Recap generation must receive real `SeriesFacts` (stars, concerns, lane duels, GD@15, KP, dmg share) — not score-only shells.  
2. Remove / fix bracket narrativeHints for regular-season series (`lower bracket` only when format is actually double-elim).  
3. Regenerate recent score-only rows once box scores exist (`RECAP_REGENERATE`).

### P1 — Chat matches Hub reality

1. Chat completed-results path must use the **same Current SoR** as Hub (not OE-first with Cito skipped).  
2. “This week / recent form” questions must not claim a split hasn’t started when Hub lists those series.  
3. Keep OE for deep history; keep fail-closed when *no* source has the fact — but never prefer stale OE over fresh Current SoR.

### P0 — Dashboard load time (active 2026-08-06)

Friends report ~15s loads / “high ping” feel. Root cause: ~40.5 MB OE year shards + full client merge on `DashboardProvider` mount (including landing), duplicate hub merge, eager route JS, Outlet remount + GSAP on every tab.

**Phase A (shipping now):**
1. Defer `DashboardProvider` / OE fetch off landing + legal/auth routes.  
2. Reuse one `mergeSlices` when hub filters ≡ dashboard (`selectedSplits` includes `ALL`).  
3. `React.lazy` dashboard/entity routes + Vite `manualChunks` for recharts/gsap.  
4. Stop `no-store` + timestamp cache-bust on small ML artifacts.  
5. Drop pathname-keyed Outlet remount; shorten route sweep.

**Phase B (shipped 2026-08-06):**
6. ~~Lean hub bootstrap~~ — `public/data/hub_bootstrap.json` (~2.4 MB: aggregates + 45d recentForm + window catalog). Hub paints from bootstrap; full ~42 MB year parts load in background. Built by `scripts/build_hub_bootstrap.py` (also hooked into ingest/export:shards).  
7. ~~Index vs detail~~ — bootstrap = index; full shards = detail (entity/Players Form complete after `oeDetailReady`).  
8. ~~IndexedDB~~ — replaces dead localStorage year-shard cache (`oeShardIdb.ts`).

### P2 — Model freshness

1. Retrain / Elo bump must consume Current SoR box scores, not wait on OE Drive.  
2. Publish `ml_freshness` honestly; never imply ratings include games the feature mart never saw.  
3. Deploy `agent-chat` ML artifacts as part of the retrain checkpoint (still manual unless automated).

### P2 — Live hub reintroduction (see §7)

1. Re-add Live only when live frames are dense enough for a useful product (gold/kills/objectives + player KDA/CS/gold), not score-only.  
2. Keep v3 rule: **no mid-game live win%** unless explicitly revisited. Post-draft packets stay the paid foresight layer.

### P3 — Carry forward from v3 (still open)

- Community v1 (V3-5)  
- Chat analyst depth (V3-6) once data SoR is fixed  
- Paid chat quota final numbers  

---

## 4. Competitor / ecosystem reality (where sites get data)

Sites like **tabesports.gg** and **gol.gg** do not publicly disclose a commercial feed. Public evidence + community reverse-engineering strongly suggests they aggregate the **same public upstreams** available to solo builders:

| Upstream | Role for community sites |
| --- | --- |
| Riot LoL Esports Persisted Gateway | Schedules, live series state, completed events, game IDs |
| Riot Live Stats feed (`feed.lolesports.com/livestats`) | 10s frames: gold, objectives, player KDA/CS/gold; details: damage share, wards, items, runes, skill order |
| Leaguepedia Cargo | Scoreboards, ordered picks/bans, rosters, tournament metadata (wiki editors + Riot disclosure) |
| Oracle’s Elixir CSVs | Bulk historical analytical columns (download, not live) |

They are **not** magically on GRID. Their advantage is **aggressive caching + enrichment pipelines** on public feeds — which we can build. Scraping their HTML is brittle, ToS-hostile, and unnecessary.

**Important constraint:** Riot Match-V5 does **not** expose tournament-server pro games. Pro data must come from esports-specific feeds (official GRID/LDP, or the public lolesports + Leaguepedia stack).

---

## 5. Data source research

Cost estimates are as of research date (2026-08-03) and may change. “Solo-fit” assumes one operator, paid product (nucky has a paid tier), no registered business entity today.

### 5.1 Comparison matrix

| Source | Cost (approx) | Timeliness | Box-score depth | Live frames | History | Solo-fit | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Riot Persisted GW + Live Stats** | Free (unofficial) | Near-real-time for broadcast games | High if final `details` + sampled `window` cached | **Yes** (10s frames) | As long as games remain fetchable | **Best default** | Same feed lolesports.com uses; undocumented; can break |
| **Leaguepedia Cargo** | Free (CC-BY-SA attrib) | Hours–days (wiki) | Good scoreboards; best **ordered drafts** | No | Excellent encyclopedic | **Must-have enrichment** | Strict rate limits; batch + cache |
| **Oracle’s Elixir CSV** | Free download | Days–weeks lag lately | Excellent analytical columns (@10–25, objectives, etc.) | No | Best multi-year public CSV | Keep as **historical backbone** | Not viable as Current SoR anymore |
| **CitoAPI** | Free → Pro ~$50/mo (250k); Business higher | Good for schedule/scores | Spotty postgame / empty player-stats cache in our prod | Partial (`/lol/live`, window endpoints) | Limited vs OE | Keep for schedule/webhooks; **not** Current box-score SoR | Already integrated; reliability gap is the problem |
| **BALLDONTLIE LoL** | Free / $9.99 / **$39.99 GOAT** | Claimed daily | KDA, gold, dmg, wards, items, runes — **no OE-style @15 diffs in published samples** | Not a livestats replacement | Growing | **Strong paid evaluate** | Self-serve; trial; verify LCK/LPL 2026 coverage before commit |
| **PandaScore** | Free fixtures; stats from **~€400/game/mo**; live ~€1000/game/mo | Strong | Commercial stats + WS live | Yes (paid) | Strong | Expensive for solo | Sales for higher tiers; betting restrictions on some plans |
| **Abios (Kambi)** | Sales-gated (~$1k+/mo cited) | Strong | Deep + betting-oriented | Yes | Strong | Poor | No self-serve |
| **Sportradar Esports** | Enterprise (~$5k+/mo cited) | Strong | Deep | Yes | Strong | Poor | Enterprise sales |
| **GRID / Riot LDP** | Commercial via GRID; LDP community “in the works” | Best official | Best official telemetry | Best official | Official | Blocked today (registered business); **revisit** | We already hit business-entity wall |
| **RapidAPI lol-esports1 (elreco)** | Free / ~$20/mo plans | Proxy of Riot GW | Thin wrapper of schedule/standings/matchDetails | Proxies livestats endpoints | Thin | Low value | Extra middleman on same unofficial Riot APIs; RapidAPI health metrics weak |
| **Pupix/lol-esports-api** | Free (docs/repo) | N/A | N/A | N/A | N/A | Docs only | Unofficial API notes; not a hosted SoR |
| **howarc lol_match_analysis** | N/A | N/A | Uses OE 2024 CSV | No | Sample project | Not a source | Academic OE consumer — not a feed |
| **gol.gg / tabesports scrape** | “Free” + legal risk | Varies | Whatever they render | Partial | Partial | **Do not** | Downstream of public feeds; brittle |
| **Riot ACS** | Free but cookie/login | Fragile | Very rich when works | Timeline-like | Historical tournament hashes | Experiment only | Expected to die; not a dependency |
| **Data Dragon / CDragon** | Free | Static | Assets only | N/A | Patches | Required companion | Icons for items/runes/champs |

### 5.2 Source dossiers

#### A) Riot LoL Esports Persisted Gateway + Live Stats *(priority candidate)*

- **Docs:** [vickz84259.github.io/lolesports-api-docs](https://vickz84259.github.io/lolesports-api-docs/)  
- **Persisted GW:** `https://esports-api.lolesports.com/persisted/gw/*` with public `x-api-key` (documented in unofficial OpenAPI). Endpoints: `getLeagues`, `getSchedule`, `getLive`, `getCompletedEvents`, `getEventDetails`, `getGames`, `getTeams`, standings, etc.  
- **Live Stats:** `https://feed.lolesports.com/livestats/v1/window/{gameId}` and `/details/{gameId}`  
  - `window`: team gold/kills/towers/barons/dragons/inhibs; per-player level, KDA, CS, gold, health  
  - `details`: KP, championDamageShare, wards placed/destroyed, combat stats, **items**, **perkMetadata (runes)**, **abilities (skill order)**  
- **Reliability:** Unofficial but stable for years; same stack powers lolesports.com. No SLA. Must cache aggressively and degrade gracefully.  
- **Cost:** $0.  
- **Caveats:** Coverage = games broadcast on lolesports.com (fine for tier-1). Schema can change. Paid product use is gray — every community stats site does this; still prefer official LDP if/when available.  
- **Fits nucky:** Current box scores (final details frame), gold curves (window sample), **live hub**, schedule IDs for linkage.

#### B) Leaguepedia MediaWiki Cargo API

- **Endpoint:** `https://lol.fandom.com/api.php?action=cargoquery`  
- **Tables:** `ScoreboardGames`, `ScoreboardPlayers`, `PicksAndBansS7`, `MatchSchedule` / `MatchScheduleGame`, `Tournaments`, `TournamentRosters`, `Players`, `RosterChanges`, `Standings`, etc.  
- **Libraries:** `poro` (TS), `meeps` / `leaguepedia_parser` (Python).  
- **Reliability:** High for results/drafts/rosters once pages are updated; not second-level live.  
- **Cost:** Free; **CC-BY-SA** — attribute Leaguepedia when reusing.  
- **Caveats:** Aggressive rate limits (unauthenticated bursts often ~1 req/min class of pain; errors can appear as HTTP 200 body). Use bot login, nightly batch, hard cache.  
- **Fits nucky:** Ordered drafts, roster truth, tournament format metadata, scoreboard fallback when livestats missing, EWC/guest event context.

#### C) Oracle’s Elixir

- **What:** Annual/season CSV dumps with the richest public analytical columns (diffs @10/15/20/25, objectives, vision, sides, patches).  
- **Reliability (2026):** Historical backbone still excellent; **recent tier-1 freshness failed us** (missing Summer LCK/LPL slices while Cito already had scores).  
- **Cost:** Free.  
- **Fits nucky:** Multi-year training, z-score baselines, chat historical OE tools. **Not** Current SoR.

#### D) CitoAPI ([citoapi.com](https://citoapi.com/))

- **What we use today:** schedules, results, drafts, attempted player-stats + postgame gold.  
- **Pricing (marketing):** free tier; Pro historically ~$50/mo / 250k calls (confirm current dashboard — site pricing cards were in flux). Commercial use allowed on paid tiers; webhooks on paid.  
- **Strengths:** Self-serve, AI-friendly JSON, multi-game, schedule/live convenience.  
- **Weaknesses for nucky:** Player-stats sync produced **empty prod cache**; postgame/gold coverage previously audited as partial; not OE-parity for @10/@20 feature mart.  
- **Fits nucky:** Optional schedule/webhook accelerator; **demote from Current box-score SoR** until proven with QA gates.

#### E) BALLDONTLIE LoL API ([lol.balldontlie.io](https://lol.balldontlie.io/))

- **Tiers:** Free (meta) / ALL-STAR $9.99 (tournaments) / **GOAT $39.99** (matches + player/team map stats) / ALL-ACCESS $299.99. 48h GOAT trial.  
- **GOAT fields (published samples):** K/D/A, KP, CS, gold, GPM, damage to champs, wards, items, spells, runes; team objectives (baron/dragon/herald).  
- **Gaps vs OE:** No documented GD/CSD/XPD@10–25 in samples — may need livestats-derived diffs for recap/model parity.  
- **Fits nucky:** Attractive **paid convenience layer** if their 2026 LCK/LPL freshness beats OE. Must trial against last 14 days of LCK/LPL before adopting as SoR.

#### F) PandaScore

- Free fixtures/results tier; historical/post-match stats from ~**€400/mo per game**; live WS from ~**€1000/mo per game**.  
- Strong commercial product; overkill for solo unless revenue clearly covers it.  
- Betting-related usage may be restricted on stats plans — check before assuming nucky’s paid foresight is allowed.

#### G) Abios / Sportradar

- Enterprise, sales-gated. Cited ballparks: Abios ~$1k+/mo, Sportradar ~$5k+/mo.  
- Excellent for sportsbooks; poor solo-fit. Include only as “if we incorporate / raise capital.”

#### H) GRID Esports / Riot Official Data ([riotesportsdata.com](https://riotesportsdata.com/league-of-legends), [grid.gg](https://grid.gg/get-league-of-legends/))

- **Official** live + fixtures + A/V. Best integrity/SLA.  
- Commercial via GRID; FAQ: community/non-profit LDP rollout still “working towards”; live/fixtures currently commercial.  
- Regional commercial coverage historically incomplete for some regions (e.g. LCK media-only caveats — verify current).  
- **Our status:** outreach blocked on **registered business** requirement.  
- **Keep on roadmap:** if we form an entity or LDP open-access lands, this becomes the endgame SoR and we retire unofficial feeds.

#### I) RapidAPI wrappers (elreco `lol-esports1`, others)

- Thin proxies over Riot persisted/livestats-style endpoints.  
- Adds RapidAPI billing/latency/uptime risk for data we can call directly.  
- **Not recommended** as SoR.

#### J) Pupix/lol-esports-api, howarc analysis site

- Documentation / academic OE consumers — useful references, not feeds.

#### K) Scraping gol.gg / tabesports / loltv

- **Rejected** as primary strategy (ToS, brittle DOM/XHR, they are downstream of A–C).

---

## 6. Capability coverage vs nucky needs

| Need | Best realistic sources (solo) | Notes |
| --- | --- | --- |
| Timely series scores | Riot GW `getCompletedEvents` / `getEventDetails`; Cito schedule | Already partly solved |
| Per-player box scores (current) | **Livestats final `details` + `window`**; Leaguepedia `ScoreboardPlayers`; BALLDONTLIE GOAT (evaluate) | OE lag is the hole |
| @15 / early diffs | Derive from livestats `window` frames at t=10/15/20/25; OE historical | Cito normalize can help but is unreliable today |
| Ordered drafts | **Leaguepedia `PicksAndBansS7`**; Cito drafts (partial) | OE bans/picks unordered |
| Gold curves | Livestats `window`; Cito postgame (spotty); gol cache (legacy) | Prefer livestats |
| Items / runes / skill order | Livestats `details` | Unlocks tabesports-like depth |
| Multi-year training | **OE CSV** + Current SoR append | Keep hybrid warehouse |
| Live hub | **Livestats `window` + GW `getLive`**; PandaScore/GRID if paid | See §7 |
| Rosters / transfers | Leaguepedia; Cito transfers | Chat identity |
| Official SLA | GRID / LDP only | Business entity path |

---

## 7. Live hub data research (re-adding the feature)

### 7.1 Why live was scrapped

v2/v3 deferred the full live hub because available feeds were **score-thin or coverage-spotty** (Cito live often lacked dense per-player frames; building a product on empty panels destroyed trust). Post-draft Board badges ≠ a live hub.

### 7.2 What “enough live data” means for nucky

Minimum viable live series panel:

1. Series state (game N of BoX, teams, score)  
2. In-game clock + game state  
3. Team gold + kill totals + towers/dragons/barons  
4. Per-player: champion, KDA, CS, gold (updating)  
5. Poll ≤15s or push via webhook/WS  

Nice-to-have: damage share, items, dragon types, plates.

Explicit non-goal (v3 lock, keep unless revisited): **mid-game win probability**.

### 7.3 Live source options

| Source | Live adequacy | Cost | Solo-fit | Verdict |
| --- | --- | --- | --- | --- |
| **Riot livestats `window` + `getLive`** | **Sufficient** for MV live hub | Free | High | **Primary path to re-add Live** |
| Cito `/lol/live` + `/live/{id}/window` | Partial; validate density per league | Already paying/free tier | Medium | Secondary / backup |
| PandaScore Live WS | Sufficient | ~€1000/game/mo | Low | Only if revenue justifies |
| GRID live | Best | Commercial + entity | Blocked now | Long-term |
| Abios / Sportradar | Sufficient | Enterprise | Poor | No |

### 7.4 Recommended live architecture (when we re-add)

```text
Browser → supabase/functions/cito-live (or rename lolesports-live)
        → Riot getLive (which series are live)
        → Riot livestats window/{gameId} (frames)
        → short Cache-Control (5–15s)
        → optional write of end-of-game final frames into warehouse
```

Do **not** expose Riot keys or hammer feeds from the browser. Cache final frames into the same Current SoR warehouse so Live and postgame Form share IDs.

---

## 8. Spike results — Riot Persisted Gateway (2026-08-03)

Live probe against production Riot endpoints. Artifacts: `.tmp/riot_gw_spike_report.json`, `.tmp/riot_livestats_quality.json`.

### 8.0 Verdict (read this first)

| Question | Answer |
| --- | --- |
| Can **Persisted Gateway alone** replace OE/Cito as primary SoR? | **No.** GW gives schedules, series scores, game IDs, live discovery — **not** per-player box scores. |
| Can **GW + Live Stats** replace OE/Cito for *new/current* match ingest? | **Yes, for nucky’s core current-form use case** — with known gaps below. |
| Should we keep OE? | **Yes — historical backbone only** (existing multi-year CSVs). Stop using OE as the freshness clock. |
| Should Cito stay primary? | **No.** Optional helper at most once Riot warehouse ships. |

This matches the intended infra:

```text
OE        → historical training / deep chat history (already have ~12y)
Riot GW   → schedule, scores, match/game IDs, getLive
Live Stats→ per-game box scores, gold curves, live frames, items/runes
Leaguepedia → ordered drafts / roster encyclopedia (GW has no pick-ban order)
```

### 8.1 What Persisted Gateway proved

| Capability | Result | Evidence |
| --- | --- | --- |
| Tier-1 league IDs (LCK/LPL/LEC/LCS + MSI/Worlds/First Stand/**EWC**) | **Pass** | `getLeagues` — EWC slug `ewc_lol` present |
| Upcoming schedule | **Pass** | `getSchedule(leagueId)` — e.g. LCK 14 upcoming in next ~10d |
| Completed series + scores (last 14d) | **Pass — fresher than OE** | LCK **10**, LPL **26**, LEC **14**, LCS **8** completed series including Aug 1–3 mains (HLE–KT, TES–JDG, G2–SK, …) while OE Summer LCK/LPL slices were missing |
| Game IDs for linkage | **Pass** | `getEventDetails` → `match.games[].id` (schedule pages often omit `games[]`) |
| Live series discovery | **Pass** | `getLive` works |
| Per-player KDA/gold/dmg on GW payloads | **Fail** | `getEventDetails` player objects have no combat stats |

**API footgun:** `getCompletedEvents?leagueId=LCK` does **not** return LCK-only history — first 80 rows were LRS/EWC/Prime League/etc. **Always use `getSchedule(leagueId)` + `pages.older` pagination** for league-scoped ingest.

### 8.2 What Live Stats proved (required companion)

With `startingTime` set **after game end** (critical):

| Metric | Result (8 games: LCK/LPL/LEC/LCS) |
| --- | --- |
| Meaningful final `details` frames | **8/8** |
| K/D/A, CS, gold, KP, damage share, wards | **Present** |
| Items non-empty on final frame | **8/8** (also runes/`perkMetadata`, abilities field) |
| GD@15 derived from `window` gold | **8/8** |
| Example | HLE vs KT G1 — Zeus Ambessa 3/5/5, 259 CS, 12.6k gold, 28.7% dmg share; team GD@15 −3723 |

**Pitfall:** wrong/early `startingTime` returns level-1 / zeroed frames that still have 10 participants — naive “success” checks lie. Ingest must require `sum(totalGoldEarned) > threshold` (spike used &gt;10k).

**Curve density:** a single window call returns a short frame slice (~10–40 points). Full minute-by-minute gold curves need **paging `window` across the game** (multiple `startingTime`s), not one final call.

### 8.3 Sufficiency vs nucky product surfaces

| Surface | GW+LiveStats enough? | Notes |
| --- | --- | --- |
| Hub series list / scores | **Yes** | Via GW schedule |
| Board upcoming | **Yes** | GW |
| Form / standouts / player gameLogs | **Yes** | Final `details` + champ/role from `window` metadata |
| Recap advanced insights | **Mostly yes** | Stars/concerns from KDA, KP, dmg%, GD@15; lane CS@15 derivable from window participant CS |
| Gold graphs | **Yes** (with paging) | Prefer over Cito/gol patchwork |
| Live hub | **Yes** | `getLive` + polling `window` |
| Model current retrain append | **Mostly yes** | Core role/team features available; see gaps |
| Ordered drafts / draft model features | **No** | Need Leaguepedia (or keep Cito drafts) |
| OE-parity `xpdiffat15` / full @10/@20/@25 matrix | **Gold/CS yes; XP no** | Redesign features around gold/CS timelines + final box; keep OE for historical XP columns |
| Multi-year history | **No** | Keep OE CSVs |

### 8.3b OE column parity probe (2026-08-04)

Artifact: `.tmp/riot_oe_column_parity.json` (script `.tmp/probe_riot_oe_parity.py`).

**Sample:** 2 completed games each from LCK / LPL / LEC / LCS (8/8 final `details` frames meaningful). Probed against the full OE column list you provided.

| Bucket | Count (of OE columns) | Meaning |
| --- | --- | --- |
| **YES** (native or cleanly derived) | **49** | Identity, KDA, CS, gold, damage share, wards placed/killed, dragons by type, barons, towers, inhibitors, KP-ish rates, etc. |
| **PARTIAL** | **60** | Mostly @10/@15/@20/@25 gold/CS/KDA timelines (need correct wall-clock paging — see footgun below); damage share→absolute DPM; first-blood heuristics; split/playoffs inference |
| **NO** | **56** | Ordered bans/picks, XP@X, vision score, control wards, damage taken/mitigated, heralds/grubs/atakhan/plates, multi-kills, playerid/url, gspd/gpr, jungle CS splits |

**Critical subsets (what the model + Form actually lean on):**

| Subset | YES | PARTIAL | NO | Call |
| --- | --- | --- | --- | --- |
| Identity (game/league/date/side/role/player/team/champ/result/length) | 12 | 0 | 0 | **Full** |
| Core box (KDA, gold, CS, dmg share, wards) | 10 | 2 | 1 | **Enough** — missing `visionscore`; absolute `damagetochampions`/`dpm` only via share |
| Early diffs (GD/CSD/XPD @10–25) | 0* | 8 | 4 | **GD+CSD yes with paging**; **all XP columns NO** |
| Objectives | 4 | 1 | 7 | Dragons/barons/towers/inhibs yes; heralds/grubs/atakhan/plates/first-X mostly no |
| Draft (ban1–5, pick1–5, firstPick) | 0 | 0 | 11 | **Need Leaguepedia** (or temporary Cito drafts) |

\*Parity script marked GD/CSD as PARTIAL because the first naive pager used **series** `startTime` (often hours before game 1). A follow-up wall-clock walk on HLE–KT G1 proved mid-game frames exist: data begins ~`11:30Z`, dense through finish ~`12:03Z`, with team gold progressing 8k → 23k → 39k → 59k → … → final. **Ingest must discover first non-empty window, then page ~every 10–60s** (floor `startingTime` to 10s). Do **not** trust series start + N minutes.

**Confirmed Live Stats field reality (final `details` participant keys):**  
`kills/deaths/assists`, `creepScore`, `totalGoldEarned`, `championDamageShare`, `killParticipation`, `wardsPlaced`, `wardsDestroyed`, `level`, `items`, `perkMetadata`, `abilities` — **no** `visionScore`, **no** absolute damage to champions, **no** XP.  
**Window team keys:** `totalGold`, `totalKills`, `towers`, `barons`, `inhibitors`, `dragons[]` — **no** heralds / void_grubs / atakhans / plates.

**Correction to earlier §8.2 claim:** the 2026-08-03 quality probe’s `gd15` values were often **final gold diff mislabeled** (t0 = first frame of the *end* slice). True GD@15 is available, but only with mid-game paging as above. Acceptance gate stays: ≥80% games with GD@15 skew ≤30s.

### 8.3c Sufficiency verdict for nucky.gg (TODO 3)

**Yes — Riot GW + Live Stats is sufficient as Current SoR to replace OE+Cito for the current-form / refresh / futures path**, if we accept the supplements below. OE remains historical-only for nuckyAI + multi-year training baselines.

| Need from your brief | Covered by? | Gap / supplement |
| --- | --- | --- |
| Timely new match data (tier-1 + intl guests) | **GW schedule + eventDetails + livestats** | Ingest non–tier-1 when they appear on intl / guest schedules; dashboard *display* filter stays tier-1-centric |
| Box scores for Form / power scores | **Live Stats final details + window** | Drop vision_score weight for current rows; use wards as proxy |
| GD/CSD @10–25 for form + recaps + model | **Derived from paged window** | Must implement game-start discovery + dense paging (ops cost) |
| XPD @10–25 | **Not in feed** | **Model change:** zero/deweight `xpd15` on Current SoR rows; keep XP features on OE-history training only *or* drop XP entirely after backtest |
| Absolute DPM | **Share only** | Prefer `damageshare` in ratings; optional estimate if team damage ever appears elsewhere — do not block on OE DPM |
| Ordered drafts / first pick | **Leaguepedia Cargo** (keep Cito drafts as lag backup) | Required for draft model + post-draft packets |
| Series grouping + BoX complete + order | **GW** `strategy` + game numbers + start/end times | Cross-check Leaguepedia `MatchSchedule` when format ambiguous |
| Upcoming schedule for futures | **GW getSchedule** | Academy filter for Board display |
| Prediction W/L logging | **Existing holdout/scorecard path** — feed warehouse results | Wire resolution against GW completed scores, not OE |
| Tournament format / block names | **GW blockName** + Leaguepedia | Recap narrativeHints must not invent brackets |
| Historical “who won Worlds 2024?” | **OE (keep)** | Chat routes history→OE, current→warehouse |

**Do we need anything else besides Leaguepedia + OE-history?**

| Optional | When to add |
| --- | --- |
| Cito | Short migration bridge for drafts/schedule only; **not** Current box-score SoR |
| BALLDONTLIE GOAT (~$40/mo) | Only if livestats paging ops become painful *and* trial proves LCK/LPL freshness + fields |
| GRID/LDP | Long-term official SLA once business entity / access opens |
| Scraping gol/tabesports | **No** |

**Bottom line:** OE+Cito current path can be retired. Build the warehouse on Riot. Supplement drafts/format with Leaguepedia. Redesign a few ML features (XP, absolute DPM, vision) rather than waiting for OE-parity columns that the public feed will never have.

### 8.4 Target architecture (locked)

```text
                    ┌─────────────────────────────┐
                    │   Normalized match warehouse │
                    │  (Supabase + CDN artifacts)  │
                    └──────────────▲──────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
┌───────┴────────┐      ┌──────────┴──────────┐     ┌─────────┴─────────┐
│ Current SoR    │      │ Enrichment          │     │ Historical        │
│ Riot Persisted │      │ Leaguepedia Cargo   │     │ OE CSVs           │
│ GW + Live Stats│      │ (ordered drafts,    │     │ (existing ~12y;   │
│                │      │  rosters)           │     │  not freshness)   │
└────────────────┘      └─────────────────────┘     └───────────────────┘
        │                          │                          │
        └──────────────┬───────────┴──────────────┬───────────┘
                       ▼                          ▼
              Hub / Form / Recaps / ML           Chat historical OE tools
              Live hub / gold graphs             + current warehouse tools
```

### 8.5 Decision rules

1. **Current SoR = Riot Persisted GW + Live Stats** (one pipeline; GW alone is not enough).  
2. **OE = historical only** — training baselines + chat deep history; never the clock for “data through”.  
3. **Cito** demoted — not required for Current SoR; may keep briefly as schedule backup during migration.  
4. **Leaguepedia** required for ordered picks/bans (and useful for rosters).  
5. **BALLDONTLIE** optional later if ops cost of livestats paging is too high — not blocking.  
6. **GRID/LDP** remains long-term official target if entity/access opens.  
7. **Never scrape** gol/tabesports as SoR.

### 8.6 Acceptance gates before calling Current SoR “done”

For the rolling last 14 days of tier-1 mains (academy filtered):

| Gate | Pass criteria |
| --- | --- |
| Completeness | ≥95% completed series have ≥8 player rows with champion + KDA + damage or gold |
| Freshness | Median series→warehouse lag &lt; 6h (target &lt; 2h on match days) |
| Region | LCK **and** LPL rows present in warehouse for the current split window |
| Diffs | ≥80% games have GD@15 derivable from window frames |
| Recap | `isScoreOnlyBrief` rate &lt; 10% for in-window series |
| Chat | “Who won LCK this weekend?” answers with warehouse scores |
| Live (when shipped) | During a broadcast game, window frames non-empty for &gt;90% of poll samples |
| Quality | Reject frames with `sum(totalGoldEarned) &lt; 10k` as non-final |

---

## 9. Phased delivery (v4)

Phases are product slices. Do not start Community polish before P0 data gates pass.

| Phase | Name | Exit criteria |
| --- | --- | --- |
| **V4-0** | Source lock | ✅ Spike done — GW alone insufficient; **GW + Live Stats** locked as Current SoR |
| **V4-1** | Current warehouse | `getSchedule` pagination ingest + `getEventDetails` gameIds + livestats final-frame + **game-start discovery** + gold/CS paging for 2026 tier-1; Leaguepedia drafts hooked; LCK/LPL backfilled; CI completeness gate green |
| **V4-2** | Product rewire | Hub Form/standouts/recaps/chat current tools read warehouse; score-only + false bracket language fixed; freshness stamps honest |
| **V4-3** | Model path | Feature mart consumes Current SoR append; Elo/ratings reflect new games without OE Drive wait; packets redeployed; XP@15 features redesigned or OE-history-only |
| **V4-4** | Perf | Hub cold load &lt; 3s to interactive (schedule/recaps); OE/history lazy |
| **V4-5** | Live hub v1 | Live tab/panel on broadcast games using livestats window; no live win% |
| **V4-6** | Official track | Re-apply GRID/LDP or incorporate if/when access opens; dual-run then cut unofficial live |

v3 leftovers (Community, chat analyst depth) resume after **V4-2**.

---

## 10. Immediate next actions / TODOs

### Done
1. ~~Spike Riot GW + Live Stats~~ (2026-08-03)  
2. ~~OE column parity across LCK/LPL/LEC/LCS~~ (2026-08-04) — §8.3b  
3. ~~Confirm system map + sufficiency verdict~~ — §1.5, §8.3c  

### V4-1 — Current warehouse (next)
1. Implement ingest: `getSchedule` pagination → `getEventDetails` gameIds → livestats final details + **game-start discovery** + dense window paging for GD/CSD@10/15/20/25.  
2. Normalize into OE-compatible (or near-OE) row shape for Form/ML (`gameid`, side, role, KDA, gold, CS, damageshare, golddiffat*, csdiffat*, objectives…).  
3. Backfill 2026 Summer LCK + LPL (and rolling 6–12 months).  
4. CI completeness gate: lookback scores without box scores → fail/alert; LCK+LPL both present.  
5. Leaguepedia draft enrichment job (ordered bans/picks) with Cito drafts as temporary backup.  

### V4-2 — Product rewire
6. Hub Form / standouts / recaps / chat **current** tools read warehouse (stop OE-first for “this week”).  
7. Series grouping + completed-series recap generation from warehouse facts (fix bracket narrativeHints).  
8. Honest freshness stamps; Hub cold path without 36 MB OE shards.  

### V4-3 — Model / Refresh Action
9. Point “Refresh Dashboard Data” at warehouse delta (not OE Drive wait) → retrain → publish ratings + `ml_freshness`.  
10. Redesign features: deweight/drop `xpdiffat*` on Current rows; prefer damageshare over absolute DPM; wards proxy for vision.  
11. Resolve predictions against GW completed scores; keep holdout log + accuracy scorecard green.  
12. Board futures continue from GW upcoming schedule (academy-filtered).  

### Later
13. Live hub v1 (V4-5).  
14. GRID/LDP track when entity/access opens (V4-6).  
15. Optional BALLDONTLIE trial only if paging ops hurt.

### P0 next — nuckyAI quality (after dashboard perf)

Intended: normal LLM chatbot UX, LoL-esports specialization (refuse off-topic / coding / stocks), accurate stats + prediction-model context, fill historical gap scraped from dashboard, entity disambiguation (Caps / Ice / Inspired).

**TODOs:**
1. Current tools read same warehouse as Hub (stop OE-first “Summer not started”).  
2. Wire `buildAgentOEFilters` in `agent-chat`; stop dashboard filter pollution.  
3. Entity disambiguation layer (team/league-aware; clarify short common-word names).  
4. Historical multi-year OE/stat tools for career/all-time *numbers* (not titles-only via web).  
5. Keep prediction packets aligned with Hub ratings (auto-deploy on retrain when Actions recovers).  
6. Offline eval harness: hundreds of prompts against `/chat` (not Gmail login from agents).  
7. UX: typeahead inserts into draft; streaming/history already OK.

---

## 11. Non-goals (v4)

- Replacing OE historical CSVs entirely  
- Mid-game live win probability  
- Scraping gol.gg / tabesports as a dependency  
- Paying enterprise Abios/Sportradar/PandaScore live solely to unblock Form  
- Pretending Cito player-stats is fixed without green QA gates  
- Shipping Community as a distraction from empty Form/recaps  

---

## 12. Relationship to prior docs

| Doc | Role after v4 |
| --- | --- |
| `nucky_v3.md` | Still owns IA / monetization / form-window product locks |
| `nucky_v2.md` | Model/build history |
| `CITOAPI.md` | Integration notes; strategy section superseded by §8 here |
| `data-sources-research.md` | Still valid enrichment detail for livestats + Leaguepedia; v4 elevates that path to **Current SoR**, not optional polish |

---

## 13. Research changelog

| Date | Note |
| --- | --- |
| 2026-07 | `data-sources-research.md` — livestats + Leaguepedia recommended as enrichment |
| 2026-08-01 | v3 Cito-primary Hub scores; OE lag documented in §9.4 |
| 2026-08-03 | Prod audit: empty Cito player-stats cache; missing OE Summer LCK/LPL; chat/Form break; v4 doc drafted |
| 2026-08-03 | **Riot spike:** GW alone = schedule/scores/IDs only; GW+LiveStats = 8/8 final box scores + GD@15 on LCK/LPL/LEC/LCS; `getCompletedEvents` not league-safe; Current SoR locked to GW+LiveStats; OE historical; Cito demoted (§8) |
| 2026-08-04 | **OE parity + system confirm:** full OE column map on 8 tier-1 games (§8.3b); GD/CSD@X require mid-game wall-clock paging (series start is wrong); XP/vision/absolute DPM/drafts/heralds missing; **sufficient with Leaguepedia + ML feature redesign**; system map gaps listed in §1.5; TODOs in §10 |
| 2026-08-05 | **Cutover implemented (V4-1 → V4-3):** `scripts/riot/` warehouse ingest shipped; adapter design reuses `cito_schedules` / `cito_player_game_stats` / OE-supplement CSV so every consumer goes warehouse-fresh without rewiring; Refresh Action rewritten Riot-primary with hard completeness gate; Cito demoted to soft fallback; spec in §15 |

---

## 14. Appendix — URL index

| Resource | URL |
| --- | --- |
| Unofficial LoL Esports API docs | https://vickz84259.github.io/lolesports-api-docs/ |
| Live Stats window | `https://feed.lolesports.com/livestats/v1/window/{gameId}` |
| Live Stats details | `https://feed.lolesports.com/livestats/v1/details/{gameId}` |
| Persisted gateway | `https://esports-api.lolesports.com/persisted/gw/` |
| CitoAPI | https://citoapi.com/ |
| Cito LoL endpoints registry | https://lolesportsapi.com/lol-api-endpoints/ |
| Pupix repo | https://github.com/Pupix/lol-esports-api |
| RapidAPI elreco | https://rapidapi.com/elreco/api/lol-esports1 |
| Leaguepedia Cargo | https://lol.fandom.com/wiki/Special:CargoTables |
| BALLDONTLIE LoL | https://lol.balldontlie.io/ |
| PandaScore pricing | https://www.pandascore.co/pricing |
| Abios | https://abiosgaming.com/esports-data-api |
| Riot official data | https://riotesportsdata.com/league-of-legends |
| GRID LoL portal | https://grid.gg/get-league-of-legends/ |
| OE downloads | https://oracleselixir.com/tools/downloads |
| howarc OE analysis demo | https://howarc.github.io/lol_match_analysis/ |

---

## 15. Cutover implementation spec (V4-1 → V4-3) — canonical, implemented 2026-08-05

This section is the canonical infra plan for the Riot GW + Live Stats cutover. It is
what actually shipped; §10's V4-1..V4-3 TODOs are satisfied by this design.

### 15.1 Portal vs GW+LiveStats — why we proceed now

Two entirely separate Riot surfaces:

| Track | Auth | Status | Role |
| --- | --- | --- | --- |
| **Developer Portal** (Match-V5 / Tournament APIs) | Personal/production API key, application review | Applied; review can take months; `riot.txt` verification pending | **V4-6 later track** — richer per-participant timelines (XP, vision, damage) if/when approved |
| **Persisted Gateway + Live Stats** (`esports-api.lolesports.com` + `feed.lolesports.com`) | Public `x-api-key` used by lolesports.com itself | Working today, proven in §8 spikes | **Current SoR now** |

Nothing in this cutover depends on Portal approval. If Portal lands later, it slots in
as an enrichment/replacement layer behind the same warehouse contract.

### 15.2 Adapter design — why nothing else had to be rewired

Key discovery: Cito was itself a thin wrapper over Riot GW. Its IDs are literally
`lol-match-{gwMatchId}` / `lol-game-{gwGameId}`. So instead of inventing a parallel
`riot_*` read path and rewiring every consumer, the Riot ingest **writes into the exact
stores every consumer already reads**:

| Store | Writer (new) | Consumers (unchanged) |
| --- | --- | --- |
| `cito_schedules` (Supabase) | `scripts/riot/ingest_riot.py` schedule sync | Board schedule, `citoSeriesVerify` series scores, weekly window anchor, recap gating, Elo bump, chat schedule lookup |
| `public/data/riot_schedule_cache.json` | same | `loadCitoSchedule.ts` cold-path fallback (riot cache preferred, cito cache legacy fallback) |
| `cito_player_game_stats` (Supabase) + `public/data/cito_player_stats_cache.json` | livestats box scores | Recap SeriesFacts (stars / KP / dmg%), player-stat surfaces |
| `data/ml/riot_oe_supplement.csv` (OE-shaped rows) | `scripts/riot/export_supplement.py` (offline, from committed game cache) | `oe_loader.load_raw_rows` (ML mart), `ingest_csv.py` (dashboard Form/gameLog shards), `seed_supabase.py` → `oe_slices` (chat current data) |
| `data/riot/games/*.json` + `data/riot/schedule_snapshot.json` (committed) | livestats ingest | incremental fetch state + QA gate input; deterministic supplement regeneration in any CI job without re-fetching |

Cito jobs remain as **soft fallback** (continue-on-error) during the dual-read week,
then can be deleted.

### 15.3 Warehouse schema contract (OE-compatible supplement rows)

Per completed game: 10 player rows + 2 team rows, `datacompleteness=partial`,
`cito_source=1` (existing supplement dedupe marker) + `riot_source=1`.

| Column group | Fill | Notes |
| --- | --- | --- |
| Identity (`gameid`=`lol-game-{id}`, league, date, game, patch, side, position, playername, teamname, champion, result, gamelength) | YES | roles from GW metadata; champion key → OE display name map; player names stripped of team-code prefix |
| Core box (kills/deaths/assists, teamkills/teamdeaths, totalgold, `total cs`, damageshare, wardsplaced, wardskilled, `earned gpm`≈gold/min) | YES | from final meaningful livestats `details` + `window` |
| Early diffs (`goldat/csat/killsat/assistsat/deathsat @10/15/20/25` + diffs + opp_*) | YES (skew &lt; 90s) | dense window paging from discovered game start (never series start) |
| Objectives (dragons+types, barons, towers, inhibitors + opp_*) | YES | final window team blocks |
| XP (`xpat*`, `xpdiffat*`), visionscore, absolute dpm/damage, goldspent, monsterkills, firstblood/firstdragon/firstbaron, plates, heralds, drafts | EMPTY (blank, not 0) | not in feeds — ML redesigned (§15.5); drafts stay on Leaguepedia/Cito enrichment |

Dedupe rules (already in `oe_loader` / extended in `ingest_csv`): OE row wins over any
supplement row on same (day, teamname); riot supplement wins over cito supplement.

### 15.4 CI job graph — `refresh-data.yml` (rewritten)

```
check ──────────────► sync-current (always)
  │                     1. riot ingest  (schedule → cito_schedules + caches;
  │                        livestats → data/riot/games + player-stats cache)   [HARD]
  │                     2. riot QA completeness gate                            [HARD]
  │                     3. cito schedule/drafts/player-stats/postgame           [soft fallback]
  │                     4. recaps (warehouse facts now present)
  │                     5. elo bump; commit caches; watermark
  │                     outputs: riot_new_games
  ├── run_cito_elo|riot_new ─► refresh-current-ml (no OE Drive wait)
  │                     restore lol/ cache → export riot supplement → retrain → publish
  └── run_oe_ml ──────► refresh-oe-ml (historical backbone only; cadence unchanged)
                        OE Drive → ingest shards (+riot supplement) → seed → retrain
```

The freshness clock is now the Riot ingest, not OE Drive and not Cito.

### 15.5 ML feature redesign (Current rows)

- `add_composite_z` renormalizes role weights over **available** stats per row
  (missing xpd15/vision/dpm on riot rows no longer silently compress composites;
  below 50% weight coverage the old neutral-fill behavior is kept as shrinkage).
- Damage: `damageshare` (native) preferred; absolute DPM blank on riot rows.
- Vision: wards placed/killed proxy; `visionscore` blank on riot rows.
- Holdout resolution: completed series scores come from GW via `cito_schedules`,
  and mart rows include warehouse games — predictions resolve without OE.

### 15.6 Acceptance gates + rollback

Gates (enforced by `scripts/riot/qa_completeness.py`, CI-hard):
- Every tier-1 league with completed series in the last 14d has ≥95% of those series
  covered by ≥1 warehouse game; fully-covered series ≥70%.
- ≥80% of covered games have GD@15 with frame skew &lt; 90s.
- Meaningful-frame rejection: final frames with `sum(gold) < 10k` are discarded.
- Offseason-safe: leagues with zero completed series in-window are skipped, never failed.

Rollback: Cito sync steps still run soft; deleting the riot steps restores v3 behavior.
`cito_schedules` rows are keyed by the same match ids, so dual-writing is idempotent.

### 15.7 Ryan checklist (post-push)

1. Apply `supabase/migrations/20260805090000_riot_sync_state.sql` (SQL editor) — watermark table only; schedules/box scores reuse existing tables.
2. Manually dispatch **Refresh Dashboard Data** once; watch the `Riot ingest` + `QA completeness gate` steps go green.
3. Confirm Cloudflare Pages deploy picks up `public/data/riot_schedule_cache.json` + refreshed `cito_player_stats_cache.json`.
4. Spot-check: Hub Form non-empty for LCK/LPL this week; Predictions Board shows GW upcoming; ask nuckyAI "who won in the LCK this weekend?".
5. No new secrets needed (GW uses the public lolesports key). `CITO_API_KEY` stays until fallback removal.
6. Riot Portal `riot.txt` verification remains pending — orthogonal to this path (§15.1).

### 15.8 Research changelog — dashboard perf + Actions (2026-08-06)

- GitHub Actions **major outage**: runs #501/#502 failed/queued with “job was not acquired by Runner of type hosted”; concurrency set to `cancel-in-progress: true` (`8a38453`).
- Hub scoring fixes (`d754450`) unverified in CI until Actions recovers.
- Dashboard perf Phase A implemented: defer OE off landing, dedupe hub merge, lazy routes, artifact HTTP cache, lighter tab nav.
- **Baseline (pre-Phase A):** ~40.5 MB OE shards (`p01` 22.3 + `p02` 18.2) on first `DashboardProvider` mount (including landing); ~15s friend-reported loads; tab remount + 0.55s GSAP sweep; single JS graph eager-loaded all dashboard pages.
- **After Phase A (verified locally):**
  - Landing / legal / auth: **no** `DashboardProvider` → **0** OE shard requests.
  - App-shell (`/dashboard`, `/duo`, `/chat`, `/profile`, `/contact`): OE fetch starts only after entering shell.
  - `selectedSplits=ALL` (default): single `mergeSlices` shared by tabs + weekly hub (no double ~22k gameLog merge).
  - Vite chunks: `Overview` ~35 KB, `Players`/`Teams` lazy, `charts` ~569 KB, `gsap` ~123 KB, `three` ~945 KB split out of eager path; route JS loads on demand.
  - Tab nav: Outlet no longer keyed by pathname (keeps mount); route sweep 0.55s clip → 0.22s fade.
  - Small ML/schedule JSON: HTTP `default` cache (memory TTL 5m); no `?t=` / `no-store` busting.
- **Phase B (progressive payloads):**
  - `hub_bootstrap.json` **~2.4 MB** (333 players w/ 45d form, window catalog) vs **~42 MB** year parts.
  - Hub paints from bootstrap; full shards load in background (`oeDetailReady` / `oeDetailLoading`).
  - Year shards cached in **IndexedDB** (localStorage quota was always exceeded).
  - Rebuild: `npm run build:hub-bootstrap` (also after ingest / export:shards).
