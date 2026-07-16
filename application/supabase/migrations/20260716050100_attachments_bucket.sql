-- =============================================================================
-- 0014 — `attachments` storage bucket for discovery-chat files (handoff §12).
--
-- Private bucket; served via signed URLs. Path convention:
--   <client_id>/<conversation_id>/<file>
-- The first path segment is the tenant boundary, checked against the JWT claim —
-- the same pattern as the deliverables/contracts buckets (0006).
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Internal roles: full access to any org's attachments.
create policy "attachments_read_internal"
  on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.bl_is_internal());

create policy "attachments_write_internal"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.bl_is_internal());

-- Client roles: only their OWN org's folder.
create policy "attachments_read_own_org"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.bl_client_id()
  );

create policy "attachments_write_own_org"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.bl_client_id()
  );
