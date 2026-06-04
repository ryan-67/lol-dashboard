-- Structured tier-1 match schedules (Liquipedia / Riot esports feeds)
create table if not exists public.esports_schedules (
  id uuid primary key default gen_random_uuid(),
  league text not null,
  split text not null default '',
  team_a text not null,
  team_b text not null,
  scheduled_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'live', 'tbd')),
  score text,
  source text not null default 'liquipedia',
  source_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (league, split, team_a, team_b, scheduled_at, source_url)
);

create index if not exists esports_schedules_league_split_idx
  on public.esports_schedules (league, split, scheduled_at);

alter table public.esports_schedules enable row level security;

grant select on public.esports_schedules to authenticated, anon;
grant select, insert, update, delete on public.esports_schedules to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'esports_schedules' and policyname = 'Public read schedules'
  ) then
    create policy "Public read schedules"
      on public.esports_schedules
      for select
      to authenticated, anon
      using (true);
  end if;
end $$;

-- Richer vector search: optional metadata kind filter + higher default count
create or replace function public.match_documents(
  query_embedding extensions.vector(1536),
  match_count int default 10,
  filter_source text default null,
  filter_kind text default null
)
returns table (
  id uuid,
  content text,
  source text,
  source_url text,
  title text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    d.id,
    d.content,
    d.source,
    d.source_url,
    d.title,
    d.metadata,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where d.embedding is not null
    and (filter_source is null or d.source = filter_source)
    and (filter_kind is null or d.metadata->>'content_kind' = filter_kind)
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_documents(extensions.vector, int, text, text) to service_role;
