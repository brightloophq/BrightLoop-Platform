-- =============================================================================
-- Approved scanner package -> canonical internal draft quote.
-- Scanner artifacts remain immutable source material; quote scope and pricing
-- become commercial working state. Nothing here issues a client proposal.
-- =============================================================================

create unique index quotes_source_proposal_version_uidx
  on public.quotes (source_proposal_version_id)
  where source_proposal_version_id is not null;

alter table public.quotes
  drop constraint quotes_commercial_ownership_valid,
  add constraint quotes_commercial_ownership_valid check (
    (
      commercial_mode = 'legacy_client_quote'
      and client_id is not null
      and conversation_id is not null
      and lead_id is null
      and source_run_id is null
      and source_proposal_version_id is null
      and source_review_event_id is null
      and promotion_key is null
    )
    or
    (
      commercial_mode = 'proposal_only'
      and (client_id is not null or lead_id is not null)
      and source_run_id is not null
      and source_proposal_version_id is not null
      and source_review_event_id is not null
      and promotion_key is not null
    )
  );

create or replace function public.bl_proposal_only_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.commercial_mode = 'proposal_only'
     and new.status in ('sent', 'viewed', 'revision_requested', 'revised', 'accepted', 'rejected', 'expired') then
    raise exception 'Proposal-only quotes cannot enter client-facing status %', new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger quotes_proposal_only_status_guard
  before insert or update on public.quotes
  for each row execute function public.bl_proposal_only_status_guard();

