-- =============================================================================
-- Increment 2: canonical quote lineage, legacy compatibility, and client denial.
-- =============================================================================

begin;
create extension if not exists pgtap;
select no_plan();

-- ---- setup ------------------------------------------------------------------
insert into public.clients (id, company) values
  ('cli_qline', 'Quote Lineage Co'),
  ('cli_qother', 'Other Co');

insert into auth.users (id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003');

insert into public.users (id, auth_user_id, name, email, role, client_id, status) values
  ('usr_qowner', '10000000-0000-0000-0000-000000000001', 'Quote Owner', 'qowner@example.test', 'owner', null, 'active'),
  ('usr_qclient', '10000000-0000-0000-0000-000000000002', 'Quote Client', 'qclient@example.test', 'client_admin', 'cli_qline', 'active'),
  ('usr_qadmin', '10000000-0000-0000-0000-000000000003', 'Quote Admin', 'qadmin@example.test', 'admin', null, 'active');

insert into public.leads (id, name, company, email) values
  ('lead_qline', 'Lead Contact', 'Lead Company', 'lead@example.test');

insert into public.conversations (id, client_id, subject) values
  ('conv_qline', 'cli_qline', 'Quote conversation');
insert into public.conversation_participants (conversation_id, user_id) values
  ('conv_qline', 'usr_qclient');

insert into public.intelligence_runs (id, client_id, scan_id, status, idempotency_key, created_by) values
  ('run_qclient', 'cli_qline', 'scan_qclient', 'completed', 'idem_qclient', 'usr_qowner');
insert into public.intelligence_runs (id, lead_id, scan_id, status, idempotency_key, created_by) values
  ('run_qlead', 'lead_qline', 'scan_qlead', 'completed', 'idem_qlead', 'usr_qowner');

insert into public.proposal_versions
  (id, run_id, client_id, scan_id, status, version, checksum, idempotency_key, created_by)
values
  ('pv_qclient', 'run_qclient', 'cli_qline', 'scan_qclient', 'needs_review', 1, 'chk_qclient', 'pv_idem_qclient', 'usr_qowner'),
  ('pv_qlead', 'run_qlead', null, 'scan_qlead', 'needs_review', 1, 'chk_qlead', 'pv_idem_qlead', 'usr_qowner'),
  ('pv_qboth', 'run_qlead', null, 'scan_qlead', 'needs_review', 2, 'chk_qboth', 'pv_idem_qboth', 'usr_qowner'),
  ('pv_bad_lead', 'run_qlead', null, 'scan_qlead', 'needs_review', 3, 'chk_bad_lead', 'pv_idem_bad_lead', 'usr_qowner'),
  ('pv_bad_run', 'run_qlead', null, 'scan_qlead', 'needs_review', 4, 'chk_bad_run', 'pv_idem_bad_run', 'usr_qowner'),
  ('pv_bad_event', 'run_qlead', null, 'scan_qlead', 'needs_review', 5, 'chk_bad_event', 'pv_idem_bad_event', 'usr_qowner');

insert into public.runtime_events
  (id, event_type, run_id, aggregate_id, aggregate_type, client_id, scan_id, sequence, actor)
values
  ('evt_qclient', 'runtime.review.approved', 'run_qclient', 'run_qclient', 'intelligence_run', 'cli_qline', 'scan_qclient', 1, 'usr_qowner'),
  ('evt_qlead', 'runtime.review.approved', 'run_qlead', 'run_qlead', 'intelligence_run', null, 'scan_qlead', 1, 'usr_qowner'),
  ('evt_qboth', 'runtime.review.approved', 'run_qlead', 'run_qlead', 'intelligence_run', null, 'scan_qlead', 2, 'usr_qowner');

-- ---- defaults and mode/ownership constraints --------------------------------
insert into public.quotes (id, conversation_id, client_id, title, status) values
  ('q_legacy_view', 'conv_qline', 'cli_qline', 'Legacy view', 'sent'),
  ('q_legacy_reject', 'conv_qline', 'cli_qline', 'Legacy reject', 'sent'),
  ('q_legacy_revise', 'conv_qline', 'cli_qline', 'Legacy revise', 'sent');

select is(
  (select commercial_mode from public.quotes where id = 'q_legacy_view'),
  'legacy_client_quote',
  'existing/default quote receives legacy_client_quote'
);

select throws_ok(
  $$ insert into public.quotes (id, conversation_id, client_id) values ('q_bad_legacy_client', 'conv_qline', null) $$,
  '23514', null, 'legacy_client_quote rejects NULL client_id'
);
select throws_ok(
  $$ insert into public.quotes (id, conversation_id, client_id) values ('q_bad_legacy_conv', null, 'cli_qline') $$,
  '23514', null, 'legacy_client_quote rejects NULL conversation_id'
);
select throws_ok(
  $$ insert into public.quotes (id, conversation_id, client_id, commercial_mode) values ('q_bad_mode', 'conv_qline', 'cli_qline', 'scanner_quote') $$,
  '23514', null, 'invalid commercial_mode is rejected'
);

select lives_ok(
  $$ insert into public.quotes
       (id, client_id, conversation_id, commercial_mode, lead_id, source_run_id, source_proposal_version_id, source_review_event_id, promotion_key)
     values
       ('q_proposal_lead', null, null, 'proposal_only', 'lead_qline', 'run_qlead', 'pv_qlead', 'evt_qlead', 'promote_qlead') $$,
  'proposal_only can exist without client_id or conversation_id'
);
select lives_ok(
  $$ insert into public.quotes
       (id, client_id, conversation_id, commercial_mode, source_run_id, source_proposal_version_id, source_review_event_id, status, promotion_key)
     values
       ('q_proposal_client', 'cli_qline', 'conv_qline', 'proposal_only', 'run_qclient', 'pv_qclient', 'evt_qclient', 'draft', 'promote_qclient') $$,
  'proposal_only can retain a client/conversation while remaining internal'
);
select lives_ok(
  $$ insert into public.quotes
       (id, client_id, conversation_id, commercial_mode, lead_id, source_run_id, source_proposal_version_id, source_review_event_id, status, promotion_key)
     values
       ('q_proposal_both', 'cli_qline', 'conv_qline', 'proposal_only', 'lead_qline', 'run_qlead', 'pv_qboth', 'evt_qboth', 'draft', 'promote_qboth') $$,
  'proposal_only accepts retained lead origin plus resolved client'
);
select throws_ok(
  $$ insert into public.quotes
       (id, commercial_mode, source_run_id, source_proposal_version_id, source_review_event_id)
     values
       ('q_proposal_no_subject', 'proposal_only', 'run_qlead', 'pv_qlead', 'evt_qlead') $$,
  '23514', null, 'proposal_only rejects a quote with neither lead nor client'
);

select throws_ok(
  $$ insert into public.quotes
       (id, commercial_mode, lead_id, source_run_id, source_proposal_version_id, source_review_event_id, promotion_key)
     values
       ('q_duplicate_promotion', 'proposal_only', 'lead_qline', 'run_qlead', 'pv_qlead', 'evt_qlead', 'different_promotion_key') $$,
  '23505', null, 'one quote per source proposal version is enforced independently of promotion_key'
);
select throws_ok(
  $$ insert into public.quotes
       (id, commercial_mode, lead_id, source_run_id, source_proposal_version_id, source_review_event_id, promotion_key)
     values
       ('q_duplicate_key', 'proposal_only', 'lead_qline', 'run_qlead', 'pv_bad_lead', 'evt_qlead', 'promote_qclient') $$,
  '23505', null, 'non-null promotion_key remains independently unique'
);
select throws_ok(
  $$ insert into public.quotes
       (id, commercial_mode, lead_id, source_run_id, source_proposal_version_id, source_review_event_id, promotion_key)
     values
       ('q_bad_lead', 'proposal_only', 'lead_missing', 'run_qlead', 'pv_bad_lead', 'evt_qlead', 'promote_bad_lead') $$,
  '23503', null, 'invalid lead lineage FK is rejected'
);
select throws_ok(
  $$ insert into public.quotes
       (id, commercial_mode, lead_id, source_run_id, source_proposal_version_id, source_review_event_id, promotion_key)
     values
       ('q_bad_run', 'proposal_only', 'lead_qline', 'run_missing', 'pv_bad_run', 'evt_qlead', 'promote_bad_run') $$,
  '23503', null, 'invalid run lineage FK is rejected'
);
select throws_ok(
  $$ insert into public.quotes
       (id, commercial_mode, lead_id, source_run_id, source_proposal_version_id, source_review_event_id, promotion_key)
     values
       ('q_bad_proposal_version', 'proposal_only', 'lead_qline', 'run_qlead', 'pv_missing', 'evt_qlead', 'promote_bad_pv') $$,
  '23503', null, 'invalid proposal-version lineage FK is rejected'
);
select throws_ok(
  $$ insert into public.quotes
       (id, commercial_mode, lead_id, source_run_id, source_proposal_version_id, source_review_event_id, promotion_key)
     values
       ('q_bad_review_event', 'proposal_only', 'lead_qline', 'run_qlead', 'pv_bad_event', 'evt_missing', 'promote_bad_event') $$,
  '23503', null, 'invalid review-event lineage FK is rejected'
);
select throws_ok(
  $$ update public.quotes set source_proposal_version_id = 'pv_qclient' where id = 'q_proposal_lead' $$,
  '23514', 'Quote commercial mode and source lineage are immutable', 'quote source lineage cannot be repointed'
);
select throws_ok(
  $$ update public.quotes set commercial_mode = 'legacy_client_quote' where id = 'q_proposal_client' $$,
  '23514', 'Quote commercial mode and source lineage are immutable', 'commercial mode cannot reinterpret an existing quote'
);
select throws_ok(
  $$ update public.quotes set client_id = 'cli_qline', lead_id = null where id = 'q_proposal_lead' $$,
  '23514', 'Quote commercial mode and source lineage are immutable', 'lead origin cannot be cleared during client binding'
);
select throws_ok(
  $$ update public.quotes set client_id = 'cli_qline', lead_id = 'lead_missing' where id = 'q_proposal_lead' $$,
  '23514', 'Quote commercial mode and source lineage are immutable', 'lead origin cannot be replaced during client binding'
);
select throws_ok(
  $$ update public.quotes set client_id = 'cli_qline', source_run_id = 'run_qclient' where id = 'q_proposal_lead' $$,
  '23514', 'Quote commercial mode and source lineage are immutable', 'scanner lineage cannot change during client binding'
);
select lives_ok(
  $$ update public.quotes set client_id = 'cli_qline' where id = 'q_proposal_lead' $$,
  'lead-origin proposal_only quote permits one client binding'
);
select is(
  (select client_id from public.quotes where id = 'q_proposal_lead'),
  'cli_qline',
  'one-time client binding is persisted'
);
select throws_ok(
  $$ update public.quotes set client_id = 'cli_qother' where id = 'q_proposal_lead' $$,
  '23514', 'Quote client ownership is immutable after initial binding', 'bound client cannot be replaced'
);
select throws_ok(
  $$ update public.quotes set client_id = null where id = 'q_proposal_lead' $$,
  '23514', 'Quote client ownership is immutable after initial binding', 'bound client cannot be cleared'
);
select throws_ok(
  $$ update public.quotes set lead_id = null where id = 'q_proposal_lead' $$,
  '23514', 'Quote commercial mode and source lineage are immutable', 'lead origin cannot be cleared after client binding'
);
select throws_ok(
  $$ update public.quotes set client_id = 'cli_qother' where id = 'q_legacy_view' $$,
  '23514', 'Quote client ownership is immutable after initial binding', 'legacy quote client ownership is immutable'
);

insert into public.quote_items
  (id, quote_id, label, source_work_item_id, source_evidence_refs, pricing_type, recurrence_cadence, optional)
values
  ('qit_legacy', 'q_legacy_view', 'Legacy item', null, '[]'::jsonb, 'one_time', null, false),
  ('qit_proposal', 'q_proposal_client', 'Scanner work', 'snapshot-work-item:opaque-1', '["evidence:opaque-1"]'::jsonb, 'recurring', 'monthly', true);

select is(
  (select source_work_item_id from public.quote_items where id = 'qit_proposal'),
  'snapshot-work-item:opaque-1',
  'opaque source work-item identifiers are accepted without an FK'
);
select throws_ok(
  $$ insert into public.quote_items (id, quote_id, label, source_evidence_refs)
     values ('qit_bad_evidence', 'q_proposal_client', 'Bad evidence', '{}'::jsonb) $$,
  '23514', null, 'source evidence refs must be a JSON array'
);
select throws_ok(
  $$ insert into public.quote_items (id, quote_id, label, pricing_type, recurrence_cadence)
     values ('qit_bad_cadence', 'q_proposal_client', 'Bad cadence', 'one_time', 'monthly') $$,
  '23514', null, 'one-time items reject recurring cadence'
);
select throws_ok(
  $$ update public.quote_items set source_work_item_id = 'snapshot-work-item:other' where id = 'qit_proposal' $$,
  '23514', 'Quote item source lineage is immutable', 'quote-item source lineage cannot be repointed'
);

-- ---- authoritative client isolation + legacy compatibility ------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","app_metadata":{"role":"client_admin","client_id":"cli_qline"}}',
  true
);
set local role authenticated;

