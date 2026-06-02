-- RAG documents for analyst agent (Part 2 indexer)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding extensions.vector(1536),
  source text not null check (source in ('liquipedia', 'patch_notes')),
  source_url text not null,
  chunk_index int not null,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_url, chunk_index)
);

create index if not exists documents_source_idx on public.documents (source);
create index if not exists documents_source_url_idx on public.documents (source_url);
create index if not exists documents_embedding_idx
  on public.documents
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.documents enable row level security;

grant select, insert, update, delete on public.documents to service_role;

create or replace function public.match_documents(
  query_embedding extensions.vector(1536),
  match_count int default 8,
  filter_source text default null
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
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_documents to service_role;
