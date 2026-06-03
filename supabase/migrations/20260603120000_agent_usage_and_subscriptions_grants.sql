-- agent_usage_events: edge function uses service_role for rate limits
grant select, insert on table public.agent_usage_events to service_role;

-- subscriptions: authenticated clients read own row via RLS
grant select on table public.subscriptions to authenticated;
