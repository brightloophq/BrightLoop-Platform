-- Phase 9B: quote promotion must preserve approved scanner v2 optional semantics.
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients(id,company) values ('cli_qpa','Quote Pricing Authority');
insert into auth.users(id) values ('91000000-0000-4000-8000-000000000001');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('91000000-0000-4000-8000-000000000002','authenticated','authenticated','qpa-client@example.test',now(),
  '{"role":"client_admin","client_id":"cli_qpa"}','{}',now(),now());
insert into public.users(id,auth_user_id,name,email,role,client_id,status)
values ('usr_qpa_owner','91000000-0000-4000-8000-000000000001','QPA Owner','qpa-owner@example.test','owner',null,'active'),
 ('usr_qpa_client','91000000-0000-4000-8000-000000000002','QPA Client','qpa-client@example.test','client_admin','cli_qpa','active');
insert into public.intelligence_runs(id,client_id,scan_id,status,idempotency_key,created_by)
values ('run_qpa','cli_qpa','scan_qpa','completed','idem_run_qpa','usr_qpa_owner');
insert into public.proposal_versions(id,run_id,client_id,scan_id,status,version,checksum,envelope,idempotency_key,created_by)
values ('pv_qpa','run_qpa','cli_qpa','scan_qpa','needs_review',1,'checksum-pv-qpa',jsonb_build_object(
 'status','draft_ready','commercialState','priced',
 'recommendedWork',jsonb_build_array(
   jsonb_build_object('sourceId','work:required','title','Required','solution','Required scope','evidenceIds',jsonb_build_array('evidence:r')),
   jsonb_build_object('sourceId','work:optional-once','title','Optional once','solution','Optional one-time','evidenceIds',jsonb_build_array('evidence:o1')),
   jsonb_build_object('sourceId','work:optional-monthly','title','Optional monthly','solution','Optional recurring','evidenceIds',jsonb_build_array('evidence:o2'))),
 'pricing',jsonb_build_object('pricingModelVersion',2,'currency','USD','validUntil',(current_date+30)::text,
   'discountMinor',50,'subtotalOneTimeMinor',200,'totalOneTimeMinor',150,'totalRecurringMonthlyMinor',0,'commercialNotes','Public note',
   'items',jsonb_build_array(
     jsonb_build_object('sourceId','work:required','pricingType','one_time','amountMinor',100,'quantity',2,'optional',false,'selected',false,'cadence',null,'adminNotes','private required note'),
     jsonb_build_object('sourceId','work:optional-once','pricingType','one_time','amountMinor',300,'quantity',1,'optional',true,'selected',false,'cadence',null,'adminNotes','private optional note'),
     jsonb_build_object('sourceId','work:optional-monthly','pricingType','recurring','amountMinor',75,'quantity',2,'optional',true,'selected',false,'cadence','monthly','adminNotes','private recurring note')))),
 'idem_pv_qpa','usr_qpa_owner');
insert into public.narrative_versions(id,run_id,client_id,scan_id,audience,status,version,checksum,envelope,idempotency_key,created_by)
values ('nv_qpa','run_qpa','cli_qpa','scan_qpa','client','ready',1,'checksum-nv-qpa','{"status":"ready","sections":[{"key":"summary","heading":"Summary","paragraphs":["Client safe text"]}]}'::jsonb,'idem_nv_qpa','usr_qpa_owner');
insert into public.intelligence_artifacts(id,run_id,client_id,scan_id,kind,version,checksum,validation_status,envelope,idempotency_key,created_by)
values ('art_qpa_report','run_qpa','cli_qpa','scan_qpa','internal_intelligence_report',1,'checksum-report-qpa','valid','{}','idem_report_qpa','usr_qpa_owner');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
insert into public.runtime_events(id,event_type,run_id,stage,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload,actor)
values ('evt_qpa_competitor','runtime.commercial.stage_completed','run_qpa','competitor_intelligence','run_qpa','intelligence_run','cli_qpa','scan_qpa',1,'{}','usr_qpa_owner');
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload)
select 'evt_qpa_approval','runtime.review.approved','run_qpa','run_qpa','intelligence_run','cli_qpa','scan_qpa',2,
  jsonb_build_object('by','91000000-0000-4000-8000-000000000001','binding',jsonb_build_object('schemaVersion',1,
    'proposal',jsonb_build_object('id','pv_qpa','version',1,'checksum','checksum-pv-qpa'),
    'narrative',jsonb_build_object('id','nv_qpa','version',1,'checksum','checksum-nv-qpa'),
    'report',jsonb_build_object('id','art_qpa_report','version',1,'checksum','checksum-report-qpa'),
    'competitor',null,'coreProposal',null));

