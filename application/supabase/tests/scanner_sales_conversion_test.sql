-- Quote-backed scanner promotion: immutable approved terms stay private until
-- explicit authorized publication creates the canonical proposal.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-4000-8000-000000000071','authenticated','authenticated','s1f-owner@example.invalid','',now(),'{}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000072','authenticated','authenticated','s1f-client@example.invalid','',now(),'{"role":"client_admin","client_id":"s1f_client"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000073','authenticated','authenticated','s1f-team@example.invalid','',now(),'{"role":"team_member"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000075','authenticated','authenticated','s1f-suspended@example.invalid','',now(),'{"role":"owner"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000074','authenticated','authenticated','s1f-admin@example.invalid','',now(),'{"role":"admin"}','{}',now(),now())
on conflict (id) do nothing;
insert into public.clients(id,company,industry,lifecycle) values ('s1f_client','S1F Example Co','Services','member');
insert into public.users(id,auth_user_id,name,email,role,client_id,status) values
 ('s1f_owner','00000000-0000-4000-8000-000000000071','S1F Owner','s1f-owner@example.invalid','owner',null,'active'),
 ('s1f_admin','00000000-0000-4000-8000-000000000074','S1F Admin','s1f-admin@example.invalid','admin',null,'active'),
 ('s1f_team','00000000-0000-4000-8000-000000000073','S1F Team Member','s1f-team@example.invalid','team_member',null,'active'),
 ('s1f_suspended_owner','00000000-0000-4000-8000-000000000075','Suspended Owner','s1f-suspended@example.invalid','owner',null,'suspended'),
 ('s1f_client_user','00000000-0000-4000-8000-000000000072','S1F Client','s1f-client@example.invalid','client_admin','s1f_client','active');
insert into public.intelligence_runs(id,client_id,scan_id,status,idempotency_key,metadata)
values ('s1f_run','s1f_client','s1f_scan','completed','s1f_run_key',
 '{"businessName":"S1F Example Co","rootUrl":"https://example.invalid","notes":"PRIVATE SCANNER NOTE"}');
insert into public.intelligence_artifacts(id,run_id,client_id,scan_id,kind,version,checksum,validation_status,envelope,idempotency_key)
values ('s1f_report','s1f_run','s1f_client','s1f_scan','internal_intelligence_report',1,'report-sum','valid',
 '{"privateReportArtifact":"DO NOT COPY"}','s1f_report_key');
insert into public.runtime_events(id,event_type,run_id,stage,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload)
values ('s1f_comp_done','runtime.commercial.stage_completed','s1f_run','competitor_intelligence','s1f_run','intelligence_run',
 's1f_client','s1f_scan',1,'{"status":"insufficient_evidence"}');
insert into public.proposal_versions(id,run_id,client_id,scan_id,status,version,checksum,envelope,idempotency_key,created_by)
values ('s1f_proposal_v1','s1f_run','s1f_client','s1f_scan','needs_review',1,'proposal-sum',
 '{"status":"draft_ready","commercialState":"priced","executiveSummary":"Client-safe summary","observedSituation":"Observed situation","keyIssues":[],"opportunities":[],"recommendedWork":[{"sourceId":"work_once","title":"One-time work","solution":"Improve the site","priority":"high","effort":"medium","evidenceIds":["internal-evidence-id"]},{"sourceId":"work_monthly","title":"Monthly work","solution":"Maintain improvements","priority":"medium","effort":"small","evidenceIds":["internal-evidence-id"]}],"proposedNextStep":"Discuss the plan","pricing":{"pricingModelVersion":2,"currency":"EUR","items":[{"sourceId":"work_once","pricingType":"one_time","amountMinor":5000,"cadence":null,"quantity":2,"optional":false,"selected":false,"adminNotes":"PRIVATE ADMIN NOTE"},{"sourceId":"work_monthly","pricingType":"recurring","amountMinor":1000,"cadence":"monthly","quantity":2,"optional":false,"selected":false,"adminNotes":"PRIVATE LINE NOTE"}],"discountMinor":1000,"subtotalOneTimeMinor":10000,"totalOneTimeMinor":9000,"totalRecurringMonthlyMinor":2000,"optionalOneTimeMinor":0,"optionalRecurringMinor":0,"validUntil":"2099-12-31","commercialNotes":"PRIVATE COMMERCIAL NOTE"}}'::jsonb,
 's1f_proposal_key','s1f_owner');
insert into public.narrative_versions(id,run_id,client_id,scan_id,audience,status,version,checksum,envelope,idempotency_key,created_by)
values ('s1f_narrative_v1','s1f_run','s1f_client','s1f_scan','client','ready',1,'narrative-sum',
 '{"status":"ready","sections":[{"key":"observed","heading":"What we observed","paragraphs":["Approved client narrative."],"supportingArtifacts":["internal-report-id"]}]}',
 's1f_narrative_key','s1f_owner');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000071","app_metadata":{"role":"owner"}}',true);
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,client_id,scan_id,sequence,actor,payload)
values ('s1f_approved','runtime.review.approved','s1f_run','s1f_run','intelligence_run','s1f_client','s1f_scan',2,null,
 '{"by":"00000000-0000-4000-8000-000000000071","binding":{"schemaVersion":1,"proposal":{"id":"s1f_proposal_v1","version":1,"checksum":"proposal-sum"},"narrative":{"id":"s1f_narrative_v1","version":1,"checksum":"narrative-sum"},"report":{"id":"s1f_report","version":1,"checksum":"report-sum"},"competitor":null,"coreProposal":null}}');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000073","app_metadata":{"role":"team_member"}}',true);
set local role authenticated;
select throws_ok($$select * from public.bl_promote_scanner_package('s1f_run','s1f_proposal_v1','s1f_approved','s1f-team-promo','qte_s1f_team')$$,
 '42501','Internal actor required','active team member cannot promote an approved scanner package');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000073","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
select throws_ok($$select * from public.bl_promote_scanner_package('s1f_run','s1f_proposal_v1','s1f_approved','s1f-role-mismatch','qte_s1f_role_mismatch')$$,
 '42501','Internal actor required','owner claim cannot authorize a database team-member identity');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000075","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
select throws_ok($$select * from public.bl_promote_scanner_package('s1f_run','s1f_proposal_v1','s1f_approved','s1f-suspended-promo','qte_s1f_suspended')$$,
 '42501','Internal actor required','suspended owner identity cannot promote an approved scanner package');
reset role;
select set_config('request.jwt.claims','{"role":"service_role","sub":"00000000-0000-4000-8000-000000000071","app_metadata":{"role":"owner"}}',true);
set local role service_role;
select throws_ok($$select * from public.bl_promote_scanner_package('s1f_run','s1f_proposal_v1','s1f_approved','s1f-service-promo','qte_s1f_service')$$,
 '42501',null,'service-role metadata cannot forge an authenticated owner');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000072","app_metadata":{"role":"client_admin","client_id":"s1f_client"}}',true);
set local role authenticated;
select throws_ok($$select * from public.bl_promote_scanner_package('s1f_run','s1f_proposal_v1','s1f_approved','s1f-client-promo','qte_s1f_client_denied')$$,
 '42501','Internal actor required','authenticated client cannot promote an approved scanner package');
reset role;
select is((select count(*)::int from public.quotes where source_run_id='s1f_run'),0,'rejected actors create no scanner quote');
select is((select count(*)::int from public.proposals where source_run_id='s1f_run'),0,'rejected actors create no canonical proposal');
select is((select count(*)::int from public.scanner_sales_conversions where run_id='s1f_run'),0,'rejected actors create no publication conversion');
select is((select count(*)::int from public.scanner_sales_publications where proposal_id in (select id from public.proposals where source_run_id='s1f_run')),0,'rejected actors create no publication evidence');
select is((select count(*)::int from public.runtime_events where event_type='runtime.commercial.package_promoted' and aggregate_id='s1f_run'),0,'rejected actors append no promotion audit event');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000071","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
select results_eq(
 $$select quote_id,outcome,item_count from public.bl_promote_scanner_package('s1f_run','s1f_proposal_v1','s1f_approved','promo:s1f_run:s1f_proposal_v1:s1f_approved','qte_s1f')$$,
 $$values ('qte_s1f'::text,'created'::text,2::integer)$$,
 'approved v2 scanner package promotes to one private proposal_only quote');
select results_eq($$select commercial_mode::text,status::text,currency,subtotal,discount,total,recurring_total,valid_until::text from public.quotes where id='qte_s1f'$$,
 $$values ('proposal_only'::text,'draft'::text,'EUR'::text,10000::bigint,1000::bigint,9000::bigint,2000::bigint,'2099-12-31'::text)$$,
 'private quote preserves complete non-USD approved terms');
select results_eq($$select label,quantity,unit_amount,amount,pricing_type,recurrence_cadence,optional,selected from public.quote_items where quote_id='qte_s1f' order by sort$$,
 $$values ('One-time work'::text,2,5000::bigint,10000::bigint,'one_time'::text,null::text,false,false),('Monthly work'::text,2,1000::bigint,2000::bigint,'recurring'::text,'monthly'::text,false,false)$$,
 'quote items preserve descriptions, quantities, amounts, and cadence');
select is(has_function_privilege('authenticated','public.bl_convert_scanner_package(text,text)','EXECUTE'),false,
 'retired direct conversion RPC is not executable by authenticated callers');
reset role;
select throws_ok($$select public.bl_convert_scanner_package('s1f_run','s1f-legacy-convert')$$,
 '0A000','Direct scanner proposal conversion is retired; use bl_promote_scanner_package','legacy direct conversion fails closed');
set local role authenticated;
select results_eq($$select count(*)::int from public.proposals where source_run_id='s1f_run'$$,$$values (0)$$,
 'promotion creates no canonical proposal before publication');
select results_eq($$select count(*)::int from public.scanner_sales_conversions where run_id='s1f_run'$$,$$values (0)$$,
 'conversion publication anchor does not exist before publication');
select results_eq($$select quote_id,outcome,item_count from public.bl_promote_scanner_package('s1f_run','s1f_proposal_v1','s1f_approved','promo:s1f_run:s1f_proposal_v1:s1f_approved','qte_s1f_retry')$$,
 $$values ('qte_s1f'::text,'already_promoted'::text,2::integer)$$,
 'promotion retry is idempotent and returns the original private quote');
select is((select count(*)::int from public.quotes where source_run_id='s1f_run'),1,
 'retry cannot create a second quote for the scanner run');

reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000074","app_metadata":{"role":"admin"}}',true);
set local role authenticated;
select results_eq($$select quote_id,outcome,item_count from public.bl_promote_scanner_package('s1f_run','s1f_proposal_v1','s1f_approved','promo:s1f_run:s1f_proposal_v1:s1f_approved','qte_s1f_admin_retry')$$,
 $$values ('qte_s1f'::text,'already_promoted'::text,2::integer)$$,
 'active admin identity may invoke the promotion RPC idempotently');
select is((select count(*)::int from public.quotes where source_run_id='s1f_run'),1,'admin retry does not create a duplicate quote');
select is((select count(*)::int from public.runtime_events where event_type='runtime.commercial.package_promoted' and aggregate_id='s1f_run'),1,'admin retry does not append a duplicate promotion audit event');

reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000072","app_metadata":{"role":"client_admin","client_id":"s1f_client"}}',true);
set local role authenticated;
select is((select count(*)::int from public.quotes),0,'client cannot read the private promoted quote');
select is((select count(*)::int from public.proposals),0,'client cannot read a canonical proposal before publication');
reset role;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000071","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
update public.quotes set status='internal_review' where id='qte_s1f';
select lives_ok($$select * from public.bl_review_proposal_quote('qte_s1f',(select updated_at from public.quotes where id='qte_s1f'),'approve')$$,
 'current owner separately approves the promoted quote');
select is((select status::text from public.quotes where id='qte_s1f'),'approved','commercial quote approval is distinct from scanner approval');
select throws_ok($$select public.bl_publish_scanner_quote('qte_s1f',(select updated_at from public.quotes where id='qte_s1f'),'s1f_client','s1f_client_user','EUR',9000,'2099-12-31')$$,
 '40001','Only valid, unexpired USD terms can be published','non-USD approved draft remains private and cannot issue');
select is((select count(*)::int from public.proposals where source_run_id='s1f_run'),0,'blocked non-USD publication creates no canonical proposal');

select * from finish();
rollback;
