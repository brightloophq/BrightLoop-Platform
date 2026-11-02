-- =============================================================================
-- Increment 3: approved scanner package -> canonical proposal_only draft quote.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_promo', 'Promotion Client');
insert into public.leads (id, name, company, email) values ('lead_promo', 'Lead', 'Promotion Lead', 'lead-promo@example.test');
insert into public.conversations (id, client_id, subject) values ('conv_promo_collision', 'cli_promo', 'Collision fixture');
insert into auth.users (id) values
  ('30000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002');
insert into public.users (id, auth_user_id, name, email, role, client_id, status) values
  ('usr_promo_owner', '30000000-0000-0000-0000-000000000001', 'Promotion Owner', 'promo-owner@example.test', 'owner', null, 'active'),
  ('usr_promo_client', '30000000-0000-0000-0000-000000000002', 'Promotion Client', 'promo-client@example.test', 'client_admin', 'cli_promo', 'active');

insert into public.intelligence_runs (id, lead_id, scan_id, status, idempotency_key, created_by) values
  ('run_promo_lead', 'lead_promo', 'scan_promo_lead', 'completed', 'idem_promo_lead', 'usr_promo_owner'),
  ('run_promo_bad_status', 'lead_promo', 'scan_promo_bad_status', 'discovering', 'idem_promo_bad_status', 'usr_promo_owner'),
  ('run_promo_superseded', 'lead_promo', 'scan_promo_superseded', 'completed', 'idem_promo_superseded', 'usr_promo_owner'),
  ('run_promo_rejected', 'lead_promo', 'scan_promo_rejected', 'completed', 'idem_promo_rejected', 'usr_promo_owner'),
  ('run_promo_missing', 'lead_promo', 'scan_promo_missing', 'completed', 'idem_promo_missing', 'usr_promo_owner'),
  ('run_promo_rollback', 'lead_promo', 'scan_promo_rollback', 'completed', 'idem_promo_rollback', 'usr_promo_owner'),
  ('run_promo_pk_collision', 'lead_promo', 'scan_promo_pk_collision', 'completed', 'idem_promo_pk_collision', 'usr_promo_owner');
insert into public.intelligence_runs (id, client_id, scan_id, status, idempotency_key, created_by) values
  ('run_promo_client', 'cli_promo', 'scan_promo_client', 'completed', 'idem_promo_client', 'usr_promo_owner');

insert into public.proposal_versions
  (id, run_id, client_id, scan_id, status, version, checksum, envelope, idempotency_key, created_by)
