# CitoAPI — viability for nucky.gg

Research date: 2026-06-24. Sources: [CitoAPI LoL docs](https://citoapi.com/docs/api/league-of-legends/), [pricing](https://citoapi.com/pricing/), [webhooks](https://citoapi.com/docs/webhooks/).

## Summary

**CitoAPI is a viable complement to Oracle's Elixir** for gaps nucky.gg cannot fill from OE CSV alone — especially **full-game gold timelines**, **live match state**, and **postgame objective/plate detail**. The **$50/mo Pro plan** (250k calls/mo, webhooks, 90-day history) is reasonable for a solo analytics dashboard at current scale, provided we cache postgame payloads and use webhooks for live rather than aggressive polling.

GRID remains unavailable (business-entity requirement); CitoAPI is the most practical alternative for live + enriched postgame without a sales-led contract.

## What nucky.gg is missing today (OE gaps)

| Gap | OE today | CitoAPI |
| --- | --- | --- |
| Full gold diff timeline | Only spot stats (e.g. GD@15); team gold graphs are approximate | `GET /api/v1/lol/games/{gameId}/postgame` — gold graph, timeline, plates |
| Turret plates | Partial / inferred | Postgame payload includes plate data |
| Jungle camps stolen | Not in OE shards | Postgame / live state fields (verify per payload) |
| Objectives stolen | Limited | Live `lol.live.objective` + postgame |
| LPL missing stats | OE coverage gaps (e.g. playoff game count vs gol.gg) | Independent esports feed; may cover events OE lacks |
| Live match hub | No push feed | Webhooks: `lol.live.state`, `lol.live.gold_swing`, `lol.match.completed` |

## Recommended plan

| Tier | Price | Fit for nucky.gg |
| --- | --- | --- |
| Free | $0 | Schema exploration only (500 calls/mo) |
| One Game Starter | ~$10–25/mo | LoL-only + webhooks if we ship live hub first |
| **Pro** | **$50/mo** | **Recommended** — all games, 250k calls/mo, webhooks, 90-day history |

At nucky.gg traffic, 250k monthly calls is ample if we:

1. Fetch postgame **once per completed game** and store in Supabase.
2. Use **webhooks** for live hub (not 1 Hz REST polling).
3. Keep OE as the **canonical stats backbone** for historical aggregates.

## Integration sketch

```
OE ingest (batch) ──► Supabase oe_slices (players, teams, drafts)
                           │
CitoAPI postgame ──► game_timelines table (gold graph, plates, objectives)
                           │
Live webhooks ────► live_match_state (optional Phase 2 live hub)
```

### Endpoints to prioritize

- `GET /api/v1/lol/games/{gameId}/postgame` — backfill gold graphs for series/team pages
- Webhook `lol.match.completed` — trigger postgame fetch + series recap generation
- Webhook `lol.live.state` / `lol.live.gold_swing` — live hub v2

### Mapping game IDs

OE `gameid` may differ from Cito `gameId`. We will need a **match linkage table** (date, league, teams, game index → cito_game_id), built from schedule/postgame metadata or fuzzy match on teams + timestamp.

## Risks / caveats

1. **Dual source of truth** — OE and Cito may disagree; document provenance in UI.
2. **Historical depth** — Pro tier is 90-day history; older gold graphs stay OE-limited unless we backfill during ingest.
3. **LPL completeness** — Verify Cito covers specific LPL splits before replacing OE counts.
4. **Cost creep** — Regenerating timelines for entire history could blow the monthly cap; scope to new games + user-requested series.

## Suggested rollout

1. **Phase A** — Pro API key, postgame fetch for new completed games, fix team gold graph component.
2. **Phase B** — `lol.match.completed` webhook → auto series recap + timeline ingest.
3. **Phase C** — Live match hub using `lol.live.state` + gold swing events.

## LLM recap budget (related)

Series recaps are generated via `scripts/recap/generate-weekly-recap.ts`:

- **One-time bulk:** `RECAP_PLAYOFFS_2026_SPRING=1` for 2026 Spring playoffs across all leagues.
- **Ongoing:** default job merges monthly hub window + series completed in the last 14 days (new series on conclusion after ingest).

This keeps historical LLM spend bounded while ensuring every new series gets a recap after OE ingest runs.
