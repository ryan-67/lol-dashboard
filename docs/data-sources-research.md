# Data Enrichment Research — beyond OE + CitoAPI

_Researched Jul 2026. Goal: close the advanced-stats gap vs tabesports.gg / gol.gg
as a solo developer (no GRID / Bayes partnership possible)._

## Where we stand

| Source | What it gives us today | What it lacks |
| --- | --- | --- |
| Oracle's Elixir CSVs | Box scores, GD/CSD/XPD@10-25, dpm, vision, objectives, sides, patches | No item builds, runes, skill orders, minute-by-minute curves, draft order |
| CitoAPI | Schedule, some gold/objective timelines, brackets | Coverage is spotty; timelines missing for many games |
| gol.gg gold cache | Per-game gold curves (scraped snapshots) | Fragile, partial |

Sites like tabesports and gol.gg are built on the same public upstream we can
reach; the difference is they aggressively use the **Live Stats feed** and
**Leaguepedia** to enrich box scores. Nothing they display requires GRID.

## Recommended sources, in priority order

### 1. LoL Esports Live Stats API — the big win

`https://feed.lolesports.com/livestats/v1/window/{gameId}` and
`/details/{gameId}` (docs: [vickz84259.github.io/lolesports-api-docs](https://vickz84259.github.io/lolesports-api-docs/)).
Verified still working as of Jul 2026. Unofficial but stable for years, and the
same feed lolesports.com itself uses (public `x-api-key` for the persisted
gateway, none needed for livestats).

Every game streamed on lolesports.com has **10-second frames**, and completed
games remain fetchable (request a `startingTime` past game end for final
frames, or page through the whole game for full curves):

- `window`: per-team gold, kills, towers, inhibs, barons, dragon types taken;
  per-participant gold, level, kills/deaths/assists, CS, current health.
- `details`: per-participant `totalGoldEarned`, `killParticipation`,
  `championDamageShare`, `wardsPlaced`, `wardsDestroyed`, full combat stats
  (AD/AP/AS/lifesteal/armor/MR/tenacity), **items**, **rune pages
  (`perkMetadata`)**, and **skill-up order (`abilities`)**.

What this unlocks for nucky.gg:

- Real minute-by-minute gold/kill curves for every game (replaces the
  cito/gol.gg patchwork in `TeamGoldGraph` / `SeriesGamePanel`).
- Item builds and rune pages per player per game (tabesports "Builds" section).
- Skill orders, damage share over time, objective timings for model features.

Integration sketch: nightly script maps OE games → lolesports `gameId` via the
persisted gateway (`getSchedule` / `getCompletedEvents` / `getEventDetails`,
match on date + teams + game number), then pulls final-frame `details` +
sampled `window` frames into `public/data/livestats/{gameId}.json` (or
Supabase). Backfill 2026 first, then extend as far as VODs exist.

Caveats: undocumented, could change without notice; be a polite consumer
(cache everything, low request rate, backoff). Coverage limited to games
actually broadcast on lolesports.com (fine for tier-1).

### 2. Leaguepedia Cargo API — draft order, rosters, metadata

`https://lol.fandom.com/api.php?action=cargoquery` over tables like
`ScoreboardGames`, `ScoreboardPlayers`, `PicksAndBansS7`, `Tournaments`,
`TournamentRosters`, `RosterChanges`, `Players`, `MatchScheduleGame`.

What it adds:

- **Pick/ban order** (`PicksAndBansS7`): true draft sequence per game — we
  currently only have unordered picks/bans from OE. Enables draft-flow visuals
  and draft-order model features.
- Player profiles (photo, country, birthday), contracts, roster changes —
  richer identity pages.
- Tournament metadata (formats, prize pools, dates) to harden
  `tournamentCatalog` / `tournamentFormat` instead of hand-maintaining EWC etc.
- `MatchScheduleGame` carries match-history URLs + game hashes (needed if we
  ever touch ACS).

Caveats: strict rate limits on Fandom (bursts throttle fast; ~1 req/min when
unauthenticated is commonly reported). Strategy: authenticated bot account,
one nightly batched sync, cache to repo/Supabase. Libraries: `poro` (TS) or
`leaguepedia_parser`/`meeps` (Python) map cleanly onto our Python ingest.

### 3. Data Dragon / Community Dragon — free static assets

Needed the moment we render builds/runes from livestats: item icons, rune
icons, champion spell icons, patch-versioned. Official, unlimited, CDN-hosted.
No scraping concerns.

### 4. Riot ACS (acs.leagueoflegends.com) — optional, fragile

Full Match-V5-style stats + timelines for tournament-realm games
(`/v1/stats/game/{realm}/{gameId}?gameHash=…`, hash from Leaguepedia). Richest
data available (positions, full event streams) but: requires a login cookie,
heavily rate limited, unofficial, and widely expected to be shut down in favor
of the LDP. Treat as a bonus backfill experiment, not a pipeline dependency.

### 5. LoL Esports Data Portal (LDP) — watch closely

Riot + Bayes's official portal already powers Leaguepedia and Oracle's Elixir.
Community/individual access "for research purposes" has been promised and is
still "in the works" as of Jul 2026. When the community rollout lands, this
becomes the **official, sustainable** replacement for #1/#4 — match history,
replays, and telemetry. Action: subscribe to the LoL Esports dev diary /
`riotesportsdata.com` updates and apply on day one.

## Not recommended

- **Scraping gol.gg / tabesports directly**: brittle, ToS-hostile, and they're
  downstream of the same sources above anyway (we already treat our gol.gg
  gold cache as legacy).
- **Bayes Esports / GRID direct**: commercial contracts, registered-business
  requirement — same blocker as GRID.

## Risk note

nucky.gg has a paid tier, so "non-commercial" carve-outs don't cleanly apply
to us. The livestats/persisted endpoints are the same ones every community
site uses, but they are unofficial: keep request volume low, cache
aggressively, degrade gracefully if an endpoint disappears, and prefer the LDP
the moment it opens.

## Suggested order of work

1. `scripts/lolesports_map.py`: build OE gameId ↔ lolesports gameId mapping
   (persisted gateway schedule/events). Verify match rate on 2026 data.
2. `scripts/fetch_livestats.py`: nightly final-frame `details` + curve
   `window` pulls for newly ingested games; publish per-game JSON.
3. Frontend: item/rune/skill-order panels on series game pages; native gold
   curves; retire gol.gg cache.
4. Leaguepedia nightly sync for pick/ban order + tournament metadata.
5. Feed new features (draft order, objective timings, damage curves) into the
   model's feature mart.
