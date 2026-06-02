alter table public.profiles
  add column if not exists favorite_player text,
  add column if not exists favorite_team text;