select results_eq(
  $$select quote_id,outcome,item_count from public.bl_promote_scanner_package('run_qpa','pv_qpa','evt_qpa_approval','promo:run_qpa:pv_qpa:evt_qpa_approval','qte_qpa')$$,
  $$values ('qte_qpa'::text,'created'::text,3::integer)$$,
  'approved v2 scanner pricing promotes once to a private quote');
select results_eq($$select subtotal,discount,total,recurring_total,optional_one_time_total,optional_recurring_total from public.quotes where id='qte_qpa'$$,
  $$values (200::bigint,50::bigint,150::bigint,0::bigint,300::bigint,150::bigint)$$,
  'only required/selected lines are committed and optional recurrence remains separately represented');
select results_eq($$select optional,selected,was_optional,unit_amount,quantity from public.quote_items where quote_id='qte_qpa' order by sort$$,
  $$values (false,false,false,100::bigint,2),(true,false,true,300::bigint,1),(true,false,true,75::bigint,2)$$,
  'optional identity and unselected state survive promotion');
select is((select client_note from public.quotes where id='qte_qpa'),'Public note','client commercial note is copied from approved terms');
select is((select internal_note from public.quote_items where quote_id='qte_qpa' and sort=1),'private optional note','admin pricing note remains internal on quote');

insert into public.proposal_versions(id,run_id,client_id,scan_id,status,version,checksum,envelope,idempotency_key,created_by,supersedes_id)
values ('pv_qpa_v2','run_qpa','cli_qpa','scan_qpa','needs_review',2,'checksum-pv-qpa-v2',jsonb_build_object(
 'status','draft_ready','commercialState','priced',
 'recommendedWork',jsonb_build_array(
   jsonb_build_object('sourceId','work:required','title','Required','solution','Required scope','evidenceIds',jsonb_build_array('evidence:r')),
   jsonb_build_object('sourceId','work:optional-once','title','Optional once','solution','Optional one-time','evidenceIds',jsonb_build_array('evidence:o1')),
   jsonb_build_object('sourceId','work:optional-monthly','title','Optional monthly','solution','Optional recurring','evidenceIds',jsonb_build_array('evidence:o2'))),
 'pricing',jsonb_build_object('pricingModelVersion',2,'currency','USD','validUntil',(current_date+30)::text,
   'discountMinor',50,'subtotalOneTimeMinor',500,'totalOneTimeMinor',450,'totalRecurringMonthlyMinor',150,'commercialNotes','Public note v2',
   'items',jsonb_build_array(
     jsonb_build_object('sourceId','work:required','pricingType','one_time','amountMinor',100,'quantity',2,'optional',false,'selected',false,'cadence',null,'adminNotes','private required note'),
     jsonb_build_object('sourceId','work:optional-once','pricingType','one_time','amountMinor',300,'quantity',1,'optional',true,'selected',true,'cadence',null,'adminNotes','private optional note'),
     jsonb_build_object('sourceId','work:optional-monthly','pricingType','recurring','amountMinor',75,'quantity',2,'optional',true,'selected',true,'cadence','monthly','adminNotes','private recurring note')))),
 'idem_pv_qpa_v2','usr_qpa_owner','pv_qpa');
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload)
select 'evt_qpa_approval_v2','runtime.review.approved','run_qpa','run_qpa','intelligence_run','cli_qpa','scan_qpa',4,
  jsonb_build_object('by','91000000-0000-4000-8000-000000000001','binding',jsonb_build_object('schemaVersion',1,
    'proposal',jsonb_build_object('id','pv_qpa_v2','version',2,'checksum','checksum-pv-qpa-v2'),
    'narrative',jsonb_build_object('id','nv_qpa','version',1,'checksum','checksum-nv-qpa'),
    'report',jsonb_build_object('id','art_qpa_report','version',1,'checksum','checksum-report-qpa'),
    'competitor',null,'coreProposal',null));
