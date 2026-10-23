-- Sprint 1G: explicit owner/admin publication of approved scanner proposals.
-- Publication only makes a proposal visible in the authenticated client portal;
-- it does not send email, create accounts, accept terms, or issue invoices.
begin;

create table public.scanner_sales_publications (
  id                   text primary key,
  conversion_id        text not null unique references public.scanner_sales_conversions(id) on delete restrict,
  proposal_id          text not null unique references public.proposals(id) on delete restrict,
  client_id            text not null references public.clients(id) on delete restrict,
  recipient_user_id    text not null references public.users(id) on delete restrict,
  published_by         text not null references public.users(id) on delete restrict,
  source_binding       jsonb not null,
  client_safe_snapshot jsonb not null,
  published_at         timestamptz not null default now(),
  constraint scanner_sales_publication_binding_object check (jsonb_typeof(source_binding) = 'object'),
  constraint scanner_sales_publication_snapshot_object check (jsonb_typeof(client_safe_snapshot) = 'object')
);
comment on table public.scanner_sales_publications is
  'Immutable audit of explicit portal publication for one approved scanner sales conversion.';

alter table public.scanner_sales_publications enable row level security;
create policy scanner_sales_publications_internal_read on public.scanner_sales_publications
  for select to authenticated using (public.bl_role() in ('owner', 'admin', 'team_member'));
revoke all on public.scanner_sales_publications from public, anon, authenticated, service_role;
grant select on public.scanner_sales_publications to authenticated;

create function public.bl_scanner_sales_publication_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'scanner_sales_publications is append-only' using errcode = '55000';
end;
$$;
create trigger scanner_sales_publications_no_mutation
  before update or delete on public.scanner_sales_publications
  for each row execute function public.bl_scanner_sales_publication_immutable();
create trigger scanner_sales_publications_no_truncate
  before truncate on public.scanner_sales_publications
  for each statement execute function public.bl_scanner_sales_publication_immutable();

-- Converted proposal projections cannot drift from their immutable approved
-- snapshot. The scanner package currently has no approved deposit field, so a
-- converted proposal remains deposit-free until that field is version-bound.
create function public.bl_guard_converted_proposal_terms()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if exists (select 1 from public.scanner_sales_conversions c where c.proposal_id = old.id)
    and (new.line_items is distinct from old.line_items
      or new.subtotal is distinct from old.subtotal
      or new.deposit is distinct from old.deposit
      or new.total is distinct from old.total
      or new.currency is distinct from old.currency
      or new.discount_minor is distinct from old.discount_minor
      or new.valid_until is distinct from old.valid_until) then
    raise exception 'Converted proposal terms are derived from immutable reviewed versions' using errcode = '55000';
  end if;
  if new.status = 'sent' and new.status is distinct from old.status
    and exists (select 1 from public.scanner_sales_conversions c where c.proposal_id = old.id)
    and not (old.status = 'draft' and exists (select 1 from public.scanner_sales_publications d
      where d.proposal_id = old.id
        and d.conversion_id = (select c.id from public.scanner_sales_conversions c where c.proposal_id = old.id)
        and d.client_id = old.client_id)) then
    raise exception 'Converted proposals require the authorized publication operation' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger proposals_converted_terms_guard
  before update on public.proposals
  for each row execute function public.bl_guard_converted_proposal_terms();

