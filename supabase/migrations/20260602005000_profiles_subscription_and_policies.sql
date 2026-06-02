alter table public.profiles
  add column if not exists is_subscribed boolean not null default false,
  add column if not exists plan text not null default 'free';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'username', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set
      username = coalesce(excluded.username, public.profiles.username),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute procedure public.handle_new_user();
  end if;
end
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conversations'
      and policyname = 'Users read own conversations'
  ) then
    create policy "Users read own conversations"
      on public.conversations
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conversations'
      and policyname = 'Users insert own conversations'
  ) then
    create policy "Users insert own conversations"
      on public.conversations
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conversations'
      and policyname = 'Users update own conversations'
  ) then
    create policy "Users update own conversations"
      on public.conversations
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conversations'
      and policyname = 'Users delete own conversations'
  ) then
    create policy "Users delete own conversations"
      on public.conversations
      for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Users read own messages'
  ) then
    create policy "Users read own messages"
      on public.messages
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Users insert own messages'
  ) then
    create policy "Users insert own messages"
      on public.messages
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Users update own messages'
  ) then
    create policy "Users update own messages"
      on public.messages
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Users delete own messages'
  ) then
    create policy "Users delete own messages"
      on public.messages
      for delete
      using (auth.uid() = user_id);
  end if;
end
$$;