select results_eq(
  $$select quote_id,outcome,item_count from public.bl_promote_scanner_package('run_qpa','pv_qpa_v2','evt_qpa_approval_v2','promo:run_qpa:pv_qpa_v2:evt_qpa_approval_v2','qte_qpa_v2')$$,
  $$values ('qte_qpa_v2'::text,'created'::text,3::integer)$$,
  'a selected optional package uses a new independently approved version and quote');
select results_eq($$select subtotal,discount,total,recurring_total,optional_one_time_total,optional_recurring_total from public.quotes where id='qte_qpa_v2'$$,
  $$values (500::bigint,50::bigint,450::bigint,150::bigint,0::bigint,0::bigint)$$,
  'selected optional one-time and recurring terms enter committed canonical totals');
select results_eq($$select optional,selected,was_optional from public.quote_items where quote_id='qte_qpa_v2' order by sort$$,
  $$values (false,false,false),(false,true,true),(false,true,true)$$,
  'selected optional identity is preserved while canonical quote semantics commit it');
select results_eq(
  $$select quote_id,outcome,item_count from public.bl_promote_scanner_package('run_qpa','pv_qpa_v2','evt_qpa_approval_v2','promo:run_qpa:pv_qpa_v2:evt_qpa_approval_v2','qte_qpa_v2_retry')$$,
  $$values ('qte_qpa_v2'::text,'already_promoted'::text,3::integer)$$,
  'promotion retries resolve to the same immutable quote');

select throws_ok($$update public.quote_items set unit_amount=1 where quote_id='qte_qpa' and sort=0$$,
  '55000','Scanner quote items are immutable; create a new scanner commercial version','direct quote item mutation is blocked');
select throws_ok($$delete from public.quote_items where quote_id='qte_qpa' and sort=0$$,
  '55000','Scanner quote items are immutable; create a new scanner commercial version','direct quote item deletion is blocked without trigger-record ambiguity');
select throws_ok($$update public.quotes set total=999 where id='qte_qpa'$$,
  '55000','Scanner quote terms are immutable; create and approve a new scanner commercial version','direct quote total mutation is blocked');
select is(has_function_privilege('authenticated','public.bl_convert_scanner_package(text,text)','EXECUTE'),false,
  'retired direct conversion RPC cannot be called by authenticated sessions');
update public.quotes set status='internal_review' where id='qte_qpa_v2';
select is((select status::text from public.bl_review_proposal_quote('qte_qpa_v2',(select updated_at from public.quotes where id='qte_qpa_v2'),'approve')),
  'approved','active owner approval resolves the qualified users.status column and remains a separate gate');
select throws_ok($$select * from public.bl_issue_canonical_proposal('qte_qpa_v2',(select updated_at from public.quotes where id='qte_qpa_v2'))$$,
  '42501','Scanner quotes issue only through explicit publication','legacy issuance RPC cannot bypass scanner publication');
select set_config('app.scanner_quote_publication','on',true);
select throws_ok($$update public.quotes set status='issued' where id='qte_qpa_v2'$$,
  '42501','Scanner quote issuance must use explicit authorized publication','direct status mutation cannot publish');
select set_config('app.scanner_quote_review','on',true);
select throws_ok($$update public.quotes set commercial_approved_state=clock_timestamp() where id='qte_qpa_v2'$$,
  '42501','Scanner quote approval must use the authorized review operation','a client-set custom GUC cannot forge the database authorization guard');
select throws_ok($$delete from public.quotes where id='qte_qpa_v2'$$,
  '55000','Scanner quote history is immutable','scanner commercial quote history cannot be deleted');
update public.clients set lifecycle='member' where id='cli_qpa';
select lives_ok(format('select public.bl_publish_scanner_quote(%L,%L,%L,%L,%L,%s,%L)',
  'qte_qpa_v2',(select updated_at from public.quotes where id='qte_qpa_v2'),'cli_qpa','usr_qpa_client','USD',450,
  (current_date+30)::text),
  'approved USD quote publishes atomically through the explicit portal publication RPC');
select is((select client_safe_snapshot->'pricing'->>'subtotalOneTimeMinor' from public.scanner_sales_publications where proposal_id=
  (select proposal_id from public.quotes where id='qte_qpa_v2')),'500',
  'published snapshot retains the selected optional item in committed subtotal');
select is((select client_safe_snapshot->'pricing'->>'optionalOneTimeMinor' from public.scanner_sales_publications where proposal_id=
  (select proposal_id from public.quotes where id='qte_qpa_v2')),'0',
  'published snapshot excludes selected optional item from optional subtotal');
