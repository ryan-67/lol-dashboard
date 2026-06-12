-- AI-generated weekly recap lines (one row per concluded series).
-- Written by scripts/recap/generate-weekly-recap.ts after OE refresh.

create table if not exists public.weekly_recap_lines (
  series_id text primary key,
  league text not null,
  series_date date not null,
  team_a text not null,
  team_b text not null,
  winner text not null,
  score text not null,
  segments jsonb not null,
  plain_text text not null,
  facts_json jsonb not null,
  rag_context text,
  model text,
  generated_at timestamptz not null default now()
);

create index if not exists weekly_recap_lines_date_idx
  on public.weekly_recap_lines (series_date desc);

create index if not exists weekly_recap_lines_league_date_idx
  on public.weekly_recap_lines (league, series_date desc);

alter table public.weekly_recap_lines enable row level security;

drop policy if exists "weekly_recap_public_read" on public.weekly_recap_lines;
create policy "weekly_recap_public_read"
  on public.weekly_recap_lines for select
  using (true);

grant select on table public.weekly_recap_lines to anon, authenticated;
grant select, insert, update, delete on table public.weekly_recap_lines to service_role;

comment on table public.weekly_recap_lines is
  'Cached weekly recap copy per series; generated server-side after OE ingest.';
