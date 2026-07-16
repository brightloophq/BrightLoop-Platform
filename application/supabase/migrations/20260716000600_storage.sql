-- =============================================================================
-- 0006 — Storage buckets + access policies (handoff §12 Supabase Storage)
--
-- Buckets: deliverables, media, avatars, contracts.
-- Only `media` is public-read (published marketing assets). Everything else is
-- private and served via signed, expiring URLs (handoff §11.4).
--
-- Path convention for client-scoped buckets: <client_id>/<...>
-- The first path segment IS the tenant boundary, checked against the JWT claim.
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('deliverables', 'deliverables', false),
  ('media', 'media', true),
  ('avatars', 'avatars', false),
  ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- ---- deliverables: client reads only its own folder -------------------------
create policy "deliverables_read_own_or_internal"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'deliverables'
    and (
      public.bl_is_internal()
      or (storage.foldername(name))[1] = public.bl_client_id()
    )
  );

create policy "deliverables_write_internal"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'deliverables' and public.bl_is_internal());

-- ---- contracts: signed SOWs — the most sensitive bucket ---------------------
create policy "contracts_read_own_or_internal"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'contracts'
    and (
      public.bl_is_internal()
      or (storage.foldername(name))[1] = public.bl_client_id()
    )
  );

create policy "contracts_write_internal"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'contracts' and public.bl_is_internal());

-- ---- avatars: a user manages their own -------------------------------------
create policy "avatars_read_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy "avatars_write_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---- media: public read (published marketing assets only) -------------------
-- NOTE: publish gating for portfolio/testimonials is enforced on the DATA rows
-- (Sprint 1), not on the bucket. Do not upload unpublished proof assets here.
create policy "media_read_public"
  on storage.objects for select to public
  using (bucket_id = 'media');

create policy "media_write_marketing"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.bl_role() in ('owner', 'admin')
  );
