-- Canonical issuance for scanner-origin quotes is reached only through the
-- explicit quote publication boundary. Legacy proposal behavior is covered
-- separately below and remains unchanged.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.clients(id,company,lifecycle) values
  ('cli_issue','Issued Client','prospect'),('cli_issue_other','Other Client','member');
insert into public.leads(id,name,company,email) values
  ('lead_issue','Lead','Lead Origin','issue@example.test');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('50000000-0000-0000-0000-000000000001','authenticated','authenticated','issue-owner@example.test',now(),'{}','{}',now(),now()),
 ('50000000-0000-0000-0000-000000000002','authenticated','authenticated','issue-client@example.test',now(),'{"role":"client_admin","client_id":"cli_issue"}','{}',now(),now()),
 ('50000000-0000-0000-0000-000000000003','authenticated','authenticated','issue-team@example.test',now(),'{"role":"team_member"}','{}',now(),now()),
 ('50000000-0000-0000-0000-000000000004','authenticated','authenticated','issue-other@example.test',now(),'{"role":"client_admin","client_id":"cli_issue_other"}','{}',now(),now());
insert into public.users(id,auth_user_id,name,email,role,client_id,status) values
 ('usr_issue_owner','50000000-0000-0000-0000-000000000001','Owner','issue-owner@example.test','owner',null,'active'),
 ('usr_issue_client','50000000-0000-0000-0000-000000000002','Client','issue-client@example.test','client_admin','cli_issue','active'),
 ('usr_issue_team','50000000-0000-0000-0000-000000000003','Team','issue-team@example.test','team_member',null,'active'),
 ('usr_issue_other','50000000-0000-0000-0000-000000000004','Other','issue-other@example.test','client_admin','cli_issue_other','active');
insert into public.intelligence_runs(id,lead_id,scan_id,status,idempotency_key,created_by)
values ('run_issue','lead_issue','scan_issue','completed','idem_issue','usr_issue_owner');
insert into public.proposal_versions(id,run_id,scan_id,status,version,checksum,envelope,idempotency_key,created_by)
values ('pv_issue','run_issue','scan_issue','needs_review',1,'sum-issue',jsonb_build_object(
  'status','draft_ready','commercialState','priced',
  'recommendedWork',jsonb_build_array(
    jsonb_build_object('sourceId','work:issue','title','Work','solution','Scope','evidenceIds',jsonb_build_array('ev:issue')),
    jsonb_build_object('sourceId','work:support','title','Support','solution','Monthly support','evidenceIds',jsonb_build_array('ev:support')),
    jsonb_build_object('sourceId','work:optional','title','Optional','solution','Optional support','evidenceIds',jsonb_build_array('ev:optional'))),
  'pricing',jsonb_build_object('pricingModelVersion',2,'currency','USD','validUntil',(current_date+30)::text,
    'discountMinor',200,'subtotalOneTimeMinor',2000,'totalOneTimeMinor',1800,'totalRecurringMonthlyMinor',500,
    'commercialNotes','Approved client note','items',jsonb_build_array(
      jsonb_build_object('sourceId','work:issue','pricingType','one_time','amountMinor',1000,'quantity',2,'optional',false,'selected',false,'cadence',null),
      jsonb_build_object('sourceId','work:support','pricingType','recurring','amountMinor',500,'quantity',1,'optional',false,'selected',false,'cadence','monthly'),
      jsonb_build_object('sourceId','work:optional','pricingType','recurring','amountMinor',300,'quantity',1,'optional',true,'selected',false,'cadence','monthly')))),
  'idem_pv_issue','usr_issue_owner');
insert into public.narrative_versions(id,run_id,scan_id,audience,status,version,checksum,envelope,idempotency_key,created_by)
values ('nv_issue','run_issue','scan_issue','client','ready',1,'sum-narrative-issue',
  '{"status":"ready","sections":[{"key":"summary","heading":"Summary","paragraphs":["Approved narrative."]}]}'::jsonb,
  'idem_nv_issue','usr_issue_owner');
insert into public.intelligence_artifacts(id,run_id,scan_id,kind,version,checksum,validation_status,envelope,idempotency_key,created_by)
values ('art_issue_report','run_issue','scan_issue','internal_intelligence_report',1,'sum-report-issue','valid','{}'::jsonb,
  'idem_report_issue','usr_issue_owner');
