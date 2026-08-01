-- Cito match player box scores for recaps + current ML refresh (no OE wait).
-- Apply in Supabase SQL editor. Safe to re-run.

create table if not exists public.cito_player_game_stats (
  cito_game_id text not null,
  cito_match_id text not null,
  game_number integer,
  league text,
  game_date date,
  player_name text not null,
  team_name text,
  team_slug text,
  side text,
  role text,
  champion text,
  result integer,
  kills integer,
  deaths integer,
  assists integer,
  kda double precision,
  cs integer,
  gold integer,
  damage integer,
  dpm double precision,
  damage_share double precision,
  gold_share double precision,
  vision_score double precision,
  wards_placed integer,
  wards_destroyed integer,
  gd15 double precision,
  csd15 double precision,
  xpd15 double precision,
  gd25 double precision,
  game_length_minutes double precision,
  payload jsonb,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cito_game_id, player_name)
);

create index if not exists cito_player_game_stats_match_idx
  on public.cito_player_game_stats (cito_match_id, game_number);

create index if not exists cito_player_game_stats_date_idx
  on public.cito_player_game_stats (game_date desc);

alter table public.cito_player_game_stats enable row level security;

drop policy if exists cito_player_game_stats_select_authenticated on public.cito_player_game_stats;
create policy cito_player_game_stats_select_authenticated
  on public.cito_player_game_stats
  for select
  to authenticated
  using (true);

drop policy if exists cito_player_game_stats_select_anon on public.cito_player_game_stats;
create policy cito_player_game_stats_select_anon
  on public.cito_player_game_stats
  for select
  to anon
  using (true);

grant select on table public.cito_player_game_stats to anon, authenticated;
grant select, insert, update, delete on table public.cito_player_game_stats to service_role;
grant all on table public.cito_player_game_stats to postgres;

comment on table public.cito_player_game_stats is
  'Per-player box scores from Cito /lol/matches/{id}/player-stats for current recaps + ML.';
