create table if not exists public.agent_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ip_address text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_usage_events_user_created_idx
  on public.agent_usage_events (user_id, created_at desc);

create index if not exists agent_usage_events_ip_created_idx
  on public.agent_usage_events (ip_address, created_at desc);