values
  ('pv_promo_lead', 'run_promo_lead', null, 'scan_promo_lead', 'needs_review', 1, 'checksum-lead',
   '{"status":"draft_ready","commercialState":"priced","recommendedWork":[{"sourceId":"work:one","title":"Improve conversion","solution":"Simplify checkout","evidenceIds":["ev:1","ev:2"]},{"sourceId":"work:two","title":"Improve discovery","solution":"Add search","evidenceIds":["ev:3"]}],"pricing":{"pricingModelVersion":2,"currency":"USD","validUntil":"2099-12-31","discountMinor":0,"subtotalOneTimeMinor":2000,"totalOneTimeMinor":2000,"totalRecurringMonthlyMinor":0,"items":[{"sourceId":"work:one","pricingType":"one_time","amountMinor":1000,"quantity":1,"optional":false,"selected":false,"cadence":null},{"sourceId":"work:two","pricingType":"one_time","amountMinor":1000,"quantity":1,"optional":false,"selected":false,"cadence":null}]}}'::jsonb, 'idem_pv_lead', 'usr_promo_owner'),
  ('pv_promo_client', 'run_promo_client', 'cli_promo', 'scan_promo_client', 'needs_review', 1, 'checksum-client',
   '{"status":"draft_ready","commercialState":"priced","recommendedWork":[{"sourceId":"work:client","title":"Client work","solution":"Deliver change","evidenceIds":["ev:c"]}],"pricing":{"pricingModelVersion":2,"currency":"USD","validUntil":"2099-12-31","discountMinor":0,"subtotalOneTimeMinor":100,"totalOneTimeMinor":100,"totalRecurringMonthlyMinor":0,"items":[{"sourceId":"work:client","pricingType":"one_time","amountMinor":100,"quantity":1,"optional":false,"selected":false,"cadence":null}]}}'::jsonb, 'idem_pv_client', 'usr_promo_owner'),
  ('pv_promo_bad_status', 'run_promo_bad_status', null, 'scan_promo_bad_status', 'needs_review', 1, 'checksum-bad-run',
   '{"status":"draft_ready","recommendedWork":[{"sourceId":"w","title":"Work","solution":"Do it","evidenceIds":["e"]}]}'::jsonb, 'idem_pv_bad_run', 'usr_promo_owner'),
  ('pv_promo_not_review', 'run_promo_missing', null, 'scan_promo_missing', 'approved', 1, 'checksum-not-review',
   '{"status":"draft_ready","recommendedWork":[{"sourceId":"w","title":"Work","solution":"Do it","evidenceIds":["e"]}]}'::jsonb, 'idem_pv_not_review', 'usr_promo_owner'),
  ('pv_promo_not_ready', 'run_promo_missing', null, 'scan_promo_missing', 'needs_review', 2, 'checksum-not-ready',
   '{"status":"insufficient_evidence","recommendedWork":[{"sourceId":"w","title":"Work","solution":"Do it","evidenceIds":["e"]}]}'::jsonb, 'idem_pv_not_ready', 'usr_promo_owner'),
  ('pv_promo_empty', 'run_promo_missing', null, 'scan_promo_missing', 'needs_review', 3, 'checksum-empty',
   '{"status":"draft_ready","recommendedWork":[]}'::jsonb, 'idem_pv_empty', 'usr_promo_owner'),
  ('pv_promo_superseded', 'run_promo_superseded', null, 'scan_promo_superseded', 'needs_review', 1, 'checksum-super',
   '{"status":"draft_ready","recommendedWork":[{"sourceId":"w","title":"Work","solution":"Do it","evidenceIds":["e"]}]}'::jsonb, 'idem_pv_super', 'usr_promo_owner'),
  ('pv_promo_rejected', 'run_promo_rejected', null, 'scan_promo_rejected', 'needs_review', 1, 'checksum-rejected',
   '{"status":"draft_ready","recommendedWork":[{"sourceId":"w","title":"Work","solution":"Do it","evidenceIds":["e"]}]}'::jsonb, 'idem_pv_rejected', 'usr_promo_owner'),
  ('pv_promo_missing', 'run_promo_missing', null, 'scan_promo_missing', 'needs_review', 4, 'checksum-missing',
   '{"status":"draft_ready","recommendedWork":[{"sourceId":"w","title":"Work","solution":"Do it","evidenceIds":["e"]}]}'::jsonb, 'idem_pv_missing', 'usr_promo_owner'),
  ('pv_promo_rollback', 'run_promo_rollback', null, 'scan_promo_rollback', 'needs_review', 1, 'checksum-rollback',
   '{"status":"draft_ready","recommendedWork":[{"sourceId":"w","title":"Work","solution":"Do it","evidenceIds":["e"]}]}'::jsonb, 'idem_pv_rollback', 'usr_promo_owner'),
  ('pv_promo_pk_collision', 'run_promo_pk_collision', null, 'scan_promo_pk_collision', 'needs_review', 1, 'checksum-pk-collision',
   '{"status":"draft_ready","recommendedWork":[{"sourceId":"w","title":"Collision work","solution":"Do it","evidenceIds":["e"]}]}'::jsonb, 'idem_pv_pk_collision', 'usr_promo_owner');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"30000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}', true);
insert into public.narrative_versions
  (id,run_id,client_id,scan_id,audience,status,version,checksum,envelope,idempotency_key,created_by)
