-- Sprint 1A: database review authority and immutable commercial version history.
-- Forward-only; no existing row, foreign key, or application contract is rewritten.
--
-- JWT convention: PostgREST verifies the token; role = authenticated is the API
-- role, app_metadata.role is the application role, and sub is the auth-user UUID.
-- The web application uses sub (not public.users.id) for review payload.by.
-- Runtime composition currently leaves event.actor NULL; stamp that field here
-- from verified claims rather than requiring an application change.
--
-- RETENTION CHANGE: deleting a run/client with versions, or a user referenced by
-- created_by, now fails rather than cascading DELETE / SET NULL into history.
-- Deleting a predecessor likewise cannot erase a supersedes_id link. This is
-- intentional, tested retention enforcement; use a separately reviewed retention
-- procedure if physical deletion becomes necessary. No trigger-depth exemption.

begin;

-- Replace the broad INSERT predicate; an additional permissive policy would OR
-- with the old predicate and leave team-member review insertion possible.
alter policy "runtime_events_internal_append" on public.runtime_events
  with check (
    public.bl_is_internal()
    and (
      event_type not in (
        'runtime.review.approved',
        'runtime.review.rejected',
        'runtime.review.revision_requested'
      )
      or public.bl_role() in ('owner', 'admin')
    )
  );

create function public.bl_guard_commercial_review_event()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  claims jsonb;
  subject text;
begin
  if new.event_type not in (
    'runtime.review.approved',
    'runtime.review.rejected',
    'runtime.review.revision_requested'
  ) then
    return new; -- ordinary internal / system events keep their existing behavior
  end if;

  begin
    claims := auth.jwt();
  exception when invalid_text_representation then
    raise exception using errcode = '42501', message = 'Review requires authenticated owner/admin identity';
  end;
  subject := claims ->> 'sub';

  if jsonb_typeof(claims -> 'role') is distinct from 'string'
    or (claims ->> 'role') is distinct from 'authenticated'
    or jsonb_typeof(claims -> 'app_metadata') is distinct from 'object'
    or jsonb_typeof(claims -> 'app_metadata' -> 'role') is distinct from 'string'
    or coalesce(claims -> 'app_metadata' ->> 'role', '') not in ('owner', 'admin')
    or jsonb_typeof(claims -> 'sub') is distinct from 'string'
    or subject is null
    or subject !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    -- This also runs for RLS-bypassing service_role / table-owner inserts.
    -- A service-role token is not a human reviewer, even with copied metadata.
    -- Legitimate server-side reviews use the caller's authenticated JWT; system
    -- events and system-generated versions do not need reviewer identity.
    raise exception using errcode = '42501', message = 'Review requires authenticated owner/admin identity';
  end if;

  if (new.actor is not null and new.actor is distinct from subject)
    or jsonb_typeof(new.payload) is distinct from 'object'
    or jsonb_typeof(new.payload -> 'by') is distinct from 'string'
    or (new.payload ->> 'by') is distinct from subject
  then
    raise exception using errcode = '42501', message = 'Review attribution must match authenticated subject';
  end if;

  new.actor := subject;
  return new;
end;
$$;

create trigger runtime_events_review_authority
  before insert on public.runtime_events
  for each row execute function public.bl_guard_commercial_review_event();

-- Retain append-only superseding inserts; remove both the RLS mutation path and
-- inherited/default table privileges. Existing SELECT/INSERT service privileges
-- remain available for legitimate backend generation.
drop policy "proposal_versions_internal_all" on public.proposal_versions;
create policy "proposal_versions_internal_read" on public.proposal_versions
  for select to authenticated using (public.bl_is_internal());
create policy "proposal_versions_internal_append" on public.proposal_versions
  for insert to authenticated with check (public.bl_is_internal());

drop policy "narrative_versions_internal_all" on public.narrative_versions;
create policy "narrative_versions_internal_read" on public.narrative_versions
  for select to authenticated using (public.bl_is_internal());
create policy "narrative_versions_internal_append" on public.narrative_versions
  for insert to authenticated with check (public.bl_is_internal());

revoke update, delete, truncate on public.proposal_versions, public.narrative_versions
  from public, anon, authenticated, service_role;

create function public.bl_commercial_version_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger proposal_versions_no_mutation
  before update or delete on public.proposal_versions
  for each row execute function public.bl_commercial_version_immutable();
create trigger narrative_versions_no_mutation
  before update or delete on public.narrative_versions
  for each row execute function public.bl_commercial_version_immutable();
-- TRUNCATE bypasses row triggers; retain the same protection for table owners.
create trigger proposal_versions_no_truncate
  before truncate on public.proposal_versions
  for each statement execute function public.bl_commercial_version_immutable();
create trigger narrative_versions_no_truncate
  before truncate on public.narrative_versions
  for each statement execute function public.bl_commercial_version_immutable();

-- Trigger-only helpers, not public RPCs. PostgreSQL invokes installed triggers
-- independently of callers' EXECUTE privilege on the trigger function.
revoke all on function public.bl_guard_commercial_review_event() from public, anon, authenticated, service_role;
revoke all on function public.bl_commercial_version_immutable() from public, anon, authenticated, service_role;

commit;