create function public.bl_scanner_sales_delivery_preview(p_proposal_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_auth uuid := auth.uid();
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_actor text;
  v_proposal public.proposals%rowtype;
  v_conversion public.scanner_sales_conversions%rowtype;
  v_client public.clients%rowtype;
  v_recipients jsonb;
  v_reason text;
  v_binding jsonb;
  v_review public.runtime_events%rowtype;
begin
  if auth.role() <> 'authenticated' or v_auth is null or v_role not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'Owner or admin authorization required';
  end if;
  select u.id into v_actor from public.users u
    where u.auth_user_id = v_auth and u.role::text = v_role and u.status = 'active';
  if v_actor is null then raise exception using errcode = '42501', message = 'Active owner or admin identity required'; end if;
  select * into v_proposal from public.proposals p where p.id = p_proposal_id;
  if not found then raise exception using errcode = 'P0002', message = 'Proposal not found'; end if;
  select * into v_conversion from public.scanner_sales_conversions c where c.proposal_id = p_proposal_id;
  if not found then raise exception using errcode = '22023', message = 'Proposal is not a scanner conversion'; end if;
  select * into v_client from public.clients c where c.id = v_proposal.client_id;
  select jsonb_build_object(
    'schemaVersion', 1,
    'proposal', (select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.proposal_versions where run_id=v_conversion.run_id order by version desc limit 1),
    'narrative', (select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.narrative_versions where run_id=v_conversion.run_id and audience='client' order by version desc limit 1),
    'report', (select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.intelligence_artifacts where run_id=v_conversion.run_id and kind='internal_intelligence_report' order by version desc limit 1),
    'competitor', (select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.intelligence_artifacts where run_id=v_conversion.run_id and kind='competitor_snapshot' order by version desc limit 1),
    'coreProposal', (select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.intelligence_artifacts where run_id=v_conversion.run_id and kind='proposal' order by version desc limit 1)
  ) into v_binding;
  select * into v_review from public.runtime_events e where e.run_id=v_conversion.run_id
    and e.aggregate_type='intelligence_run' and e.aggregate_id=v_conversion.run_id
    and e.event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested')
    order by e.sequence desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email) order by u.email), '[]'::jsonb)
    into v_recipients
    from public.users u join auth.users au on au.id = u.auth_user_id
    where u.client_id = v_conversion.client_id and u.role in ('client_admin', 'client_member')
      and u.status = 'active' and u.auth_user_id is not null and au.email_confirmed_at is not null;
  if v_conversion.source_binding is distinct from v_binding or v_review.id is null
    or v_review.event_type <> 'runtime.review.approved' or v_review.payload -> 'binding' is distinct from v_binding then
    v_reason := 'The approved source versions changed. Re-review and reconvert the package.';
  elsif v_client.lifecycle not in ('member', 'client_active', 'post_launch', 'renewed') then
    v_reason := 'The client account has not completed onboarding.';
  elsif jsonb_array_length(v_recipients) = 0 then
    v_reason := 'No active, authenticated portal recipient is linked to this client.';
  elsif v_proposal.currency <> 'USD' then
    v_reason := 'Only USD proposals can be published until invoice currency support is available.';
  elsif v_proposal.valid_until is null or v_proposal.valid_until < current_date then
    v_reason := 'Commercial terms are missing an expiry or have expired.';
  elsif v_proposal.status <> 'draft' and not exists (
    select 1 from public.scanner_sales_publications d where d.proposal_id = p_proposal_id
  ) then
    v_reason := 'This proposal is no longer a private draft.';
  end if;
  return jsonb_build_object(
    'proposalId', v_proposal.id, 'clientId', v_conversion.client_id,
    'company', v_client.company, 'status', v_proposal.status,
    'currency', v_proposal.currency, 'subtotalMinor', v_proposal.subtotal,
    'discountMinor', v_proposal.discount_minor, 'totalMinor', v_proposal.total,
    'depositMinor', v_proposal.deposit, 'validUntil', v_proposal.valid_until,
    'lineItems', v_proposal.line_items, 'recipients', v_recipients,
    'eligible', v_reason is null, 'reason', v_reason,
    'published', exists (select 1 from public.scanner_sales_publications d where d.proposal_id = p_proposal_id)
  );
end;
$$;

