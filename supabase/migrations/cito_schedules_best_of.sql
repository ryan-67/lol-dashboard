-- Persist Cito best-of (Bo1/Bo3/Bo5) for series grouping / recap gating.

alter table public.cito_schedules
  add column if not exists best_of integer;

comment on column public.cito_schedules.best_of is
  'Series length from Cito strategy (1/3/5). Null when upstream omits strategy.';
