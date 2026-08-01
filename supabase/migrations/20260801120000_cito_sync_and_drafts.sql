-- V3 Cito-primary sync watermark + live post-draft storage.
-- Apply in Supabase SQL editor (or via db push). Safe to re-run.

create table if not exists public.cito_sync_state (
  id text primary key default 'default',
  last_completed_at timestamptz,
  last_completed_match_id text,
  completed_fingerprint text,
  last_checked_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.cito_sync_state enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.cito_sync_state to service_role;
grant all on table public.cito_sync_state to postgres;

comment on table public.cito_sync_state is
  'Watermark for Cito tier-1 completed-series polling (refresh-data.yml primary trigger).';

create table if not exists public.cito_match_drafts (
  match_id text primary key,
  game_id text,
  game_number integer,
  league text,
  team_a text,
  team_b text,
  blue_team text,
  red_team text,
  blue_picks jsonb not null default '[]'::jsonb,
  red_picks jsonb not null default '[]'::jsonb,
  blue_bans jsonb not null default '[]'::jsonb,
  red_bans jsonb not null default '[]'::jsonb,
  draft_complete boolean not null default false,
  status text,
  scheduled_at timestamptz,
  payload jsonb,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cito_match_drafts_complete_idx
  on public.cito_match_drafts (draft_complete, scheduled_at desc);

alter table public.cito_match_drafts enable row level security;

-- Authenticated users can read draft-complete rows for Board / Predictions.
drop policy if exists cito_match_drafts_select_authenticated on public.cito_match_drafts;
create policy cito_match_drafts_select_authenticated
  on public.cito_match_drafts
  for select
  to authenticated
  using (true);

drop policy if exists cito_match_drafts_select_anon on public.cito_match_drafts;
create policy cito_match_drafts_select_anon
  on public.cito_match_drafts
  for select
  to anon
  using (draft_complete = true);

grant select on table public.cito_match_drafts to anon, authenticated;
grant select, insert, update, delete on table public.cito_match_drafts to service_role;
grant all on table public.cito_match_drafts to postgres;

comment on table public.cito_match_drafts is
  'Live post-draft snapshots from Cito /lol/analytics/drafts/{matchId} for Board + chat packets.';