values
  ('nv_promo_lead','run_promo_lead',null,'scan_promo_lead','client','ready',1,'nv-check-lead',
   '{"status":"ready","sections":[{"key":"summary","heading":"Summary","paragraphs":["Approved lead narrative."]}]}'::jsonb,'idem-nv-lead','usr_promo_owner'),
  ('nv_promo_client','run_promo_client','cli_promo','scan_promo_client','client','ready',1,'nv-check-client',
   '{"status":"ready","sections":[{"key":"summary","heading":"Summary","paragraphs":["Approved client narrative."]}]}'::jsonb,'idem-nv-client','usr_promo_owner');
insert into public.intelligence_artifacts
  (id,run_id,client_id,scan_id,kind,version,checksum,validation_status,envelope,idempotency_key,created_by)
values
  ('art_promo_lead','run_promo_lead',null,'scan_promo_lead','internal_intelligence_report',1,'art-check-lead','valid','{}'::jsonb,'idem-art-lead','usr_promo_owner'),
  ('art_promo_client','run_promo_client','cli_promo','scan_promo_client','internal_intelligence_report',1,'art-check-client','valid','{}'::jsonb,'idem-art-client','usr_promo_owner');

insert into public.runtime_events
  (id, event_type, run_id, aggregate_id, aggregate_type, client_id, scan_id, sequence, payload, actor)
