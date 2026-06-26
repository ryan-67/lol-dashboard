# CitoAPI Phase 0

Phase 0 validates CitoAPI Pro connectivity, endpoint payload quality, OE↔Cito game linkage, and basic metric parity before dashboard enrichment (Phase 1).

## Prerequisites

1. `CITO_API_KEY` in root `.env`
2. Optional: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for bronze storage
3. Apply migration: `supabase/migrations/cito_phase0.sql` in Supabase SQL editor
4. Local OE shard: `public/data/oe_slices_2026.json` (run `npm run ingest`)

## Run validation

```bash
npm run validate:cito
```

Options:

- `--league lck` — single league
- `--samples 2` — completed matches per league (default 1)
- `--year 2026` — OE shard year for linkage
- `--no-store` — skip Supabase writes

## Outputs

- Report: `docs/cito/phase0-report.json`
- Supabase tables (when configured):
  - `cito_raw_payloads`
  - `cito_game_linkage`
  - `cito_validation_runs`

## Gate to Phase 1

Proceed when:

- postgame/gold endpoints return usable graphs for tier-1 samples
- linkage prototype works for overlapping OE dates (OE CSV lag may block recent playoffs)
- no critical API auth/rate-limit blockers

See full strategy in [`../CITOAPI.md`](../CITOAPI.md).

## Apply Supabase migration (required for storage)

Run the SQL in [`../../supabase/migrations/cito_phase0.sql`](../../supabase/migrations/cito_phase0.sql) via Supabase SQL editor, then re-run validation **without** `--no-store` to persist bronze payloads and linkage rows.
