-- Stripe billing: allow edge functions (service_role) to update profiles + RPC fallback.
-- Apply in Supabase SQL editor or: npx supabase db query --linked -f supabase/migrations/billing_profiles_grants.sql
-- Safe to re-run.

grant usage on schema public to service_role;

-- Direct table access for stripe-webhook / stripe-sync upserts.
grant select, insert, update on table public.profiles to service_role;

-- subscriptions may already be writable; ensure grants exist.
do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'subscriptions'
  ) then
    execute 'grant select, insert, update on table public.subscriptions to service_role';
  end if;
end $$;

-- SECURITY DEFINER helper — updates profiles even when table grants are misconfigured.
create or replace function public.set_profile_subscription(
  p_user_id uuid,
  p_is_subscribed boolean,
  p_plan text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_plan is null or p_plan not in ('free', 'pro') then
    raise exception 'invalid plan: %', p_plan;
  end if;

  insert into public.profiles (id, is_subscribed, plan)
  values (p_user_id, p_is_subscribed, p_plan)
  on conflict (id) do update
  set is_subscribed = excluded.is_subscribed,
      plan = excluded.plan;
end;
$$;

revoke all on function public.set_profile_subscription(uuid, boolean, text) from public;
grant execute on function public.set_profile_subscription(uuid, boolean, text) to service_role;

comment on function public.set_profile_subscription(uuid, boolean, text) is
  'Called by Stripe edge functions to set profiles.is_subscribed and profiles.plan after checkout.';