create or replace function public.bl_promote_scanner_package(
  p_run_id text,
  p_proposal_version_id text,
  p_review_event_id text,
  p_promotion_key text,
  p_quote_id text
)
returns table (quote_id text, outcome text, item_count integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.intelligence_runs%rowtype;
  v_proposal public.proposal_versions%rowtype;
  v_review public.runtime_events%rowtype;
  v_actor_id text;
  v_existing_id text;
  v_item_count integer;
  v_sequence bigint;
begin
  if not public.bl_is_internal() then
    raise exception 'Internal actor required' using errcode = '42501';
  end if;

  select u.id into v_actor_id
  from public.users u
  where u.auth_user_id = auth.uid();
  if v_actor_id is null then
    raise exception 'Internal user not found' using errcode = '42501';
  end if;

  select * into v_run
  from public.intelligence_runs
  where id = p_run_id;
  if not found then raise exception 'Intelligence run not found' using errcode = 'P0002'; end if;
  if v_run.status <> 'completed' then
    raise exception 'Intelligence run is not completed' using errcode = '23514';
  end if;

  select * into v_proposal
  from public.proposal_versions
  where id = p_proposal_version_id;
  if not found then raise exception 'Proposal version not found' using errcode = 'P0002'; end if;
  if v_proposal.run_id <> p_run_id then
    raise exception 'Proposal version does not belong to run' using errcode = '23514';
  end if;
  if v_proposal.status <> 'needs_review' then
    raise exception 'Proposal version is not awaiting review' using errcode = '23514';
  end if;
  if v_proposal.envelope->>'status' <> 'draft_ready' then
    raise exception 'Proposal is not draft ready' using errcode = '23514';
  end if;
  if jsonb_typeof(v_proposal.envelope->'recommendedWork') <> 'array'
     or jsonb_array_length(v_proposal.envelope->'recommendedWork') = 0 then
    raise exception 'Proposal has no recommended work' using errcode = '23514';
  end if;

  select e.* into v_review
  from public.runtime_events e
  where e.aggregate_type = 'intelligence_run'
    and e.aggregate_id = p_run_id
    and e.event_type in (
      'runtime.review.approved',
      'runtime.review.revision_requested',
      'runtime.review.rejected'
    )
  order by e.sequence desc
  limit 1;
  if not found or v_review.id <> p_review_event_id then
    raise exception 'Review event is not the authoritative decision' using errcode = '23514';
  end if;
  if v_review.event_type <> 'runtime.review.approved' then
    raise exception 'Current package decision is not approved' using errcode = '23514';
  end if;
  if v_review.run_id is distinct from p_run_id then
    raise exception 'Review event does not belong to run' using errcode = '23514';
  end if;
  if v_review.payload->>'proposalVersionId' is distinct from p_proposal_version_id then
    raise exception 'Approval does not pin proposal version' using errcode = '23514';
  end if;
  if v_review.payload->>'proposalChecksum' is distinct from v_proposal.checksum then
    raise exception 'Approval proposal checksum mismatch' using errcode = '23514';
  end if;

  if p_promotion_key is distinct from
     ('promo:' || p_run_id || ':' || p_proposal_version_id || ':' || p_review_event_id) then
    raise exception 'Invalid promotion key' using errcode = '23514';
  end if;

  select q.id into v_existing_id from public.quotes q where q.promotion_key = p_promotion_key;
  if found then
    select count(*)::integer into v_item_count from public.quote_items qi where qi.quote_id = v_existing_id;
    return query select v_existing_id, 'already_promoted'::text, v_item_count;
    return;
  end if;
  select q.id into v_existing_id from public.quotes q where q.source_proposal_version_id = p_proposal_version_id;
  if found then
    select count(*)::integer into v_item_count from public.quote_items qi where qi.quote_id = v_existing_id;
    return query select v_existing_id, 'already_promoted'::text, v_item_count;
    return;
  end if;

  begin
    insert into public.quotes (
      id, conversation_id, client_id, lead_id, commercial_mode, title, status,
      client_note, subtotal, discount, total, valid_until, created_by,
      source_run_id, source_proposal_version_id, source_review_event_id, promotion_key
    ) values (
      p_quote_id, null, v_run.client_id, v_run.lead_id, 'proposal_only',
      'Commercial scope', 'draft', '', 0, 0, 0, null, v_actor_id,
      p_run_id, p_proposal_version_id, p_review_event_id, p_promotion_key
    );
  exception when unique_violation then
    select q.id into v_existing_id
    from public.quotes q
    where q.promotion_key = p_promotion_key
       or q.source_proposal_version_id = p_proposal_version_id
    order by (q.promotion_key = p_promotion_key) desc
    limit 1;
    if not found then raise; end if;
    select count(*)::integer into v_item_count from public.quote_items qi where qi.quote_id = v_existing_id;
    return query select v_existing_id, 'already_promoted'::text, v_item_count;
    return;
  end;

  insert into public.quote_items (
    id, quote_id, label, description, module_id, quantity, unit_amount, amount,
    sort, source_work_item_id, source_evidence_refs, pricing_type,
    recurrence_cadence, optional
  )
  select
    p_quote_id || ':item:' || work.ordinality::text,
    p_quote_id,
    work.value->>'title',
    coalesce(work.value->>'solution', ''),
    null,
    1,
    0,
    0,
    (work.ordinality - 1)::integer,
    work.value->>'sourceId',
    coalesce(work.value->'evidenceIds', '[]'::jsonb),
    'one_time',
    null,
    false
  from jsonb_array_elements(v_proposal.envelope->'recommendedWork') with ordinality as work(value, ordinality);
  get diagnostics v_item_count = row_count;

  select coalesce(max(e.sequence), 0) + 1 into v_sequence
  from public.runtime_events e
  where e.aggregate_type = 'intelligence_run' and e.aggregate_id = p_run_id;

  insert into public.runtime_events (
    id, event_type, run_id, aggregate_id, aggregate_type, client_id, scan_id,
    sequence, payload, actor
  ) values (
    'evt_promoted_' || md5(p_promotion_key),
    'runtime.commercial.package_promoted',
    p_run_id,
    p_run_id,
    'intelligence_run',
    v_run.client_id,
    v_run.scan_id,
    v_sequence,
    jsonb_build_object(
      'quoteId', p_quote_id,
      'proposalVersionId', p_proposal_version_id,
      'reviewEventId', p_review_event_id,
      'itemCount', v_item_count
    ),
    v_actor_id
  );

  return query select p_quote_id, 'created'::text, v_item_count;
end;
$$;

revoke execute on function public.bl_promote_scanner_package(text, text, text, text, text) from public, anon;
grant execute on function public.bl_promote_scanner_package(text, text, text, text, text) to authenticated;

comment on function public.bl_promote_scanner_package(text, text, text, text, text) is
  'Atomically promotes the current approved immutable scanner proposal version into one internal proposal_only draft quote. Canonical promotion state remains on quotes.';