create function public.bl_publish_scanner_sales_proposal(
  p_proposal_id text,
  p_expected_client_id text,
  p_recipient_user_id text,
  p_expected_currency text,
  p_expected_total_minor bigint,
  p_expected_valid_until date
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_auth uuid := auth.uid();
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_actor text;
  v_conversion public.scanner_sales_conversions%rowtype;
  v_proposal_row public.proposals%rowtype;
  v_run public.intelligence_runs%rowtype;
  v_proposal public.proposal_versions%rowtype;
  v_narrative public.narrative_versions%rowtype;
  v_report public.intelligence_artifacts%rowtype;
  v_competitor public.intelligence_artifacts%rowtype;
  v_core public.intelligence_artifacts%rowtype;
  v_review public.runtime_events%rowtype;
  v_recipient public.users%rowtype;
  v_client public.clients%rowtype;
  v_binding jsonb;
  v_publication public.scanner_sales_publications%rowtype;
  v_now timestamptz := now();
begin
  if auth.role() <> 'authenticated' or v_auth is null or v_role not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'Owner or admin authorization required';
  end if;
  select u.id into v_actor from public.users u
    where u.auth_user_id = v_auth and u.role::text = v_role and u.status = 'active';
  if v_actor is null then raise exception using errcode = '42501', message = 'Active owner or admin identity required'; end if;
  if p_proposal_id is null or p_expected_client_id is null or p_recipient_user_id is null
    or p_expected_currency is null or p_expected_total_minor is null or p_expected_valid_until is null then
    raise exception using errcode = '22023', message = 'Confirm the recipient and current proposal terms';
  end if;

  select * into v_conversion from public.scanner_sales_conversions c where c.proposal_id = p_proposal_id;
  if not found then raise exception using errcode = '22023', message = 'Proposal is not a scanner conversion'; end if;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:' || v_conversion.run_id, 0));
  select * into v_run from public.intelligence_runs r where r.id = v_conversion.run_id for update;
  select * into v_proposal_row from public.proposals p where p.id = p_proposal_id for update;
  if not found or v_proposal_row.client_id <> v_conversion.client_id
    or v_conversion.client_id <> p_expected_client_id then
    raise exception using errcode = '40001', message = 'Proposal or client changed; reload the delivery review.';
  end if;
  select * into v_client from public.clients c where c.id = v_conversion.client_id for share;
  if v_client.lifecycle not in ('member', 'client_active', 'post_launch', 'renewed') then
    raise exception using errcode = '40001', message = 'The client account has not completed onboarding.';
  end if;
  select u.* into v_recipient from public.users u join auth.users au on au.id = u.auth_user_id
    where u.id = p_recipient_user_id and u.client_id = v_conversion.client_id
      and u.role in ('client_admin', 'client_member') and u.status = 'active'
      and u.auth_user_id is not null and au.email_confirmed_at is not null;
  if not found then
    raise exception using errcode = '40001', message = 'The selected recipient is not an active authenticated user for this client.';
  end if;
  if v_run.status <> 'completed' or v_run.client_id <> v_conversion.client_id then
    raise exception using errcode = '40001', message = 'The scanner run is incomplete or belongs to a different client.';
  end if;

  select * into v_proposal from public.proposal_versions p where p.run_id = v_run.id order by p.version desc limit 1;
  select * into v_narrative from public.narrative_versions n where n.run_id = v_run.id and n.audience = 'client' order by n.version desc limit 1;
  select * into v_report from public.intelligence_artifacts a where a.run_id = v_run.id and a.kind = 'internal_intelligence_report' order by a.version desc limit 1;
  select * into v_competitor from public.intelligence_artifacts a where a.run_id = v_run.id and a.kind = 'competitor_snapshot' order by a.version desc limit 1;
  select * into v_core from public.intelligence_artifacts a where a.run_id = v_run.id and a.kind = 'proposal' order by a.version desc limit 1;
  if v_proposal.id is null or v_narrative.id is null or v_report.id is null
    or v_report.validation_status <> 'valid' or v_proposal.envelope ->> 'status' <> 'draft_ready'
    or v_proposal.envelope ->> 'commercialState' <> 'priced' or v_narrative.envelope ->> 'status' <> 'ready'
    or jsonb_typeof(v_narrative.envelope -> 'sections') is distinct from 'array'
    or jsonb_array_length(v_narrative.envelope -> 'sections') = 0
    or (v_core.id is not null and v_core.validation_status = 'invalid')
    or (v_competitor.id is not null and v_competitor.validation_status = 'invalid') then
    raise exception using errcode = '40001', message = 'Required current scanner artifacts are missing, incomplete, or invalid.';
  end if;
  if v_competitor.id is null and not exists (select 1 from public.runtime_events e where e.run_id = v_run.id
    and e.stage = 'competitor_intelligence' and e.event_type = 'runtime.commercial.stage_completed') then
    raise exception using errcode = '40001', message = 'Required competitor intelligence is incomplete.';
  end if;
  if exists (select 1 from (
      select distinct on (e.stage) e.event_type from public.runtime_events e
      where e.run_id = v_run.id and e.stage in ('competitor_intelligence','proposal_generation','narrative_generation')
        and e.event_type in ('runtime.commercial.stage_failed','runtime.job.dead_lettered','runtime.commercial.enqueue_failed',
          'runtime.commercial.stage_completed','runtime.commercial.enqueued') order by e.stage,e.sequence desc
    ) latest where latest.event_type in ('runtime.commercial.stage_failed','runtime.job.dead_lettered','runtime.commercial.enqueue_failed')) then
    raise exception using errcode = '40001', message = 'An unresolved commercial workflow failure blocks publication.';
  end if;

  v_binding := jsonb_build_object(
    'schemaVersion', 1,
    'proposal', jsonb_build_object('id', v_proposal.id, 'version', v_proposal.version, 'checksum', v_proposal.checksum),
    'narrative', jsonb_build_object('id', v_narrative.id, 'version', v_narrative.version, 'checksum', v_narrative.checksum),
    'report', jsonb_build_object('id', v_report.id, 'version', v_report.version, 'checksum', v_report.checksum),
    'competitor', case when v_competitor.id is null then null else jsonb_build_object('id', v_competitor.id, 'version', v_competitor.version, 'checksum', v_competitor.checksum) end,
    'coreProposal', case when v_core.id is null then null else jsonb_build_object('id', v_core.id, 'version', v_core.version, 'checksum', v_core.checksum) end
  );
  if v_conversion.source_binding is distinct from v_binding then
    raise exception using errcode = '40001', message = 'Reviewed source versions changed; re-review and reconvert this package.';
  end if;
  select * into v_review from public.runtime_events e where e.run_id = v_run.id
    and e.aggregate_type = 'intelligence_run' and e.aggregate_id = v_run.id
    and e.event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested')
    order by e.sequence desc limit 1;
  if v_review.id is null or v_review.event_type <> 'runtime.review.approved'
    or v_review.payload -> 'binding' is distinct from v_binding then
    raise exception using errcode = '40001', message = 'Current version-bound approval is missing or stale.';
  end if;

  if v_proposal.envelope ->> 'commercialState' <> 'priced'
    or v_proposal.envelope -> 'pricing' ->> 'currency' <> 'USD'
    or jsonb_typeof(v_proposal.envelope -> 'pricing' -> 'items') is distinct from 'array'
    or jsonb_array_length(v_proposal.envelope -> 'pricing' -> 'items') = 0
    or v_proposal.envelope -> 'pricing' ->> 'validUntil' is null then
    raise exception using errcode = '22023', message = 'A complete USD proposal with a valid expiry is required.';
  end if;
  if (v_proposal.envelope -> 'pricing' ->> 'validUntil')::date < current_date then
    raise exception using errcode = '40001', message = 'Commercial terms have expired.';
  end if;
  if v_conversion.client_safe_snapshot #>> '{pricing,currency}' <> v_proposal_row.currency
    or v_conversion.client_safe_snapshot #>> '{pricing,validUntil}' <> v_proposal_row.valid_until::text
    or v_conversion.client_safe_snapshot #>> '{pricing,discountMinor}' <> v_proposal_row.discount_minor::text
    or v_conversion.client_safe_snapshot #>> '{pricing,subtotalOneTimeMinor}' <> v_proposal_row.subtotal::text
    or v_conversion.client_safe_snapshot #>> '{pricing,totalOneTimeMinor}' <> v_proposal_row.total::text
    or v_proposal.envelope #>> '{pricing,currency}' <> v_proposal_row.currency
    or v_proposal_row.currency <> 'USD'
    or (v_proposal.envelope #>> '{pricing,discountMinor}')::numeric <> v_proposal_row.discount_minor
    or (v_proposal.envelope #>> '{pricing,subtotalOneTimeMinor}')::numeric <> v_proposal_row.subtotal
    or (v_proposal.envelope #>> '{pricing,totalOneTimeMinor}')::numeric <> v_proposal_row.total
    or v_proposal_row.deposit <> 0
    or v_proposal_row.valid_until is distinct from (v_proposal.envelope #>> '{pricing,validUntil}')::date
    or v_proposal_row.line_items is distinct from v_conversion.client_safe_snapshot #> '{proposal,scope}' then
    raise exception using errcode = '40001', message = 'Canonical proposal terms no longer match the approved package.';
  end if;
  if p_expected_currency <> v_proposal_row.currency or p_expected_total_minor <> v_proposal_row.total
    or p_expected_valid_until is distinct from v_proposal_row.valid_until then
    raise exception using errcode = '40001', message = 'The confirmed proposal summary changed; review it again.';
  end if;

  select * into v_publication from public.scanner_sales_publications d where d.proposal_id = p_proposal_id;
  if found then
    if v_publication.recipient_user_id <> p_recipient_user_id or v_publication.client_id <> v_conversion.client_id
      or v_publication.source_binding is distinct from v_binding then
      raise exception using errcode = '40001', message = 'Proposal was already published with different recipient or terms.';
    end if;
    return jsonb_build_object('published', true, 'replayed', true, 'proposalId', p_proposal_id,
      'clientId', v_conversion.client_id, 'recipientUserId', v_recipient.id, 'recipientName', v_recipient.name,
      'recipientEmail', v_recipient.email, 'publishedAt', v_publication.published_at);
  end if;
  if v_proposal_row.status <> 'draft' then
    raise exception using errcode = '40001', message = 'Only a private draft can be published.';
  end if;

  insert into public.scanner_sales_publications(id, conversion_id, proposal_id, client_id, recipient_user_id,
    published_by, source_binding, client_safe_snapshot, published_at)
  values ('spb_' || replace(gen_random_uuid()::text, '-', ''), v_conversion.id, p_proposal_id,
    v_conversion.client_id, v_recipient.id, v_actor, v_binding, v_conversion.client_safe_snapshot, v_now);
  insert into public.transition_log(machine, entity_type, entity_id, from_state, to_state, actor_id, reason, at)
  values ('proposal', 'proposals', p_proposal_id, 'draft', 'sent', v_actor, 'portal publication', v_now);
  update public.proposals set status = 'sent', sent_at = v_now where id = p_proposal_id;
  return jsonb_build_object('published', true, 'replayed', false, 'proposalId', p_proposal_id,
    'clientId', v_conversion.client_id, 'recipientUserId', v_recipient.id, 'recipientName', v_recipient.name,
    'recipientEmail', v_recipient.email, 'publishedAt', v_now);
end;
$$;

create function public.bl_client_scanner_proposal_contents()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_auth uuid := auth.uid();
  v_claim_client text := nullif(auth.jwt() -> 'app_metadata' ->> 'client_id', '');
  v_claim_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_user public.users%rowtype;
begin
  if auth.role() <> 'authenticated' or v_auth is null or v_claim_role not in ('client_admin','client_member') then
    raise exception using errcode = '42501', message = 'Authenticated client account required';
  end if;
  select * into v_user from public.users u where u.auth_user_id = v_auth and u.client_id = v_claim_client
    and u.role::text = v_claim_role and u.status = 'active';
  if not found then raise exception using errcode = '42501', message = 'Client identity is unavailable'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'proposalId', p.id, 'snapshot', d.client_safe_snapshot, 'depositMinor', p.deposit
    ) order by d.published_at desc)
    from public.scanner_sales_publications d join public.proposals p on p.id = d.proposal_id
    where d.client_id = v_user.client_id and p.client_id = v_user.client_id
      and p.status in ('sent','viewed','accepted','change_requested','revised','expired')), '[]'::jsonb);
end;
$$;

revoke all on function public.bl_scanner_sales_delivery_preview(text) from public, anon, service_role;
revoke all on function public.bl_publish_scanner_sales_proposal(text,text,text,text,bigint,date) from public, anon, service_role;
revoke all on function public.bl_client_scanner_proposal_contents() from public, anon, service_role;
grant execute on function public.bl_scanner_sales_delivery_preview(text) to authenticated;
grant execute on function public.bl_publish_scanner_sales_proposal(text,text,text,text,bigint,date) to authenticated;
grant execute on function public.bl_client_scanner_proposal_contents() to authenticated;
revoke all on function public.bl_scanner_sales_publication_immutable() from public, anon, authenticated, service_role;
revoke all on function public.bl_guard_converted_proposal_terms() from public, anon, authenticated, service_role;
commit;
