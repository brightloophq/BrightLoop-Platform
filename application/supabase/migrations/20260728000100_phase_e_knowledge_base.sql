-- =============================================================================
-- Phase E · Sprint E2 — Knowledge Base / RAG: collections, documents, versions,
-- chunks, embedding vectors + jobs, retrieval sessions + context, citations,
-- permissions, sources. ADDITIVE ONLY. Eleven new tables; internal-only RLS;
-- versions + retrieval sessions/context + citations are append-only. Embeddings
-- are stored as a jsonb float array (portable; a pgvector-native index is a future
-- backend behind the same port). pgvector is enabled for that future. No Phase A–E1
-- table is touched.
-- =============================================================================

-- Enable pgvector for future native similarity indexes (embeddings are jsonb today).
create extension if not exists vector;

-- ---- collection + permission + source ---------------------------------------
create table public.knowledge_collection (
  id             text primary key,
  workspace_id   text not null,
  client_id      text references public.clients (id) on delete cascade,
  name           text not null,
  description    text,
  kind           text not null check (kind in ('client', 'workspace', 'project', 'department', 'brand')),
  visibility     text not null default 'internal' check (visibility in ('private', 'shared', 'internal', 'external')),
  owner_user_id  text not null,
  document_count integer not null default 0 check (document_count >= 0),
  status         text not null default 'active' check (status in ('active', 'archived')),
  version        integer not null default 1 check (version > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index knowledge_collection_workspace_idx on public.knowledge_collection (workspace_id);
comment on table public.knowledge_collection is 'Phase E E2: a workspace-scoped knowledge collection.';

create table public.knowledge_permission (
  id            text primary key,
  collection_id text not null references public.knowledge_collection (id) on delete cascade,
  workspace_id  text not null,
  client_id     text references public.clients (id) on delete cascade,
  subject_type  text not null check (subject_type in ('user', 'role')),
  subject_id    text not null,
  level         text not null check (level in ('read', 'write', 'admin')),
  created_at    timestamptz not null default now(),
  unique (collection_id, subject_type, subject_id)
);
create index knowledge_permission_collection_idx on public.knowledge_permission (collection_id);
comment on table public.knowledge_permission is 'Phase E E2: an explicit access grant on a collection.';

create table public.knowledge_source (
  id            text primary key,
  collection_id text not null references public.knowledge_collection (id) on delete cascade,
  workspace_id  text not null,
  client_id     text references public.clients (id) on delete cascade,
  source_type   text not null check (source_type in ('pdf','docx','txt','markdown','html','csv','google_docs','notion','confluence','email','slack')),
  label         text not null,
  config        jsonb not null default '{}'::jsonb,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index knowledge_source_collection_idx on public.knowledge_source (collection_id);
comment on table public.knowledge_source is 'Phase E E2: an ingestion source bound to a collection. Connector creds are env-only.';

-- ---- document + version (append-only) ---------------------------------------
create table public.knowledge_document (
  id              text primary key,
  collection_id   text not null references public.knowledge_collection (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  title           text not null,
  source_type     text not null check (source_type in ('pdf','docx','txt','markdown','html','csv','google_docs','notion','confluence','email','slack')),
  mime_type       text not null,
  language        text,
  size_bytes      integer not null default 0 check (size_bytes >= 0),
  checksum        text not null,
  status          text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  current_version integer not null default 1 check (current_version > 0),
  owner_user_id   text not null,
  metadata        jsonb not null default '{}'::jsonb,
  version         integer not null default 1 check (version > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index knowledge_document_collection_idx on public.knowledge_document (collection_id);
create index knowledge_document_workspace_idx on public.knowledge_document (workspace_id);
comment on table public.knowledge_document is 'Phase E E2: a knowledge document with soft-delete lifecycle + versioning.';

create table public.document_version (
  id                 text primary key,
  document_id        text not null references public.knowledge_document (id) on delete cascade,
  workspace_id       text not null,
  client_id          text references public.clients (id) on delete cascade,
  version            integer not null check (version > 0),
  checksum           text not null,
  size_bytes         integer not null default 0 check (size_bytes >= 0),
  mime_type          text not null,
  storage_ref        text,
  parse_status       text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed')),
  parse_metadata     jsonb not null default '{}'::jsonb,
  created_by_user_id text not null,
  created_at         timestamptz not null default now(),
  unique (document_id, version)
);
create index document_version_document_idx on public.document_version (document_id);
comment on table public.document_version is 'Phase E E2: an immutable document snapshot. Uploads/replacements append.';

-- ---- chunk + vector (insert/delete on reindex) ------------------------------
create table public.document_chunk (
  id               text primary key,
  document_id      text not null references public.knowledge_document (id) on delete cascade,
  document_version integer not null check (document_version > 0),
  collection_id    text not null references public.knowledge_collection (id) on delete cascade,
  workspace_id     text not null,
  client_id        text references public.clients (id) on delete cascade,
  index            integer not null check (index >= 0),
  content          text not null,
  page             integer check (page >= 0),
  heading          text,
  token_count      integer not null default 0 check (token_count >= 0),
  checksum         text not null,
  strategy         text not null check (strategy in ('fixed', 'semantic', 'heading_aware', 'paragraph_aware')),
  created_at       timestamptz not null default now()
);
create index document_chunk_document_idx on public.document_chunk (document_id, index);
create index document_chunk_workspace_idx on public.document_chunk (workspace_id);
comment on table public.document_chunk is 'Phase E E2: a normalized text chunk of a document version.';

create table public.embedding_vector (
  id            text primary key,
  chunk_id      text not null references public.document_chunk (id) on delete cascade,
  document_id   text not null references public.knowledge_document (id) on delete cascade,
  collection_id text not null references public.knowledge_collection (id) on delete cascade,
  workspace_id  text not null,
  client_id     text references public.clients (id) on delete cascade,
  provider      text not null check (provider in ('openai', 'gemini', 'local')),
  model         text not null,
  dimensions    integer not null check (dimensions > 0),
  embedding     jsonb not null,
  created_at    timestamptz not null default now()
);
create index embedding_vector_workspace_idx on public.embedding_vector (workspace_id);
create index embedding_vector_collection_idx on public.embedding_vector (collection_id);
create index embedding_vector_document_idx on public.embedding_vector (document_id);
comment on table public.embedding_vector is 'Phase E E2: a chunk embedding (jsonb float array). Workspace-scoped; never crosses tenants.';

-- ---- embedding job ----------------------------------------------------------
create table public.embedding_job (
  id               text primary key,
  document_id      text not null references public.knowledge_document (id) on delete cascade,
  document_version integer not null check (document_version > 0),
  collection_id    text not null references public.knowledge_collection (id) on delete cascade,
  workspace_id     text not null,
  client_id        text references public.clients (id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'reindex')),
  provider         text not null check (provider in ('openai', 'gemini', 'local')),
  model            text not null,
  strategy         text not null default 'paragraph_aware' check (strategy in ('fixed', 'semantic', 'heading_aware', 'paragraph_aware')),
  chunk_count      integer not null default 0 check (chunk_count >= 0),
  retry_count      integer not null default 0 check (retry_count >= 0),
  duration_ms      integer not null default 0 check (duration_ms >= 0),
  cost             double precision not null default 0 check (cost >= 0),
  currency         text not null default 'USD',
  error            text,
  version          integer not null default 1 check (version > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index embedding_job_workspace_idx on public.embedding_job (workspace_id, created_at desc);
comment on table public.embedding_job is 'Phase E E2: an embedding/indexing job with retry + cost tracking.';

-- ---- retrieval session + context + citation (append-only) -------------------
create table public.retrieval_session (
  id                   text primary key,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  query                text not null,
  collection_ids       jsonb not null default '[]'::jsonb,
  top_k                integer not null default 8 check (top_k > 0),
  threshold            double precision not null default 0,
  max_tokens           integer not null default 4000 check (max_tokens > 0),
  provider             text not null check (provider in ('openai', 'gemini', 'local')),
  model                text not null,
  result_count         integer not null default 0 check (result_count >= 0),
  latency_ms           integer not null default 0 check (latency_ms >= 0),
  cache_hit            boolean not null default false,
  requested_by_user_id text not null,
  created_at           timestamptz not null default now()
);
create index retrieval_session_workspace_idx on public.retrieval_session (workspace_id, created_at desc);
comment on table public.retrieval_session is 'Phase E E2: an immutable retrieval query record (observability).';

create table public.retrieved_context (
  id            text primary key,
  session_id    text not null references public.retrieval_session (id) on delete cascade,
  chunk_id      text not null,
  document_id   text not null,
  collection_id text not null,
  workspace_id  text not null,
  client_id     text references public.clients (id) on delete cascade,
  score         double precision not null,
  rank          integer not null check (rank >= 0),
  token_count   integer not null default 0 check (token_count >= 0),
  content       text not null,
  created_at    timestamptz not null default now()
);
create index retrieved_context_session_idx on public.retrieved_context (session_id, rank);
comment on table public.retrieved_context is 'Phase E E2: an immutable retrieved chunk for a session.';

create table public.citation (
  id            text primary key,
  session_id    text not null references public.retrieval_session (id) on delete cascade,
  chunk_id      text not null,
  document_id   text not null,
  collection_id text not null,
  workspace_id  text not null,
  client_id     text references public.clients (id) on delete cascade,
  page          integer check (page >= 0),
  heading       text,
  source_type   text not null check (source_type in ('pdf','docx','txt','markdown','html','csv','google_docs','notion','confluence','email','slack')),
  score         double precision not null,
  created_at    timestamptz not null default now()
);
create index citation_session_idx on public.citation (session_id);
create index citation_workspace_idx on public.citation (workspace_id, created_at desc);
comment on table public.citation is 'Phase E E2: an immutable citation derived from retrieved context.';

-- ---- append-only enforcement ------------------------------------------------
create trigger document_version_no_mutation before update or delete on public.document_version for each row execute function public.bl_txexec_append_only();
create trigger retrieval_session_no_mutation before update or delete on public.retrieval_session for each row execute function public.bl_txexec_append_only();
create trigger retrieved_context_no_mutation before update or delete on public.retrieved_context for each row execute function public.bl_txexec_append_only();
create trigger citation_no_mutation before update or delete on public.citation for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants (internal-only) -------------------------------------------
alter table public.knowledge_collection enable row level security;
alter table public.knowledge_permission enable row level security;
alter table public.knowledge_source enable row level security;
alter table public.knowledge_document enable row level security;
alter table public.document_version enable row level security;
alter table public.document_chunk enable row level security;
alter table public.embedding_vector enable row level security;
alter table public.embedding_job enable row level security;
alter table public.retrieval_session enable row level security;
alter table public.retrieved_context enable row level security;
alter table public.citation enable row level security;

-- mutable / insert-delete tables: full internal access.
create policy "knowledge_collection_internal_all" on public.knowledge_collection for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "knowledge_permission_internal_all" on public.knowledge_permission for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "knowledge_source_internal_all" on public.knowledge_source for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "knowledge_document_internal_all" on public.knowledge_document for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "document_chunk_internal_all" on public.document_chunk for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "embedding_vector_internal_all" on public.embedding_vector for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "embedding_job_internal_all" on public.embedding_job for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- append-only tables: SELECT + INSERT only.
create policy "document_version_internal_read" on public.document_version for select to authenticated using (public.bl_is_internal());
create policy "document_version_internal_insert" on public.document_version for insert to authenticated with check (public.bl_is_internal());
create policy "retrieval_session_internal_read" on public.retrieval_session for select to authenticated using (public.bl_is_internal());
create policy "retrieval_session_internal_insert" on public.retrieval_session for insert to authenticated with check (public.bl_is_internal());
create policy "retrieved_context_internal_read" on public.retrieved_context for select to authenticated using (public.bl_is_internal());
create policy "retrieved_context_internal_insert" on public.retrieved_context for insert to authenticated with check (public.bl_is_internal());
create policy "citation_internal_read" on public.citation for select to authenticated using (public.bl_is_internal());
create policy "citation_internal_insert" on public.citation for insert to authenticated with check (public.bl_is_internal());

grant select, insert, update, delete on public.knowledge_collection to authenticated;
grant select, insert, update, delete on public.knowledge_permission to authenticated;
grant select, insert, update, delete on public.knowledge_source to authenticated;
grant select, insert, update, delete on public.knowledge_document to authenticated;
grant select, insert, delete on public.document_chunk to authenticated;         -- no update
grant select, insert, delete on public.embedding_vector to authenticated;       -- no update
grant select, insert, update, delete on public.embedding_job to authenticated;
grant select, insert on public.document_version to authenticated;               -- append-only
grant select, insert on public.retrieval_session to authenticated;              -- append-only
grant select, insert on public.retrieved_context to authenticated;              -- append-only
grant select, insert on public.citation to authenticated;                       -- append-only
grant all on public.knowledge_collection to service_role;
grant all on public.knowledge_permission to service_role;
grant all on public.knowledge_source to service_role;
grant all on public.knowledge_document to service_role;
grant select, insert, delete on public.document_chunk to service_role;
grant select, insert, delete on public.embedding_vector to service_role;
grant all on public.embedding_job to service_role;
grant select, insert on public.document_version to service_role;
grant select, insert on public.retrieval_session to service_role;
grant select, insert on public.retrieved_context to service_role;
grant select, insert on public.citation to service_role;
