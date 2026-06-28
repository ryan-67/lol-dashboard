-- Monthly token usage for nuckyAI (1M tokens/month beta limit).

CREATE TABLE IF NOT EXISTS public.agent_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address text NOT NULL DEFAULT 'unknown',
  tokens_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_usage_events
  ADD COLUMN IF NOT EXISTS tokens_used integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS agent_usage_events_user_month_idx
  ON public.agent_usage_events (user_id, created_at DESC);

ALTER TABLE public.agent_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_usage_events_service_insert ON public.agent_usage_events;
CREATE POLICY agent_usage_events_service_insert
  ON public.agent_usage_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_my_agent_usage()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  month_start timestamptz;
  month_end timestamptz;
  used bigint;
  token_limit constant integer := 1000000;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  month_start := date_trunc('month', now() AT TIME ZONE 'UTC');
  month_end := month_start + interval '1 month';

  SELECT coalesce(sum(tokens_used), 0)::bigint INTO used
  FROM agent_usage_events
  WHERE user_id = uid
    AND created_at >= month_start
    AND created_at < month_end;

  RETURN json_build_object(
    'tokens_used', used,
    'tokens_limit', token_limit,
    'period_start', month_start,
    'period_end', month_end,
    'reset_at', month_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_agent_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_agent_usage() TO authenticated;