select ok(not ((select client_safe_snapshot::text from public.scanner_sales_publications where proposal_id=
  (select proposal_id from public.quotes where id='qte_qpa_v2')) ~ 'private|evidence:'),
  'published snapshot excludes private pricing notes and scanner evidence references');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000002","app_metadata":{"role":"client_admin","client_id":"cli_qpa"}}',true);
set local role authenticated;
select is((public.bl_client_scanner_proposal_response(
  public.bl_client_scanner_proposal_contents()->0->>'proposalId','accept',
  public.bl_client_scanner_proposal_contents()->0->>'snapshotChecksum','')->>'status'),
  'accepted','client acceptance is bound to the exact published snapshot');
select is((select count(*)::int from public.scanner_sales_client_responses where response_kind='accepted'),1,
  'acceptance appends one immutable response record');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","app_metadata":{"role":"owner"}}',true);
select is((select count(*)::int from public.invoices),0,'publication and acceptance do not issue invoices');
select is((select count(*)::int from public.payments),0,'publication and acceptance do not collect payments');

insert into public.proposal_versions(id,run_id,client_id,scan_id,status,version,checksum,envelope,idempotency_key,created_by,supersedes_id)
values ('pv_qpa_legacy','run_qpa','cli_qpa','scan_qpa','needs_review',3,'checksum-pv-qpa-legacy',jsonb_build_object(
 'status','draft_ready','commercialState','priced',
 'recommendedWork',jsonb_build_array(
   jsonb_build_object('sourceId','work:required','title','Required','solution','Required scope','evidenceIds',jsonb_build_array('evidence:r')),
   jsonb_build_object('sourceId','work:optional-once','title','Optional once','solution','Optional one-time','evidenceIds',jsonb_build_array('evidence:o1')),
   jsonb_build_object('sourceId','work:optional-monthly','title','Optional monthly','solution','Optional recurring','evidenceIds',jsonb_build_array('evidence:o2'))),
 'pricing',jsonb_build_object('pricingModelVersion',1,'currency','USD','validUntil',(current_date+30)::text,
   'discountMinor',50,'subtotalOneTimeMinor',500,'totalOneTimeMinor',450,'totalRecurringMonthlyMinor',150,
   'items',jsonb_build_array(
     jsonb_build_object('sourceId','work:required','pricingType','one_time','amountMinor',100,'quantity',2,'optional',false,'cadence',null),
     jsonb_build_object('sourceId','work:optional-once','pricingType','one_time','amountMinor',300,'quantity',1,'optional',true,'cadence',null),
     jsonb_build_object('sourceId','work:optional-monthly','pricingType','recurring','amountMinor',75,'quantity',2,'optional',true,'cadence','monthly')))),
 'idem_pv_qpa_legacy','usr_qpa_owner','pv_qpa_v2');
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload)
select 'evt_qpa_legacy_approval','runtime.review.approved','run_qpa','run_qpa','intelligence_run','cli_qpa','scan_qpa',6,
  jsonb_build_object('by','91000000-0000-4000-8000-000000000001','binding',jsonb_build_object('schemaVersion',1,
    'proposal',jsonb_build_object('id','pv_qpa_legacy','version',3,'checksum','checksum-pv-qpa-legacy'),
    'narrative',jsonb_build_object('id','nv_qpa','version',1,'checksum','checksum-nv-qpa'),
    'report',jsonb_build_object('id','art_qpa_report','version',1,'checksum','checksum-report-qpa'),
    'competitor',null,'coreProposal',null));
select throws_ok(
  $$select * from public.bl_promote_scanner_package('run_qpa','pv_qpa_legacy','evt_qpa_legacy_approval','promo:run_qpa:pv_qpa_legacy:evt_qpa_legacy_approval','qte_qpa_legacy')$$,
  '40001','Legacy or incomplete pricing cannot be promoted; create and approve a new pricing version',
  'v1 optional-inclusive history cannot enter canonical issuance without regeneration and reapproval');
select is((select envelope->'pricing'->>'pricingModelVersion' from public.proposal_versions where id='pv_qpa_legacy'),'1',
  'historical v1 source remains unchanged');
select is((select count(*)::int from public.quotes where id='qte_qpa_legacy'),0,
  'incompatible v1 approval leaves no promoted quote');

reset role;
select * from finish();
rollback;