insert into public.runtime_events(id,event_type,run_id,stage,aggregate_id,aggregate_type,scan_id,sequence,payload)
values ('evt_issue_comp','runtime.commercial.stage_completed','run_issue','competitor_intelligence','run_issue','intelligence_run','scan_issue',1,'{"status":"insufficient_evidence"}');

-- Guarded review-event fixture uses a real active owner identity and signed test claims.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}',true);
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,scan_id,sequence,actor,payload)
values ('evt_issue','runtime.review.approved','run_issue','run_issue','intelligence_run','scan_issue',2,null,
  jsonb_build_object('by','50000000-0000-0000-0000-000000000001','binding',public.bl_scanner_sales_current_binding('run_issue')));
set local role authenticated;
select results_eq(
  $$select quote_id,outcome,item_count from public.bl_promote_scanner_package('run_issue','pv_issue','evt_issue','promo:run_issue:pv_issue:evt_issue','qte_issue')$$,
  $$values ('qte_issue'::text,'created'::text,3::integer)$$,
  'current version-bound approval promotes to a private quote before canonical issuance');
select is((select commercial_mode::text from public.quotes where id='qte_issue'),'proposal_only','scanner promotion creates a private proposal-only quote');
select is((select currency from public.quotes where id='qte_issue'),'USD','approved currency is preserved');
select is((select subtotal from public.quotes where id='qte_issue'),2000::bigint,'required one-time subtotal is preserved');
select is((select discount from public.quotes where id='qte_issue'),200::bigint,'discount is preserved');
select is((select total from public.quotes where id='qte_issue'),1800::bigint,'discounted total is preserved');
select is((select recurring_total from public.quotes where id='qte_issue'),500::bigint,'required recurring total is preserved');
select is((select optional_recurring_total from public.quotes where id='qte_issue'),300::bigint,'optional recurring total remains separately represented');
select throws_ok($$select * from public.bl_issue_canonical_proposal('qte_issue',(select updated_at from public.quotes where id='qte_issue'))$$,
  '42501','Scanner quotes issue only through explicit publication','direct canonical issuance cannot bypass publication');
select is((select count(*)::int from public.proposals where source_run_id='run_issue'),0,'no canonical proposal exists before publication');

-- Bind the lead-origin quote to the intended client, then refresh commercial approval
-- because binding changes the quote state after the first approval.
update public.quotes set status='internal_review' where id='qte_issue';
select lives_ok($$select * from public.bl_review_proposal_quote('qte_issue',(select updated_at from public.quotes where id='qte_issue'),'approve')$$,
  'owner separately approves scanner quote commercial terms');
select is((select commercial_approved_by from public.quotes where id='qte_issue'),'usr_issue_owner','commercial approver is recorded');
select lives_ok($$select * from public.bl_bind_proposal_quote_client('qte_issue','cli_issue',(select updated_at from public.quotes where id='qte_issue'))$$,
  'existing client is bound to the lead-origin quote');
select is((select lead_id from public.quotes where id='qte_issue'),'lead_issue','lead provenance survives client binding');
select is((select client_id from public.quotes where id='qte_issue'),'cli_issue','intended client is bound');
select lives_ok($$select * from public.bl_review_proposal_quote('qte_issue',(select updated_at from public.quotes where id='qte_issue'),'revoke')$$,
  'binding invalidates the prior quote approval');
select lives_ok($$select * from public.bl_review_proposal_quote('qte_issue',(select updated_at from public.quotes where id='qte_issue'),'approve')$$,
  'bound quote receives fresh commercial approval');
select is((select commercial_approved_state from public.quotes where id='qte_issue'),(select updated_at from public.quotes where id='qte_issue'),
  'commercial approval pins the current quote state');
update public.clients set lifecycle='member' where id='cli_issue';
create temporary table issued_result as
select public.bl_publish_scanner_quote('qte_issue',(select updated_at from public.quotes where id='qte_issue'),
  'cli_issue','usr_issue_client','USD',1800,current_date+30) as result;
