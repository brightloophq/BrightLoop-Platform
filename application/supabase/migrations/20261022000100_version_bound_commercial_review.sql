-- Sprint 1C. No tables/columns or historical events are rewritten.
-- All effective reviews bind exact immutable version/source identities.
-- Legacy writers may still append authorized unbound audit events, but the
-- application treats EVERY unbound decision as requiring re-review.
begin;

create function public.bl_lock_commercial_version()
returns trigger
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  run_id text;
  source_kind text;
begin
  if tg_op = 'TRUNCATE' then
    raise exception using errcode = '55000', message = 'Reviewed source artifacts are append-only';
  end if;
  if tg_table_name = 'intelligence_artifacts' then
    if tg_op = 'DELETE' then source_kind := old.kind::text;
    else source_kind := new.kind::text;
    end if;
    if source_kind not in ('internal_intelligence_report', 'competitor_snapshot', 'proposal')
      and (tg_op <> 'UPDATE' or old.kind::text not in ('internal_intelligence_report', 'competitor_snapshot', 'proposal'))
    then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    -- Source artifacts are already append-only through ArtifactService. Enforce
    -- that contract for these reviewed sources even on privileged direct writes.
    -- This also prevents in-place checksum/content/validation changes under a
    -- previously reviewed identity. Revise by INSERTing the next version.
    if tg_op <> 'INSERT' then
      raise exception using errcode = '55000', message = 'Reviewed source artifacts are append-only';
    end if;
  end if;
  run_id := new.run_id;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:' || run_id, 0));
  return new;
end;
$$;

create trigger proposal_versions_review_lock before insert on public.proposal_versions
  for each row execute function public.bl_lock_commercial_version();
create trigger narrative_versions_review_lock before insert on public.narrative_versions
  for each row execute function public.bl_lock_commercial_version();
create trigger intelligence_artifacts_review_lock before insert or update or delete on public.intelligence_artifacts
  for each row execute function public.bl_lock_commercial_version();
create trigger intelligence_artifacts_review_no_truncate before truncate on public.intelligence_artifacts
  for each statement execute function public.bl_lock_commercial_version();

create function public.bl_guard_commercial_review_binding()
returns trigger
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  current_binding jsonb;
begin
  if new.event_type not in ('runtime.review.approved', 'runtime.review.rejected', 'runtime.review.revision_requested') then
    return new;
  end if;
  -- Sprint 1A's alphabetically earlier authority trigger still applies to every
  -- review, including legacy/unbound audit records. No legacy event is upgraded.
  if not (new.payload ? 'binding') then return new; end if;

  -- A waiter at REPEATABLE READ could retain a pre-lock snapshot. Fail closed
  -- instead of accepting a comparison against that snapshot. PostgREST defaults
  -- to READ COMMITTED; volatile PL/pgSQL queries below take fresh snapshots after
  -- acquiring the lock. Writers hold this same lock until transaction end.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'Review requires a fresh READ COMMITTED transaction';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:' || new.run_id, 0));
  if new.run_id is null or new.aggregate_id is distinct from new.run_id
    or new.aggregate_type is distinct from 'intelligence_run'
    or not exists (select 1 from public.intelligence_runs r where r.id = new.run_id
      and r.status = 'completed' and r.client_id is not distinct from new.client_id
      and r.scan_id is not distinct from new.scan_id)
  then
    raise exception using errcode = '40001', message = 'Reviewed package is unavailable or changed';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'proposal', (select jsonb_build_object('id', id, 'version', version, 'checksum', checksum)
      from public.proposal_versions where run_id = new.run_id order by version desc limit 1),
    'narrative', (select jsonb_build_object('id', id, 'version', version, 'checksum', checksum)
      from public.narrative_versions where run_id = new.run_id and audience = 'client' order by version desc limit 1),
    'report', (select jsonb_build_object('id', id, 'version', version, 'checksum', checksum)
      from public.intelligence_artifacts where run_id = new.run_id and kind = 'internal_intelligence_report' order by version desc limit 1),
    'competitor', (select jsonb_build_object('id', id, 'version', version, 'checksum', checksum)
      from public.intelligence_artifacts where run_id = new.run_id and kind = 'competitor_snapshot' order by version desc limit 1),
    'coreProposal', (select jsonb_build_object('id', id, 'version', version, 'checksum', checksum)
      from public.intelligence_artifacts where run_id = new.run_id and kind = 'proposal' order by version desc limit 1)
  ) into current_binding;
  if current_binding -> 'proposal' = 'null'::jsonb
    or current_binding -> 'narrative' = 'null'::jsonb
    or current_binding -> 'report' = 'null'::jsonb
    or new.payload -> 'binding' is distinct from current_binding
  then
    raise exception using errcode = '40001', message = 'Reviewed versions changed; reload the package';
  end if;
  -- Never stamp a browser binding onto a changed package: exact equality above
  -- is a precondition; these are the identities re-resolved inside this transaction.
  new.payload := jsonb_set(new.payload, '{binding}', current_binding);
  return new;
end;
$$;

create trigger runtime_events_review_binding before insert on public.runtime_events
  for each row execute function public.bl_guard_commercial_review_binding();
revoke all on function public.bl_lock_commercial_version() from public, anon, authenticated, service_role;
revoke all on function public.bl_guard_commercial_review_binding() from public, anon, authenticated, service_role;
commit;
