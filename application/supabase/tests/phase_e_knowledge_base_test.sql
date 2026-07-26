-- =============================================================================
-- pgTAP · Phase E · E2 — Knowledge Base tables.
-- Existence + RLS + checks + unique constraints + optimistic concurrency +
-- append-only (versions/sessions/context/citations) + tenant isolation.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_kb', 'KB Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_kb_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'knowledge_collection', 'collection table exists');
select has_table('public', 'knowledge_document', 'document table exists');
select has_table('public', 'document_version', 'version table exists');
select has_table('public', 'document_chunk', 'chunk table exists');
select has_table('public', 'embedding_vector', 'vector table exists');
select has_table('public', 'embedding_job', 'job table exists');
select has_table('public', 'retrieval_session', 'session table exists');
select has_table('public', 'retrieved_context', 'context table exists');
select has_table('public', 'citation', 'citation table exists');
select has_table('public', 'knowledge_permission', 'permission table exists');
select has_table('public', 'knowledge_source', 'source table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.embedding_vector'::regclass), 'RLS on embedding vector');
select ok((select relrowsecurity from pg_class where oid = 'public.retrieval_session'::regclass), 'RLS on retrieval session');

-- seed as internal owner
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

-- collection + document + version (unique per version) + optimistic concurrency
select lives_ok($$ insert into public.knowledge_collection (id, workspace_id, client_id, name, kind, owner_user_id) values ('kc_1', 'ws_kb', 'cli_kb', 'Docs', 'workspace', 'u_int') $$, 'insert collection');
select throws_ok($$ insert into public.knowledge_collection (id, workspace_id, client_id, name, kind, owner_user_id) values ('kc_bad', 'ws_kb', 'cli_kb', 'X', 'nope', 'u_int') $$, '23514', null, 'invalid collection kind rejected');
select lives_ok($$ insert into public.knowledge_document (id, collection_id, workspace_id, client_id, title, source_type, mime_type, checksum, owner_user_id) values ('kd_1', 'kc_1', 'ws_kb', 'cli_kb', 'Guide', 'markdown', 'text/markdown', 'chk', 'u_int') $$, 'insert document');
select lives_ok($$ insert into public.document_version (id, document_id, workspace_id, client_id, version, checksum, mime_type, created_by_user_id) values ('dv_1', 'kd_1', 'ws_kb', 'cli_kb', 1, 'chk', 'text/markdown', 'u_int') $$, 'insert version 1');
select throws_ok($$ insert into public.document_version (id, document_id, workspace_id, client_id, version, checksum, mime_type, created_by_user_id) values ('dv_dup', 'kd_1', 'ws_kb', 'cli_kb', 1, 'chk', 'text/markdown', 'u_int') $$, '23505', null, 'duplicate document version rejected');
select lives_ok($$ update public.knowledge_document set status = 'archived', version = 2 where id = 'kd_1' and version = 1 $$, 'archive document v1→v2');
select throws_ok($$ insert into public.knowledge_document (id, collection_id, workspace_id, client_id, title, source_type, mime_type, checksum, owner_user_id, status) values ('kd_bad', 'kc_1', 'ws_kb', 'cli_kb', 'X', 'txt', 'text/plain', 'c', 'u_int', 'nope') $$, '23514', null, 'invalid document status rejected');

