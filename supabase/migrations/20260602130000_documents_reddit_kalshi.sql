-- Extend documents.source enum for Reddit + Kalshi RAG sources
alter table public.documents drop constraint if exists documents_source_check;

alter table public.documents add constraint documents_source_check
  check (source in ('liquipedia', 'patch_notes', 'reddit', 'kalshi'));
