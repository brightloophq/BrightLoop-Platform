-- pgcrypto is installed in Supabase's extensions schema. Resolve the SHA-256
-- helper explicitly for the Sprint 1H security-definer RPCs.
begin;
create extension if not exists pgcrypto with schema extensions;
alter function public.bl_create_scanner_sales_revision(text) set search_path=public,extensions,pg_temp;
alter function public.bl_publish_scanner_sales_proposal(text,text,text,text,bigint,date) set search_path=public,extensions,pg_temp;
alter function public.bl_client_scanner_proposal_response(text,text,text,text) set search_path=public,extensions,pg_temp;
alter function public.bl_client_scanner_proposal_contents() set search_path=public,extensions,pg_temp;
alter function public.bl_scanner_sales_revision_preview(text) set search_path=public,extensions,pg_temp;
alter function public.bl_guard_scanner_sales_revision_insert() set search_path=public,extensions,pg_temp;
alter function public.bl_guard_scanner_client_response() set search_path=public,extensions,pg_temp;
commit;
