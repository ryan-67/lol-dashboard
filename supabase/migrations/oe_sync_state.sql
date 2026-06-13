-- Tracks Oracle's Elixir Google Drive CSV metadata so CI can skip no-op refreshes.
-- Apply in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / IF NOT EXISTS column / GRANT).

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

alter table public.oe_sync_state add column if not exists latest_game_date text;

alter table public.oe_sync_state enable row level security;

-- GitHub Actions uses SUPABASE_SERVICE_ROLE_KEY — grants are required even though
-- service_role bypasses RLS. Re-run this block if you see "permission denied for table oe_sync_state".
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.oe_sync_state to service_role;

-- Belt-and-suspenders if the table was created without the grants above.
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'oe_sync_state'
  ) then
    execute 'grant select, insert, update, delete on table public.oe_sync_state to service_role';
  end if;
end $$;

grant all on table public.oe_sync_state to postgres;

comment on table public.oe_sync_state is
  'OE Drive CSV metadata for refresh polling; service role only.';

comment on column public.oe_sync_state.modified_time is
  'Google Drive modifiedTime when we last confirmed the CSV (ISO 8601).';

comment on column public.oe_sync_state.latest_game_date is
  'Latest OE match date (YYYY-MM-DD) in the ingested current-year CSV.';

comment on column public.oe_sync_state.last_ingested_at is
  'When we last successfully downloaded, ingested, and seeded Supabase.';
