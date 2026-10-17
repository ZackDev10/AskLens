-- AskLens · migration 001 · tables, indexes, security
-- Run in the Supabase SQL editor (or psql). Safe to re-run.

-- pgvector lives in the "extensions" schema on Supabase
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------
-- documents: one row per uploaded file
-- ---------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  title         text        not null,
  source_type   text        not null check (source_type in ('pdf', 'docx', 'txt', 'url')),
  source_uri    text,                         -- original filename or URL
  file_hash     text        not null,         -- sha256 of the file, used for de-duplication
  language      text,                         -- 'en', 'fr', 'ar', ...
  page_count    int,
  chunk_count   int         not null default 0,
  status        text        not null default 'processing'
                            check (status in ('processing', 'ready', 'failed')),
  error         text,
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create unique index if not exists documents_file_hash_key on public.documents (file_hash);

-- ---------------------------------------------------------------
-- chunks: the searchable pieces of each document
-- ---------------------------------------------------------------
-- vector(1536) matches OpenAI text-embedding-3-small.
-- If you change the embedding model, change this number everywhere
-- (here, in hybrid_search, and EMBEDDING_DIM in .env).
create table if not exists public.chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid        not null references public.documents (id) on delete cascade,
  chunk_index  int         not null,
  page_number  int,                            -- null for formats without pages
  content      text        not null,
  char_count   int         not null,
  metadata     jsonb       not null default '{}'::jsonb,
  embedding    vector(1536) not null,
  -- 'simple' = no stemming and no stop words, so it behaves the same
  -- for English, French and Arabic text
  fts          tsvector generated always as (to_tsvector('simple', content)) stored,
  created_at   timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists chunks_document_id_idx on public.chunks (document_id);
create index if not exists chunks_fts_idx         on public.chunks using gin (fts);
create index if not exists chunks_embedding_idx   on public.chunks using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------
-- Security: only the backend (service role key) may touch these tables.
-- RLS on + no policies = the public anon key can read/write nothing.
-- NEVER ship the service role key inside the mobile app.
-- ---------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.chunks    enable row level security;
