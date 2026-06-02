create or replace function public.execute_sql(query text, row_limit int default 50)
returns setof json
language plpgsql
security definer
as $$
declare
  q_trim text;
  q_lower text;
  blocked_tokens text[] := array[
    'drop',
    'delete',
    'update',
    'insert',
    'alter',
    'truncate',
    'grant',
    'revoke',
    'union',
    'exec',
    'xp_',
    'sp_',
    'information_schema',
    'pg_catalog',
    '--',
    '/*'
  ];
  token text;
  payload json;
begin
  q_trim := ltrim(coalesce(query, ''));
  q_lower := lower(q_trim);

  if q_trim = '' then
    raise exception 'execute_sql validation failed: query is empty';
  end if;

  if left(q_lower, 6) <> 'select' then
    raise exception 'execute_sql validation failed: only SELECT statements are allowed';
  end if;

  foreach token in array blocked_tokens loop
    if position(token in q_lower) > 0 then
      raise exception 'execute_sql validation failed: blocked token detected (%)', token;
    end if;
  end loop;

  if row_limit is null or row_limit <= 0 then
    row_limit := 50;
  end if;

  execute format('select json_agg(t) from (%s limit %L) t', q_trim, row_limit)
    into payload;

  if payload is null then
    payload := '[]'::json;
  end if;

  return next payload;
  return;
end;
$$;

grant execute on function public.execute_sql(text, int) to anon;
grant execute on function public.execute_sql(text, int) to authenticated;