values
  ('evt_promo_lead', 'runtime.review.approved', 'run_promo_lead', 'run_promo_lead', 'intelligence_run', null, 'scan_promo_lead', 1, jsonb_build_object('by','30000000-0000-0000-0000-000000000001','binding',public.bl_scanner_sales_current_binding('run_promo_lead')), null),
  ('evt_promo_client', 'runtime.review.approved', 'run_promo_client', 'run_promo_client', 'intelligence_run', 'cli_promo', 'scan_promo_client', 1, jsonb_build_object('by','30000000-0000-0000-0000-000000000001','binding',public.bl_scanner_sales_current_binding('run_promo_client')), null),
  ('evt_promo_bad_status', 'runtime.review.approved', 'run_promo_bad_status', 'run_promo_bad_status', 'intelligence_run', null, 'scan_promo_bad_status', 1, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalVersionId":"pv_promo_bad_status","proposalChecksum":"checksum-bad-run"}'::jsonb), null),
  ('evt_super_approved', 'runtime.review.approved', 'run_promo_superseded', 'run_promo_superseded', 'intelligence_run', null, 'scan_promo_superseded', 1, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalVersionId":"pv_promo_superseded","proposalChecksum":"checksum-super"}'::jsonb), null),
  ('evt_super_revision', 'runtime.review.revision_requested', 'run_promo_superseded', 'run_promo_superseded', 'intelligence_run', null, 'scan_promo_superseded', 2, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{}'::jsonb), null),
  ('evt_rejected', 'runtime.review.rejected', 'run_promo_rejected', 'run_promo_rejected', 'intelligence_run', null, 'scan_promo_rejected', 1, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{}'::jsonb), null),
  ('evt_missing_version', 'runtime.review.approved', 'run_promo_missing', 'run_promo_missing', 'intelligence_run', null, 'scan_promo_missing', 1, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalChecksum":"checksum-missing"}'::jsonb), null),
  ('evt_missing_checksum', 'runtime.review.approved', 'run_promo_missing', 'run_promo_missing', 'intelligence_run', null, 'scan_promo_missing', 2, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalVersionId":"pv_promo_missing"}'::jsonb), null),
  ('evt_checksum_bad', 'runtime.review.approved', 'run_promo_missing', 'run_promo_missing', 'intelligence_run', null, 'scan_promo_missing', 3, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalVersionId":"pv_promo_missing","proposalChecksum":"wrong"}'::jsonb), null),
  ('evt_not_review', 'runtime.review.approved', 'run_promo_missing', 'run_promo_missing', 'intelligence_run', null, 'scan_promo_missing', 4, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalVersionId":"pv_promo_not_review","proposalChecksum":"checksum-not-review"}'::jsonb), null),
  ('evt_not_ready', 'runtime.review.approved', 'run_promo_missing', 'run_promo_missing', 'intelligence_run', null, 'scan_promo_missing', 5, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalVersionId":"pv_promo_not_ready","proposalChecksum":"checksum-not-ready"}'::jsonb), null),
  ('evt_empty', 'runtime.review.approved', 'run_promo_missing', 'run_promo_missing', 'intelligence_run', null, 'scan_promo_missing', 6, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalVersionId":"pv_promo_empty","proposalChecksum":"checksum-empty"}'::jsonb), null),
  ('evt_promo_rollback', 'runtime.review.approved', 'run_promo_rollback', 'run_promo_rollback', 'intelligence_run', null, 'scan_promo_rollback', 1, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalVersionId":"pv_promo_rollback","proposalChecksum":"checksum-rollback"}'::jsonb), null),
  ('evt_promo_pk_collision', 'runtime.review.approved', 'run_promo_pk_collision', 'run_promo_pk_collision', 'intelligence_run', null, 'scan_promo_pk_collision', 1, (jsonb_build_object('by','30000000-0000-0000-0000-000000000001') || '{"proposalVersionId":"pv_promo_pk_collision","proposalChecksum":"checksum-pk-collision"}'::jsonb), null);

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

create temporary table promotion_baseline as
select
  (select count(*)::int from public.clients) as client_count,
  (select count(*)::int from public.leads) as lead_count;

select is(
  (select prosecdef from pg_proc where oid='public.bl_promote_scanner_package(text,text,text,text,text)'::regprocedure),
  false,
  'promotion RPC is SECURITY INVOKER'
);
select is(has_function_privilege('anon', 'public.bl_promote_scanner_package(text,text,text,text,text)', 'EXECUTE'), false, 'anon cannot execute promotion RPC');
select is(has_function_privilege('authenticated', 'public.bl_promote_scanner_package(text,text,text,text,text)', 'EXECUTE'), true, 'authenticated sessions may invoke the independently authorized RPC');

select results_eq(
  $$ select outcome, quote_id, item_count from public.bl_promote_scanner_package('run_promo_lead','pv_promo_lead','evt_promo_lead','promo:run_promo_lead:pv_promo_lead:evt_promo_lead','qte_promo_lead') $$,
  $$ values ('created'::text, 'qte_promo_lead'::text, 2::integer) $$,
  'lead-owned approved package creates a two-item draft quote'
);
select is((select commercial_mode from public.quotes where id='qte_promo_lead'), 'proposal_only', 'promoted quote uses proposal_only mode');
select is((select status::text from public.quotes where id='qte_promo_lead'), 'draft', 'promoted quote starts in draft');
select is((select lead_id from public.quotes where id='qte_promo_lead'), 'lead_promo', 'lead ownership is copied from run');
select is((select client_id from public.quotes where id='qte_promo_lead'), null, 'lead promotion creates no client ownership');
select is((select conversation_id from public.quotes where id='qte_promo_lead'), null, 'lead promotion creates no conversation');
select is((select count(*)::int from public.clients), (select client_count from promotion_baseline), 'promotion creates no client');
select is((select count(*)::int from public.leads), (select lead_count from promotion_baseline), 'promotion creates no lead');
select results_eq(
  $$ select source_run_id, source_proposal_version_id, source_review_event_id, promotion_key from public.quotes where id='qte_promo_lead' $$,
  $$ values ('run_promo_lead'::text,'pv_promo_lead'::text,'evt_promo_lead'::text,'promo:run_promo_lead:pv_promo_lead:evt_promo_lead'::text) $$,
  'exact scanner and approval lineage is persisted'
);
select results_eq(
  $$ select label, description, sort, source_work_item_id, source_evidence_refs, quantity, unit_amount, amount, pricing_type, recurrence_cadence, optional, module_id from public.quote_items where quote_id='qte_promo_lead' order by sort $$,
  $$ values
    ('Improve conversion'::text,'Simplify checkout'::text,0,'work:one'::text,'["ev:1","ev:2"]'::jsonb,1,1000::bigint,1000::bigint,'one_time'::text,null::text,false,null::text),
    ('Improve discovery'::text,'Add search'::text,1,'work:two'::text,'["ev:3"]'::jsonb,1,1000::bigint,1000::bigint,'one_time'::text,null::text,false,null::text) $$,
  'approved v2 pricing is copied to canonical quote items'
);
select is((select bool_and(jsonb_typeof(source_evidence_refs)='array') from public.quote_items where quote_id='qte_promo_lead'), true, 'evidence references remain JSON arrays');
select results_eq($$ select subtotal,discount,total from public.quotes where id='qte_promo_lead' $$, $$ values (2000::bigint,0::bigint,2000::bigint) $$, 'quote totals derive from the approved scanner pricing snapshot');
select is((select count(*)::int from public.runtime_events where event_type='runtime.commercial.package_promoted' and aggregate_id='run_promo_lead'), 1, 'successful promotion appends one audit event');
select results_eq(
  $$ select payload->>'quoteId', payload->>'proposalVersionId', payload->>'reviewEventId', (payload->>'itemCount')::int from public.runtime_events where event_type='runtime.commercial.package_promoted' and aggregate_id='run_promo_lead' $$,
  $$ values ('qte_promo_lead'::text,'pv_promo_lead'::text,'evt_promo_lead'::text,2::int) $$,
  'promotion audit payload records the canonical coordinates and item count'
);
select is((select count(*)::int from public.quote_revisions where quote_id='qte_promo_lead'), 0, 'promotion does not invent an initial quote revision');
select results_eq($$ select checksum,envelope->>'status' from public.proposal_versions where id='pv_promo_lead' $$, $$ values ('checksum-lead'::text,'draft_ready'::text) $$, 'promotion never mutates scanner proposal source material');

select results_eq(
  $$ select outcome, quote_id, item_count from public.bl_promote_scanner_package('run_promo_lead','pv_promo_lead','evt_promo_lead','promo:run_promo_lead:pv_promo_lead:evt_promo_lead','qte_retry_unused') $$,
  $$ values ('already_promoted'::text, 'qte_promo_lead'::text, 2::integer) $$,
  'same promotion retry returns the existing quote'
);
select is((select count(*)::int from public.quote_items where quote_id='qte_promo_lead'), 2, 'retry does not duplicate items');
select is((select count(*)::int from public.runtime_events where event_type='runtime.commercial.package_promoted' and aggregate_id='run_promo_lead'), 1, 'retry does not duplicate audit event');

insert into public.runtime_events (id,event_type,run_id,aggregate_id,aggregate_type,scan_id,sequence,payload,actor)
values ('evt_promo_lead_reapproved','runtime.review.approved','run_promo_lead','run_promo_lead','intelligence_run','scan_promo_lead',3,
  jsonb_build_object('by','30000000-0000-0000-0000-000000000001','binding',public.bl_scanner_sales_current_binding('run_promo_lead')),null);
select throws_ok(
  $$ select * from public.bl_promote_scanner_package('run_promo_lead','pv_promo_lead','evt_promo_lead_reapproved','not-deterministic','qte_wrong_key') $$,
  '23514', 'Invalid promotion key', 'promotion rejects a non-deterministic key'
);
select results_eq(
  $$ select outcome, quote_id, item_count from public.bl_promote_scanner_package('run_promo_lead','pv_promo_lead','evt_promo_lead_reapproved','promo:run_promo_lead:pv_promo_lead:evt_promo_lead_reapproved','qte_reapproval_unused') $$,
  $$ values ('already_promoted'::text, 'qte_promo_lead'::text, 2::integer) $$,
  're-approval cannot duplicate the same proposal version'
);

insert into public.proposal_versions
  (id, run_id, client_id, scan_id, status, version, checksum, envelope, idempotency_key, created_by)
values
  ('pv_promo_lead_v2', 'run_promo_lead', null, 'scan_promo_lead', 'needs_review', 2, 'checksum-lead-v2',
   '{"status":"draft_ready","commercialState":"priced","recommendedWork":[{"sourceId":"work:v2","title":"New version work","solution":"Deliver the new scope","evidenceIds":["ev:v2"]}],"pricing":{"pricingModelVersion":2,"currency":"USD","validUntil":"2099-12-31","discountMinor":0,"subtotalOneTimeMinor":250,"totalOneTimeMinor":250,"totalRecurringMonthlyMinor":0,"items":[{"sourceId":"work:v2","pricingType":"one_time","amountMinor":250,"quantity":1,"optional":false,"selected":false,"cadence":null}]}}'::jsonb,
   'idem_pv_lead_v2', 'usr_promo_owner');
insert into public.runtime_events (id,event_type,run_id,aggregate_id,aggregate_type,scan_id,sequence,payload,actor)
values ('evt_promo_lead_v2','runtime.review.approved','run_promo_lead','run_promo_lead','intelligence_run','scan_promo_lead',4,
  jsonb_build_object('by','30000000-0000-0000-0000-000000000001','binding',public.bl_scanner_sales_current_binding('run_promo_lead')),null);
select results_eq(
  $$ select outcome, quote_id, item_count from public.bl_promote_scanner_package('run_promo_lead','pv_promo_lead_v2','evt_promo_lead_v2','promo:run_promo_lead:pv_promo_lead_v2:evt_promo_lead_v2','qte_promo_lead_v2') $$,
  $$ values ('created'::text, 'qte_promo_lead_v2'::text, 1::integer) $$,
  'a new immutable proposal version on the same run creates a second quote'
);
select is((select source_run_id from public.quotes where id='qte_promo_lead_v2'), 'run_promo_lead', 'second quote retains the same source run');
select isnt((select source_proposal_version_id from public.quotes where id='qte_promo_lead'), (select source_proposal_version_id from public.quotes where id='qte_promo_lead_v2'), 'same-run quotes pin different proposal versions');
select is((select count(*)::int from public.quotes where source_run_id='run_promo_lead'), 2, 'both same-run promoted quotes persist');

select results_eq(
  $$ select outcome, quote_id, item_count from public.bl_promote_scanner_package('run_promo_client','pv_promo_client','evt_promo_client','promo:run_promo_client:pv_promo_client:evt_promo_client','qte_promo_client') $$,
  $$ values ('created'::text, 'qte_promo_client'::text, 1::integer) $$,
  'client-owned approved package creates a draft quote'
);
select results_eq($$ select client_id,lead_id,conversation_id from public.quotes where id='qte_promo_client' $$, $$ values ('cli_promo'::text,null::text,null::text) $$, 'client ownership is copied without a conversation');

select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_superseded','pv_promo_superseded','evt_super_approved','promo:run_promo_superseded:pv_promo_superseded:evt_super_approved','qte_super') $$, '23514', 'Review event is not the authoritative decision', 'superseded approval is rejected');
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_rejected','pv_promo_rejected','evt_rejected','promo:run_promo_rejected:pv_promo_rejected:evt_rejected','qte_rejected') $$, '23514', 'Current package decision is not approved', 'latest rejected decision is rejected');
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_bad_status','pv_promo_bad_status','evt_promo_bad_status','promo:run_promo_bad_status:pv_promo_bad_status:evt_promo_bad_status','qte_bad_status') $$, '23514', 'Intelligence run is not completed', 'incomplete run is rejected');
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_missing','pv_promo_not_review','evt_not_review','promo:run_promo_missing:pv_promo_not_review:evt_not_review','qte_not_review') $$, '23514', 'Proposal version is not awaiting review', 'proposal not in needs_review is rejected');
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_missing','pv_promo_not_ready','evt_not_ready','promo:run_promo_missing:pv_promo_not_ready:evt_not_ready','qte_not_ready') $$, '23514', 'Proposal is not draft ready', 'proposal not draft_ready is rejected');
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_missing','pv_promo_empty','evt_empty','promo:run_promo_missing:pv_promo_empty:evt_empty','qte_empty') $$, '23514', 'Proposal has no recommended work', 'empty recommendedWork is rejected');
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_lead','pv_promo_client','evt_promo_lead_reapproved','promo:run_promo_lead:pv_promo_client:evt_promo_lead_reapproved','qte_wrong_proposal_run') $$, '23514', 'Proposal version does not belong to run', 'wrong-run proposal version is rejected');
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_lead','pv_promo_lead','evt_promo_client','promo:run_promo_lead:pv_promo_lead:evt_promo_client','qte_wrong_review_run') $$, '23514', 'Review event is not the authoritative decision', 'wrong-run review event is rejected');

insert into public.runtime_events (id,event_type,run_id,aggregate_id,aggregate_type,scan_id,sequence,payload,actor)
values ('evt_missing_version_latest','runtime.review.approved','run_promo_missing','run_promo_missing','intelligence_run','scan_promo_missing',7,
  '{"by":"30000000-0000-0000-0000-000000000001","proposalChecksum":"checksum-missing"}',null);
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_missing','pv_promo_missing','evt_missing_version_latest','promo:run_promo_missing:pv_promo_missing:evt_missing_version_latest','qte_missing_version') $$, '23514', 'Approval does not pin proposal version', 'current approval without proposalVersionId is rejected');
insert into public.runtime_events (id,event_type,run_id,aggregate_id,aggregate_type,scan_id,sequence,payload,actor)
values ('evt_missing_checksum_latest','runtime.review.approved','run_promo_missing','run_promo_missing','intelligence_run','scan_promo_missing',8,
  '{"by":"30000000-0000-0000-0000-000000000001","proposalVersionId":"pv_promo_missing"}',null);
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_missing','pv_promo_missing','evt_missing_checksum_latest','promo:run_promo_missing:pv_promo_missing:evt_missing_checksum_latest','qte_missing_checksum') $$, '23514', 'Approval proposal checksum mismatch', 'current approval without proposalChecksum is rejected');
insert into public.runtime_events (id,event_type,run_id,aggregate_id,aggregate_type,scan_id,sequence,payload,actor)
values ('evt_checksum_bad_latest','runtime.review.approved','run_promo_missing','run_promo_missing','intelligence_run','scan_promo_missing',9,
  '{"by":"30000000-0000-0000-0000-000000000001","proposalVersionId":"pv_promo_missing","proposalChecksum":"wrong"}',null);
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_missing','pv_promo_missing','evt_checksum_bad_latest','promo:run_promo_missing:pv_promo_missing:evt_checksum_bad_latest','qte_checksum') $$, '23514', 'Approval proposal checksum mismatch', 'checksum is compared with proposal_versions.checksum');
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_missing','pv_promo_empty','evt_empty','wrong-key','qte_wrong_key') $$, '23514', 'Proposal has no recommended work', 'invalid package remains rejected before key use');

select lives_ok($$ update public.quotes set status='internal_review' where id='qte_promo_lead' $$, 'proposal_only allows internal_review');
select lives_ok($$ update public.quotes set status='draft' where id='qte_promo_lead' $$, 'proposal_only can return to draft through existing transition');
select throws_ok($$ update public.quotes set status='sent' where id='qte_promo_lead' $$, '23514', null, 'proposal_only cannot enter sent');
select throws_ok($$ update public.quotes set status='viewed' where id='qte_promo_lead' $$, '23514', null, 'proposal_only cannot enter viewed');
select throws_ok($$ update public.quotes set status='revision_requested' where id='qte_promo_lead' $$, '23514', null, 'proposal_only cannot enter revision_requested');
select throws_ok($$ update public.quotes set status='revised' where id='qte_promo_lead' $$, '23514', null, 'proposal_only cannot enter revised');
select throws_ok($$ update public.quotes set status='accepted' where id='qte_promo_lead' $$, '23514', null, 'proposal_only cannot enter accepted');
select throws_ok($$ update public.quotes set status='rejected' where id='qte_promo_lead' $$, '23514', null, 'proposal_only cannot enter rejected');
select throws_ok($$ update public.quotes set status='expired' where id='qte_promo_lead' $$, '23514', null, 'proposal_only cannot enter expired');
select throws_ok($$ insert into public.quotes (id,conversation_id,client_id,commercial_mode,source_run_id,source_proposal_version_id,source_review_event_id,promotion_key) values ('q_bad_legacy_lineage',null,'cli_promo','legacy_client_quote','run_promo_client','pv_promo_client','evt_promo_client','bad') $$, '23514', null, 'legacy quote cannot carry scanner lineage');
select throws_ok($$ insert into public.quotes (id,lead_id,commercial_mode,source_run_id,source_proposal_version_id,source_review_event_id) values ('q_missing_key','lead_promo','proposal_only','run_promo_lead','pv_promo_lead','evt_promo_lead') $$, '23514', null, 'proposal_only requires promotion_key');
select throws_ok($$ update public.quotes set source_run_id='run_promo_client' where id='qte_promo_lead' $$, '23514', 'Quote commercial mode and source lineage are immutable', 'promoted quote lineage remains immutable');
select throws_ok($$ update public.quote_items set source_work_item_id='changed' where quote_id='qte_promo_lead' and sort=0 $$, '23514', 'Quote item source lineage is immutable', 'promoted item lineage remains immutable');

-- Force an audit-event primary-key collision after quote/items insert; the whole RPC rolls back.
insert into public.runtime_events (id,event_type,aggregate_id,aggregate_type,sequence,payload,actor)
values ('evt_promoted_' || md5('promo:run_promo_rollback:pv_promo_rollback:evt_promo_rollback'),'test.collision','collision','test',1,'{}','usr_promo_owner');
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_rollback','pv_promo_rollback','evt_promo_rollback','promo:run_promo_rollback:pv_promo_rollback:evt_promo_rollback','qte_rollback') $$, '23505', null, 'audit append failure is not swallowed');
select is((select count(*)::int from public.quotes where id='qte_rollback'), 0, 'audit append failure rolls back quote');
select is((select count(*)::int from public.quote_items where quote_id='qte_rollback'), 0, 'audit append failure rolls back items');

-- A real simultaneous-session convergence branch cannot be deterministically
-- orchestrated in this single-session pgTAP harness. Its safety rests on the two
-- DB uniqueness invariants plus PostgreSQL READ COMMITTED visibility. This covers
-- the independently testable handler branch: an unrelated unique violation must
-- be re-raised rather than misreported as already_promoted.
insert into public.quotes (id,conversation_id,client_id,title,status)
values ('qte_pk_collision','conv_promo_collision','cli_promo','Unrelated legacy quote','draft');
select throws_ok(
  $$ select * from public.bl_promote_scanner_package('run_promo_pk_collision','pv_promo_pk_collision','evt_promo_pk_collision','promo:run_promo_pk_collision:pv_promo_pk_collision:evt_promo_pk_collision','qte_pk_collision') $$,
  '23505', null, 'unrelated quote-id unique violation is re-raised'
);
select is((select count(*)::int from public.quotes where source_proposal_version_id='pv_promo_pk_collision'), 0, 're-raised collision creates no promoted quote');

reset role;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000002","app_metadata":{"role":"client_admin","client_id":"cli_promo"}}', true);
set local role authenticated;
select throws_ok($$ select * from public.bl_promote_scanner_package('run_promo_client','pv_promo_client','evt_promo_client','promo:run_promo_client:pv_promo_client:evt_promo_client','qte_client_denied') $$, '42501', 'Internal actor required', 'client caller is rejected first with 42501');
select is((select count(*)::int from public.quotes where id='qte_promo_client'), 0, 'client cannot read promoted quote');
select is((select count(*)::int from public.quote_items where quote_id='qte_promo_client'), 0, 'client cannot read promoted quote items');
select throws_ok($$ select public.bl_client_quote_action('qte_promo_client','view') $$, '42501', 'Quote is not client actionable', 'client quote RPC refuses promoted quote');
reset role;

select * from finish();
rollback;