select is((select count(*)::int from public.quotes), 3, 'client reads own sent legacy quotes only');
select is((select count(*)::int from public.quotes where commercial_mode = 'proposal_only'), 0, 'client cannot read proposal_only quote');
select is((select count(*)::int from public.quotes where id = 'q_proposal_both'), 0, 'client cannot read proposal_only with both lead and client');
select is((select count(*)::int from public.quote_items), 1, 'client reads legacy quote items only');
select is((select count(*)::int from public.quote_items where id = 'qit_proposal'), 0, 'client cannot read proposal_only quote items');

select is(public.bl_client_quote_action('q_legacy_view', 'view')::text, 'viewed', 'client can view own legacy quote');
select is(public.bl_client_quote_action('q_legacy_view', 'accept')::text, 'accepted', 'client can accept own legacy quote');
select is(public.bl_client_quote_action('q_legacy_reject', 'reject')::text, 'rejected', 'client can reject own legacy quote');
select is(public.bl_client_quote_action('q_legacy_revise', 'view')::text, 'viewed', 'client can view legacy quote before revision request');
select is(public.bl_client_quote_action('q_legacy_revise', 'revise')::text, 'revision_requested', 'client can request revision on own legacy quote');

select throws_ok(
  $$ select public.bl_client_quote_action('q_proposal_lead', 'view') $$,
  '42501', 'Quote is not client actionable', 'client cannot view proposal_only via RPC'
);
select throws_ok(
  $$ select public.bl_client_quote_action('q_proposal_lead', 'accept') $$,
  '42501', 'Quote is not client actionable', 'client cannot accept proposal_only'
);
select throws_ok(
  $$ select public.bl_client_quote_action('q_proposal_lead', 'reject') $$,
  '42501', 'Quote is not client actionable', 'client cannot reject proposal_only'
);
select throws_ok(
  $$ select public.bl_client_quote_action('q_proposal_lead', 'revise') $$,
  '42501', 'Quote is not client actionable', 'client cannot request revision on proposal_only'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}',
  true
);
set local role authenticated;
select is((select count(*)::int from public.quotes where commercial_mode = 'proposal_only'), 3, 'internal owner can read proposal_only quotes');
select is((select count(*)::int from public.quote_items where id = 'qit_proposal'), 1, 'internal owner can read proposal_only items');
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;
select is((select count(*)::int from public.quotes where commercial_mode = 'proposal_only'), 3, 'internal admin can read proposal_only quotes');
reset role;

select * from finish();
rollback;