-- chunk + vector
select lives_ok($$ insert into public.document_chunk (id, document_id, document_version, collection_id, workspace_id, client_id, index, content, token_count, checksum, strategy) values ('ch_1', 'kd_1', 1, 'kc_1', 'ws_kb', 'cli_kb', 0, 'hello', 2, 'h1', 'paragraph_aware') $$, 'insert chunk');
select throws_ok($$ insert into public.document_chunk (id, document_id, document_version, collection_id, workspace_id, client_id, index, content, checksum, strategy) values ('ch_bad', 'kd_1', 1, 'kc_1', 'ws_kb', 'cli_kb', 0, 'x', 'h', 'nope') $$, '23514', null, 'invalid chunk strategy rejected');
select lives_ok($$ insert into public.embedding_vector (id, chunk_id, document_id, collection_id, workspace_id, client_id, provider, model, dimensions, embedding) values ('ev_1', 'ch_1', 'kd_1', 'kc_1', 'ws_kb', 'cli_kb', 'openai', 'm', 16, '[0.1,0.2]'::jsonb) $$, 'insert vector');
select throws_ok($$ insert into public.embedding_vector (id, chunk_id, document_id, collection_id, workspace_id, client_id, provider, model, dimensions, embedding) values ('ev_bad', 'ch_1', 'kd_1', 'kc_1', 'ws_kb', 'cli_kb', 'nope', 'm', 16, '[]'::jsonb) $$, '23514', null, 'invalid embedding provider rejected');

-- embedding job (optimistic) + permission unique
select lives_ok($$ insert into public.embedding_job (id, document_id, document_version, collection_id, workspace_id, client_id, provider, model) values ('ej_1', 'kd_1', 1, 'kc_1', 'ws_kb', 'cli_kb', 'openai', 'm') $$, 'insert job');
select lives_ok($$ update public.embedding_job set status = 'processing', version = 2 where id = 'ej_1' and version = 1 $$, 'job pending→processing');
select lives_ok($$ insert into public.knowledge_permission (id, collection_id, workspace_id, client_id, subject_type, subject_id, level) values ('kp_1', 'kc_1', 'ws_kb', 'cli_kb', 'user', 'u_a', 'read') $$, 'insert permission');
select throws_ok($$ insert into public.knowledge_permission (id, collection_id, workspace_id, client_id, subject_type, subject_id, level) values ('kp_dup', 'kc_1', 'ws_kb', 'cli_kb', 'user', 'u_a', 'write') $$, '23505', null, 'duplicate permission rejected');

-- retrieval session + context + citation
select lives_ok($$ insert into public.retrieval_session (id, workspace_id, client_id, query, provider, model, requested_by_user_id) values ('rs_1', 'ws_kb', 'cli_kb', 'q', 'openai', 'm', 'u_int') $$, 'insert session');
select lives_ok($$ insert into public.retrieved_context (id, session_id, chunk_id, document_id, collection_id, workspace_id, client_id, score, rank, content) values ('rx_1', 'rs_1', 'ch_1', 'kd_1', 'kc_1', 'ws_kb', 'cli_kb', 0.9, 0, 'hello') $$, 'insert context');
select lives_ok($$ insert into public.citation (id, session_id, chunk_id, document_id, collection_id, workspace_id, client_id, source_type, score) values ('cn_1', 'rs_1', 'ch_1', 'kd_1', 'kc_1', 'ws_kb', 'cli_kb', 'markdown', 0.9) $$, 'insert citation');

-- append-only: exercise the trigger as table owner
reset role;
select throws_ok($$ update public.document_version set checksum = 'x' where id = 'dv_1' $$, 'P0001', 'transformation_activity is append-only', 'version UPDATE blocked');
select throws_ok($$ delete from public.retrieval_session where id = 'rs_1' $$, 'P0001', 'transformation_activity is append-only', 'session DELETE blocked');
select throws_ok($$ update public.citation set score = 1 where id = 'cn_1' $$, 'P0001', 'transformation_activity is append-only', 'citation UPDATE blocked');

-- tenant isolation: a client role sees none of the internal-only rows
select set_config('request.jwt.claims', '{"sub":"u_cli","app_metadata":{"role":"client_admin","client_id":"cli_kb_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.knowledge_document), 0, 'client reads 0 documents');
select is((select count(*)::int from public.embedding_vector), 0, 'client reads 0 vectors');
select is((select count(*)::int from public.citation), 0, 'client reads 0 citations');
reset role;

select * from finish();
rollback;
