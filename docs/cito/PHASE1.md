# CitoAPI Phase 1 — Postgame gold timelines

Phase 1 ingests CitoAPI **postgame gold graphs** into Supabase and uses them on team **Gold** tabs instead of the OE gd@15 linear proxy when a match is linked.

## Prerequisites

1. Phase 0 complete (`npm run validate:cito`, `passed: true` in `cito_validation_runs`)
2. Apply migrations in order:
   - `supabase/migrations/cito_phase0.sql`
   - `supabase/migrations/cito_phase1_gold.sql`
3. Env: `CITO_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env`

## Sync postgame gold

```bash
npm run sync:cito-postgame
```

Options:

- `--league lck` — single league
- `--max-matches 15` — completed matches per league (default 15)
- `--days 60` — lookback window (default 60)
- `--year 2026` — OE shard year for oe_game_id linkage

The sync script:

- Fetches recent tier-1 completed matches (LCK, LPL, LEC, LCS)
- Calls `/lol/games/{gameId}/postgame` for games not already in `cito_game_gold`
- Normalizes `goldGraph` → `{minute, goldDiffBlue}` JSON
- Attempts OE linkage when local OE shard is available

## Frontend behavior

On a team page **Gold** tab:

1. Loads matching rows from `cito_game_gold` (by `oe_game_id` or date + teams)
2. Prefers Cito timelines when ≥4 points exist
3. Falls back to OE gd@15 proxy for unmatched games
4. Chart subtitle shows Cito vs proxy coverage

## CI

`Refresh Dashboard Data` runs `sync:cito-postgame` after weekly recaps when `CITO_API_KEY` is set (`continue-on-error: true`).

## Tables

| Table | Purpose |
|-------|---------|
| `cito_game_gold` | Normalized per-game gold timelines (public read) |
| `cito_raw_payloads` | Bronze postgame JSON (Phase 0) |
| `cito_game_linkage` | OE ↔ Cito game mapping |

See full roadmap in [`../CITOAPI.md`](../CITOAPI.md).