select is((select (result->>'published')::boolean from issued_result),true,'explicit owner publication issues the canonical proposal');
select is((select proposal_kind::text from public.proposals where id=(select result->>'proposalId' from issued_result)),'canonical_issued','canonical discriminator is persisted');
select is((select status::text from public.proposals where id=(select result->>'proposalId' from issued_result)),'issued','canonical proposal remains issued');
select is((select subtotal from public.proposals where id=(select result->>'proposalId' from issued_result)),2000::bigint,'required subtotal is snapshotted');
select is((select total from public.proposals where id=(select result->>'proposalId' from issued_result)),1800::bigint,'discounted one-time total is snapshotted');
select is((select recurring_total from public.proposals where id=(select result->>'proposalId' from issued_result)),500::bigint,'recurring total is snapshotted');
select is((select optional_recurring_total from public.proposals where id=(select result->>'proposalId' from issued_result)),300::bigint,'optional recurring total is snapshotted separately');
select is((select count(*)::int from public.proposal_items where proposal_id=(select result->>'proposalId' from issued_result)),3,'all approved items are issued');
select is((select source_work_item_id from public.proposal_items where proposal_id=(select result->>'proposalId' from issued_result) and sort=0),'work:issue','work coordinate is copied');
select is((select source_evidence_refs from public.proposal_items where proposal_id=(select result->>'proposalId' from issued_result) and sort=0),'["ev:issue"]'::jsonb,'evidence coordinate is copied');
select matches((select result->>'proposalNumber' from issued_result),'^AUX-P-[0-9]{6}$','human-readable proposal number is generated');
select is((select proposal_id from public.quotes where id='qte_issue'),(select result->>'proposalId' from issued_result),'quote links to the issued proposal');
select is((select count(*)::int from public.scanner_sales_publications where proposal_id=(select result->>'proposalId' from issued_result)),1,'publication evidence is appended exactly once');
select is((select count(*)::int from public.transition_log where entity_id='qte_issue' and to_state='issued'),1,'issuance transition is audited once');
select is((public.bl_publish_scanner_quote('qte_issue',(select commercial_approved_state from public.quotes where id='qte_issue'),
  'cli_issue','usr_issue_client','USD',1800,current_date+30)->>'replayed')::boolean,true,'identical publication retry is idempotent');
select is((select count(*)::int from public.proposals where source_quote_id='qte_issue'),1,'retry does not duplicate canonical proposals');
select is((select count(*)::int from public.proposal_items where proposal_id=(select result->>'proposalId' from issued_result)),3,'retry does not duplicate proposal items');
select is((select count(*)::int from public.scanner_sales_publications where proposal_id=(select result->>'proposalId' from issued_result)),1,'retry does not duplicate publication evidence');
select throws_ok(format('update public.proposals set total=9 where id=%L',(select result->>'proposalId' from issued_result)),
  '23514','Canonical proposal commercial snapshot is immutable','canonical snapshot cannot be mutated');
select throws_ok(format($q$insert into public.contracts(id,proposal_id,client_id,status) values ('con_bad_canonical',%L,'cli_issue','pending')$q$,
  (select result->>'proposalId' from issued_result)),'23514','Canonical issued proposals cannot enter the legacy contract flow','canonical contract creation is firewalled');

-- Client access is current-offer scoped; client acceptance uses the dedicated
-- snapshot-bound scanner response rather than the legacy status-only action.
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000002","app_metadata":{"role":"client_admin","client_id":"cli_issue"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals where proposal_kind='canonical_issued'),1,'owning client can read the issued proposal');
select is((select count(*)::int from public.proposal_items),3,'owning client can read issued items');
select is((public.bl_client_scanner_proposal_response((select result->>'proposalId' from issued_result),'accept',
  public.bl_client_scanner_proposal_contents()->0->>'snapshotChecksum','')->>'status'),'accepted','client accepts the exact issued snapshot');
select throws_ok($$select public.bl_client_proposal_action((select result->>'proposalId' from issued_result),'accept','')$$,
  '42501','Use the snapshot-bound scanner proposal response action','legacy client action cannot accept scanner proposal');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000004","app_metadata":{"role":"client_admin","client_id":"cli_issue_other"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals where proposal_kind='canonical_issued'),0,'other client cannot enumerate the proposal');
select is((select count(*)::int from public.proposal_items),0,'other client cannot enumerate proposal items');

-- Legacy sales proposals and client acceptance retain their existing behavior.
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
insert into public.proposals(id,client_id,status,line_items,subtotal,deposit,total) values ('prp_legacy_issue','cli_issue','sent','[]',0,0,0);
select is((select proposal_kind::text from public.proposals where id='prp_legacy_issue'),'legacy_sales','legacy proposal kind remains default');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000002","app_metadata":{"role":"client_admin","client_id":"cli_issue"}}',true);
set local role authenticated;
select is(public.bl_client_proposal_action('prp_legacy_issue','view','')::text,'viewed','legacy client view still works');
select is(public.bl_client_proposal_action('prp_legacy_issue','accept','')::text,'accepted','legacy client acceptance still works');

select * from finish();
rollback;
