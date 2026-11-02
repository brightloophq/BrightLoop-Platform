-- Quote-backed publication, revision, and snapshot-bound client response.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-4000-8000-000000000081','authenticated','authenticated','s1g-owner@example.invalid','',now(),'{}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000082','authenticated','authenticated','s1g-client@example.invalid','',now(),'{"role":"client_admin","client_id":"s1g_client"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000086','authenticated','authenticated','s1g-second@example.invalid','',now(),'{"role":"client_member","client_id":"s1g_client"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000083','authenticated','authenticated','s1g-wrong@example.invalid','',now(),'{"role":"client_admin","client_id":"s1g_other"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000084','authenticated','authenticated','s1g-admin@example.invalid','',now(),'{"role":"admin"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000087','authenticated','authenticated','s1g-team@example.invalid','',now(),'{"role":"team_member"}','{}',now(),now())
on conflict(id) do nothing;
insert into public.clients(id,company,industry,lifecycle)
values ('s1g_client','Sprint G Client','Services','prospect'),('s1g_other','Other Client','Services','member');
insert into public.users(id,auth_user_id,name,email,role,client_id,status) values
 ('s1g_owner','00000000-0000-4000-8000-000000000081','Sprint G Owner','s1g-owner@example.invalid','owner',null,'active'),
 ('s1g_client_user','00000000-0000-4000-8000-000000000082','Portal Recipient','s1g-client@example.invalid','client_admin','s1g_client','active'),
 ('s1g_second_user','00000000-0000-4000-8000-000000000086','Second Recipient','s1g-second@example.invalid','client_member','s1g_client','active'),
 ('s1g_wrong_user','00000000-0000-4000-8000-000000000083','Wrong Client','s1g-wrong@example.invalid','client_admin','s1g_other','active'),
 ('s1g_invited',null,'Invited only','s1g-invited@example.invalid','client_member','s1g_client','invited'),
 ('s1g_admin','00000000-0000-4000-8000-000000000084','Sprint G Admin','s1g-admin@example.invalid','admin',null,'active'),
 ('s1g_team','00000000-0000-4000-8000-000000000087','Sprint G Team','s1g-team@example.invalid','team_member',null,'active');
insert into public.intelligence_runs(id,client_id,scan_id,status,idempotency_key,metadata)
values ('s1g_run','s1g_client','s1g_scan','completed','s1g_run_key',
 '{"businessName":"Sprint G Client","email":"prospect@example.invalid","notes":"PRIVATE SCANNER NOTE"}');
insert into public.intelligence_artifacts(id,run_id,client_id,scan_id,kind,version,checksum,validation_status,envelope,idempotency_key)
values ('s1g_report','s1g_run','s1g_client','s1g_scan','internal_intelligence_report',1,'s1g-report','valid',
 '{"report":"PRIVATE INTERNAL REPORT"}','s1g_report_key');
insert into public.runtime_events(id,event_type,run_id,stage,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload)
values ('s1g_comp_done','runtime.commercial.stage_completed','s1g_run','competitor_intelligence','s1g_run','intelligence_run',
 's1g_client','s1g_scan',1,'{"status":"insufficient_evidence"}');
insert into public.proposal_versions(id,run_id,client_id,scan_id,status,version,checksum,envelope,idempotency_key,created_by)
values ('s1g_proposal_v1','s1g_run','s1g_client','s1g_scan','needs_review',1,'s1g-proposal',
 '{"status":"draft_ready","commercialState":"priced","executiveSummary":"Approved summary","observedSituation":"Approved finding","keyIssues":[{"title":"Issue","detail":"Client-safe issue","evidenceIds":["private-evidence"]}],"opportunities":[],"recommendedWork":[{"sourceId":"work1","title":"Improve performance","solution":"Optimize client pages","priority":"high","effort":"medium","evidenceIds":["private-evidence"]}],"proposedNextStep":"Discuss scope","pricing":{"pricingModelVersion":2,"currency":"USD","validUntil":"2099-12-31","discountMinor":1000,"subtotalOneTimeMinor":10000,"totalOneTimeMinor":9000,"totalRecurringMonthlyMinor":0,"optionalOneTimeMinor":0,"optionalRecurringMinor":0,"commercialNotes":"PRIVATE COMMERCIAL NOTE","items":[{"sourceId":"work1","pricingType":"one_time","amountMinor":5000,"quantity":2,"optional":false,"selected":false,"cadence":null,"adminNotes":"PRIVATE LINE NOTE"}]}}'::jsonb,
 's1g_proposal_key','s1g_owner');
insert into public.narrative_versions(id,run_id,client_id,scan_id,audience,status,version,checksum,envelope,idempotency_key,created_by)
values ('s1g_narrative_v1','s1g_run','s1g_client','s1g_scan','client','ready',1,'s1g-narrative',
 '{"status":"ready","sections":[{"key":"overview","heading":"Your opportunity","paragraphs":["Approved narrative for the client."],"supportingArtifacts":["private-report-id"]}]}',
 's1g_narrative_key','s1g_owner');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,client_id,scan_id,sequence,actor,payload)
values ('s1g_approved','runtime.review.approved','s1g_run','s1g_run','intelligence_run','s1g_client','s1g_scan',2,null,
 jsonb_build_object('by','00000000-0000-4000-8000-000000000081','binding',public.bl_scanner_sales_current_binding('s1g_run')));

set local role authenticated;
select results_eq($$select quote_id,outcome,item_count from public.bl_promote_scanner_package('s1g_run','s1g_proposal_v1','s1g_approved','promo:s1g_run:s1g_proposal_v1:s1g_approved','qte_s1g')$$,
 $$values ('qte_s1g'::text,'created'::text,1::integer)$$,'approved scanner package promotes to a private proposal_only quote');
select is((select status::text from public.quotes where id='qte_s1g'),'draft','promoted quote remains private draft');
select is((select count(*)::int from public.proposals where source_run_id='s1g_run'),0,'canonical proposal is not created before publication');
select is(has_function_privilege('authenticated','public.bl_convert_scanner_package(text,text)','EXECUTE'),false,'retired direct conversion is unavailable');
update public.quotes set status='internal_review' where id='qte_s1g';
select lives_ok($$select * from public.bl_review_proposal_quote('qte_s1g',(select updated_at from public.quotes where id='qte_s1g'),'approve')$$,
 'owner separately approves commercial quote terms');
select is((select status::text from public.quotes where id='qte_s1g'),'approved','scanner approval and quote approval are separate states');
select is((public.bl_scanner_quote_publication_preview('qte_s1g')->>'eligible')::boolean,false,
 'prospect record alone does not qualify for portal publication');
select throws_ok($$select public.bl_publish_scanner_quote('qte_s1g',(select updated_at from public.quotes where id='qte_s1g'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31')$$,
 '40001','An onboarded client account is required','unonboarded prospect cannot publish');
select throws_ok($$select public.bl_publish_scanner_quote('qte_s1g',(select updated_at from public.quotes where id='qte_s1g'),'s1g_client','s1g_invited','USD',9000,'2099-12-31')$$,
 '40001','Recipient must be active, authenticated, and belong to the quote client','invited user without authenticated identity cannot publish');
select throws_ok($$select public.bl_publish_scanner_quote('qte_s1g',(select updated_at from public.quotes where id='qte_s1g'),'s1g_client','s1g_wrong_user','USD',9000,'2099-12-31')$$,
 '40001','Recipient must be active, authenticated, and belong to the quote client','cross-client recipient cannot publish');

reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select is((select count(*)::int from public.quotes),0,'client cannot read private promoted quote');
select is((select count(*)::int from public.proposals),0,'client cannot read canonical proposal before publication');
select is(jsonb_array_length(public.bl_client_scanner_proposal_contents()),0,'portal projection is empty before publication');
reset role;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000087","app_metadata":{"role":"team_member"}}',true);
set local role authenticated;
select throws_ok($$select public.bl_scanner_quote_publication_preview('qte_s1g')$$,'42501',null,'team member cannot preview publication');
select throws_ok($$select public.bl_publish_scanner_quote('qte_s1g',(select updated_at from public.quotes where id='qte_s1g'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31')$$,
 '42501',null,'team member cannot publish');
reset role;
select set_config('request.jwt.claims','{"role":"service_role","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
set local role service_role;
select throws_ok($$select public.bl_publish_scanner_quote('qte_s1g',(select updated_at from public.quotes where id='qte_s1g'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31')$$,
 '42501',null,'service-role claims cannot forge an authenticated publisher');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
set local role authenticated;

update public.clients set lifecycle='member' where id='s1g_client';
insert into public.proposals(id,client_id,subtotal,deposit,total,status,currency)
values ('s1g_legacy_eur','s1g_other',10000,0,10000,'draft','EUR');
select throws_ok($$update public.proposals set status='sent' where id='s1g_legacy_eur'$$,
 '22023','Only USD proposals can be published while invoice currency support is unavailable',
 'legacy proposal status routes also reject non-USD publication');
select throws_ok($$update public.proposals set deposit=100 where id='s1g_legacy_eur'$$,
 '22023','Non-USD deposits are unavailable until invoice currency support is added',
 'legacy non-USD deposits remain blocked');
insert into public.runtime_events(id,event_type,run_id,stage,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload)
values ('s1g_stage_failed','runtime.commercial.stage_failed','s1g_run','proposal_generation','s1g_run','intelligence_run','s1g_client','s1g_scan',
 coalesce((select max(sequence)+1 from public.runtime_events where aggregate_type='intelligence_run' and aggregate_id='s1g_run'),1),'{"failure":"test blocker"}');
select ok((public.bl_scanner_quote_publication_preview('qte_s1g')->>'eligible')::boolean=false,
 'unresolved commercial pipeline failure disables publication');
select throws_ok($$select public.bl_publish_scanner_quote('qte_s1g',(select updated_at from public.quotes where id='qte_s1g'),
 's1g_client','s1g_client_user','USD',9000,'2099-12-31')$$,
 '40001','An unresolved scanner stage failure blocks publication','unresolved stage failure prevents atomic issuance');
insert into public.runtime_events(id,event_type,run_id,stage,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload)
values ('s1g_stage_resolved','runtime.commercial.stage_completed','s1g_run','proposal_generation','s1g_run','intelligence_run','s1g_client','s1g_scan',
 coalesce((select max(sequence)+1 from public.runtime_events where aggregate_type='intelligence_run' and aggregate_id='s1g_run'),1),'{"status":"completed"}');
create temporary table s1g_first_publication as
select public.bl_publish_scanner_quote('qte_s1g',(select updated_at from public.quotes where id='qte_s1g'),
 's1g_client','s1g_client_user','USD',9000,'2099-12-31') as result;
select is((select (result->>'published')::boolean from s1g_first_publication),true,'authorized owner explicitly publishes the approved USD quote');
select is((select proposal_kind::text from public.proposals where id=(select result->>'proposalId' from s1g_first_publication)),'canonical_issued',
 'canonical proposal is created only by publication');
select is((select count(*)::int from public.scanner_sales_publications where client_id='s1g_client'),1,'publication evidence is appended once');
select is((select count(*)::int from public.scanner_sales_conversions where run_id='s1g_run'),1,'one scanner conversion anchor is created atomically with publication');
select is((public.bl_publish_scanner_quote('qte_s1g',(select commercial_approved_state from public.quotes where id='qte_s1g'),
 's1g_client','s1g_client_user','USD',9000,'2099-12-31')->>'replayed')::boolean,true,'publication retry is idempotent');
select is((select count(*)::int from public.scanner_sales_publications where client_id='s1g_client'),1,'retry does not duplicate publication');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000084","app_metadata":{"role":"admin"}}',true);
select throws_ok($$select public.bl_publish_scanner_quote('qte_s1g',(select commercial_approved_state from public.quotes where id='qte_s1g'),
 's1g_client','s1g_second_user','USD',9000,'2099-12-31')$$,
 '40001','Quote was already published or superseded; reload its current state',
 'a retry cannot replace the verified recipient after publication');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
select is((select count(*)::int from public.contracts),0,'publication does not create a contract');
select is((select count(*)::int from public.invoices),0,'publication does not issue an invoice');
select is((select count(*)::int from public.payments),0,'publication does not collect payment');

-- Save the exact first offer binding for the later stale-offer rejection check.
create temporary table s1g_original_offer as
select p.id as proposal_id,encode(extensions.digest(convert_to(pub.client_safe_snapshot::text,'UTF8'),'sha256'),'hex') as checksum
from public.scanner_sales_publications pub join public.proposals p on p.id=pub.proposal_id
where p.id=(select result->>'proposalId' from s1g_first_publication);
grant select on s1g_original_offer to authenticated;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals),1,'published offer becomes visible to its linked client');
select is((public.bl_client_scanner_proposal_contents()->0->'snapshot'->'narrative'->0->'paragraphs'->>0),
 'Approved narrative for the client.','client receives the approved narrative');
select ok(not (public.bl_client_scanner_proposal_contents()::text ~ 'PRIVATE|private-report-id|private-evidence|internal-evidence-id'),
 'client projection excludes private notes, reports, and evidence references');
select is((public.bl_client_scanner_proposal_response((select proposal_id from s1g_original_offer),'change',
 (select checksum from s1g_original_offer),'Please clarify the implementation timeline')->>'status'),
 'change_requested','client change request is recorded separately from acceptance');
select is((select proposal_id from public.scanner_sales_offer_heads where client_id='s1g_client'),
 (select proposal_id from s1g_original_offer),'change request does not supersede the current offer');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000083","app_metadata":{"role":"client_admin","client_id":"s1g_other"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals),0,'cross-client account cannot read the current offer');
select is(jsonb_array_length(public.bl_client_scanner_proposal_contents()),0,'cross-client portal projection returns no offer');
reset role;

-- A material pricing revision is a new immutable scanner version and needs a new source approval.
select is(has_function_privilege('anon','public.bl_create_scanner_sales_revision(text)','EXECUTE'),false,
 'anonymous sessions cannot execute the revision RPC');
select is(has_function_privilege('service_role','public.bl_create_scanner_sales_revision(text)','EXECUTE'),false,
 'service-role sessions cannot execute the revision RPC');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000087","app_metadata":{"role":"team_member"}}',true);
set local role authenticated;
select throws_ok(format('select public.bl_create_scanner_sales_revision(%L)',(select proposal_id from s1g_original_offer)),
 '42501',null,'active team member cannot prepare a scanner sales revision');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select throws_ok(format('select public.bl_create_scanner_sales_revision(%L)',(select proposal_id from s1g_original_offer)),
 '42501',null,'client admin cannot prepare a scanner sales revision');
reset role;
select set_config('request.jwt.claims','{"role":"service_role","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
set local role service_role;
select throws_ok(format('select public.bl_create_scanner_sales_revision(%L)',(select proposal_id from s1g_original_offer)),
 '42501',null,'service-role metadata cannot invoke the revision RPC as an owner');
reset role;
select is((select count(*)::int from public.scanner_sales_quote_revisions where predecessor_proposal_id=(select proposal_id from s1g_original_offer)),0,
 'unauthorized revision requests create no revision lineage');
select is((select count(*)::int from public.quotes where source_run_id='s1g_run'),1,
 'unauthorized revision requests create no quote');
select is((select count(*)::int from public.proposals where source_run_id='s1g_run'),1,
 'unauthorized revision requests create no canonical proposal');
select is((select count(*)::int from public.scanner_sales_publications where client_id='s1g_client'),1,
 'unauthorized revision requests create no publication');
select is((select count(*)::int from public.runtime_events where event_type='runtime.commercial.package_promoted' and aggregate_id='s1g_run'),1,
 'unauthorized revision requests append no promotion audit event');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
insert into public.proposal_versions(id,run_id,client_id,scan_id,status,supersedes_id,version,checksum,envelope,idempotency_key,created_by)
select 's1g_proposal_v2',run_id,client_id,scan_id,'needs_review',id,2,'s1g-proposal-v2',
 jsonb_set(jsonb_set(jsonb_set(jsonb_set(envelope,'{pricing,items,0,amountMinor}','4000'::jsonb),
  '{pricing,discountMinor}','500'::jsonb),'{pricing,subtotalOneTimeMinor}','8000'::jsonb),'{pricing,totalOneTimeMinor}','7500'::jsonb),
 's1g_proposal_v2_key','s1g_owner'
from public.proposal_versions where id='s1g_proposal_v1';
select throws_ok($$select * from public.bl_promote_scanner_package('s1g_run','s1g_proposal_v2','s1g_approved',
 'promo:s1g_run:s1g_proposal_v2:s1g_approved','qte_s1g_stale_v2')$$,
 '40001','Promotion requires exact current version-bound scanner approval',
 'a commercial revision cannot reuse the predecessor approval');
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,client_id,scan_id,sequence,actor,payload)
values ('s1g_revision_approved','runtime.review.approved','s1g_run','s1g_run','intelligence_run','s1g_client','s1g_scan',
 coalesce((select max(sequence)+1 from public.runtime_events where aggregate_type='intelligence_run' and aggregate_id='s1g_run'),1),null,
 jsonb_build_object('by','00000000-0000-4000-8000-000000000081','binding',public.bl_scanner_sales_current_binding('s1g_run')));
create temporary table s1g_revision as
select public.bl_create_scanner_sales_revision((select proposal_id from s1g_original_offer)) as result;
select isnt((select result->>'quoteId' from s1g_revision),null,'approved commercial revision creates a separate private quote');
select is((select count(*)::int from public.scanner_sales_conversions where run_id='s1g_run'),1,'revision preserves one conversion anchor per scan run');
select is((select count(*)::int from public.scanner_sales_quote_revisions where predecessor_proposal_id=(select proposal_id from s1g_original_offer)),1,
 'revision lineage is appended against the existing offer');
select is((select count(*)::int from public.scanner_sales_publications where client_id='s1g_client'),1,
 'preparing a private revision does not publish or supersede the old offer');
select is((select status::text from public.proposals where id=(select proposal_id from s1g_original_offer)),'issued',
 'change request and private revision leave the original offer published');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000084","app_metadata":{"role":"admin"}}',true);
set local role authenticated;
select lives_ok(format('select public.bl_create_scanner_sales_revision(%L)',(select proposal_id from s1g_original_offer)),
 'active admin can invoke the revision RPC for an approved private revision');
reset role;
select is((select count(*)::int from public.scanner_sales_quote_revisions where predecessor_proposal_id=(select proposal_id from s1g_original_offer)),1,
 'admin revision retry preserves one immutable lineage record');
select is((select count(*)::int from public.quotes where source_run_id='s1g_run'),2,
 'admin revision retry creates no duplicate private quote');
select is((select count(*)::int from public.scanner_sales_publications where client_id='s1g_client'),1,
 'admin revision retry does not publish or supersede the current offer');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals),1,'unpublished successor does not become client-visible');
select is(jsonb_array_length(public.bl_client_scanner_proposal_contents()),1,'client portal continues to expose only the current published offer');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
set local role authenticated;

update public.quotes set status='internal_review' where id=(select result->>'quoteId' from s1g_revision);
select lives_ok(format('select * from public.bl_review_proposal_quote(%L,(select updated_at from public.quotes where id=%L),%L)',
 (select result->>'quoteId' from s1g_revision),(select result->>'quoteId' from s1g_revision),'approve'),
 'successor quote receives separate commercial approval');
create temporary table s1g_successor_publication as
select public.bl_publish_scanner_quote((select result->>'quoteId' from s1g_revision),
 (select updated_at from public.quotes where id=(select result->>'quoteId' from s1g_revision)),
 's1g_client','s1g_client_user','USD',7500,'2099-12-31') as result;
select is((select (result->>'published')::boolean from s1g_successor_publication),true,'authorized publication creates the canonical successor');
select is((select count(*)::int from public.scanner_sales_publications where client_id='s1g_client'),2,'publication history retains both offers');
select is((select proposal_id from public.scanner_sales_offer_heads where client_id='s1g_client'),
 (select result->>'proposalId' from s1g_successor_publication),'successor publication atomically becomes the current offer');
select is((select status::text from public.proposals where id=(select proposal_id from s1g_original_offer)),'revised',
 'only successor publication supersedes the previous unaccepted offer');
select is((select response_kind from public.scanner_sales_client_responses where proposal_id=(select proposal_id from s1g_original_offer) and response_kind='superseded'),
 'superseded','supersession is recorded in immutable client response history');
select is((public.bl_publish_scanner_quote((select result->>'quoteId' from s1g_revision),
 (select commercial_approved_state from public.quotes where id=(select result->>'quoteId' from s1g_revision)),
 's1g_client','s1g_client_user','USD',7500,'2099-12-31')->>'replayed')::boolean,true,'successor publication retry is idempotent');

reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select throws_ok(format('select public.bl_client_scanner_proposal_response(%L,%L,%L,%L)',
 (select proposal_id from s1g_original_offer),'accept',(select checksum from s1g_original_offer),''),
 '40001','Only the current published offer can receive a response','superseded offer cannot be accepted');
select is((select count(*)::int from public.proposals),1,'client sees only the current published offer');
select is((public.bl_client_scanner_proposal_response(public.bl_client_scanner_proposal_contents()->0->>'proposalId','accept',
 public.bl_client_scanner_proposal_contents()->0->>'snapshotChecksum','')->>'status'),
 'accepted','client accepts the exact current published snapshot');
select is((public.bl_client_scanner_proposal_response(public.bl_client_scanner_proposal_contents()->0->>'proposalId','accept',
 public.bl_client_scanner_proposal_contents()->0->>'snapshotChecksum','')->>'replayed')::boolean,true,
 'duplicate acceptance returns the same accepted result');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
select is((select count(*)::int from public.scanner_sales_client_responses where proposal_id=(select result->>'proposalId' from s1g_successor_publication) and response_kind='accepted'),1,
 'internal audit records one acceptance for the exact successor');
select is((select snapshot_checksum from public.scanner_sales_client_responses where proposal_id=(select result->>'proposalId' from s1g_successor_publication) and response_kind='accepted'),
 (select encode(extensions.digest(convert_to(client_safe_snapshot::text,'UTF8'),'sha256'),'hex') from public.scanner_sales_publications where proposal_id=(select result->>'proposalId' from s1g_successor_publication)),
 'acceptance checksum matches immutable published snapshot');
select throws_ok(format('select public.bl_create_scanner_sales_revision(%L)',(select result->>'proposalId' from s1g_successor_publication)),
 '55000','Accepted offers cannot be superseded','accepted offer cannot be silently revised');
select is((select count(*)::int from public.contracts),0,'acceptance does not create contracts');
select is((select count(*)::int from public.invoices),0,'acceptance does not issue invoices');
select is((select count(*)::int from public.payments),0,'acceptance does not collect payments');

select * from finish();
rollback;
