-- V4 Riot GW + Live Stats warehouse (Current SoR) — docs/nucky_v4.md §15.
-- Apply in Supabase SQL editor (or via db push). Safe to re-run.
--
-- NOTE: the warehouse deliberately reuses existing tables — Cito was a thin
-- wrapper over Riot GW and shares the same `lol-match-{id}` / `lol-game-{id}`
-- key space, so the Riot ingest upserts:
--   * schedules + series scores → public.cito_schedules   (20260801120000)
--   * per-player box scores     → public.cito_player_game_stats (20260801140000)
-- Only a watermark table is new.

create table if not exists public.riot_sync_state (
  id text primary key default 'default',
  last_completed_at timestamptz,
  last_completed_match_id text,
  completed_fingerprint text,
  last_ingested_game_id text,
  new_games_last_run integer,
  last_checked_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.riot_sync_state enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.riot_sync_state to service_role;
grant all on table public.riot_sync_state to postgres;

comment on table public.riot_sync_state is
  'Watermark for Riot GW + Live Stats warehouse ingest (refresh-data.yml primary trigger).';
