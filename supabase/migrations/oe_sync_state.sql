-- Tracks Oracle's Elixir Google Drive CSV metadata so CI can skip no-op refreshes.
-- Apply once in Supabase SQL editor (or via CLI) before the polling workflow runs.

create table if not exists public.oe_sync_state (
  year text primary key,
  drive_file_id text not null,
  drive_file_name text not null,
  modified_time text not null,
  size_bytes bigint not null,
  md5_checksum text,
  latest_game_date text,
  last_checked_at timestamptz not null default now(),
  last_ingested_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.oe_sync_state enable row level security;

alter table public.oe_sync_state add column if not exists latest_game_date text;

-- Service role (used by GitHub Actions) bypasses RLS; no anon policies needed.
grant all on table public.oe_sync_state to service_role;

comment on table public.oe_sync_state is
  'OE Drive CSV metadata for refresh polling; service role only.';

comment on column public.oe_sync_state.modified_time is
  'Google Drive modifiedTime when we last confirmed the CSV (ISO 8601).';

comment on column public.oe_sync_state.latest_game_date is
  'Latest OE match date (YYYY-MM-DD) in the ingested current-year CSV.';

comment on column public.oe_sync_state.last_ingested_at is
  'When we last successfully downloaded, ingested, and seeded Supabase.';
