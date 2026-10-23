-- Sprint 1G: portal publication is owner/admin-only, version-bound, client-scoped,
-- and isolated from email, invoices, payments, and scanner-private intelligence.
begin;
create extension if not exists pgtap;
select no_plan();

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-4000-8000-000000000081','authenticated','authenticated','s1g-owner@example.invalid','',now(),'{}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000082','authenticated','authenticated','s1g-client@example.invalid','',now(),'{"role":"client_admin","client_id":"s1g_client"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000086','authenticated','authenticated','s1g-second@example.invalid','',now(),'{"role":"client_member","client_id":"s1g_client"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000083','authenticated','authenticated','s1g-wrong@example.invalid','',now(),'{"role":"client_admin","client_id":"s1g_other"}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000084','authenticated','authenticated','s1g-admin@example.invalid','',now(),'{"role":"admin"}','{}',now(),now())
 ,('00000000-0000-4000-8000-000000000087','authenticated','authenticated','s1g-team@example.invalid','',now(),'{"role":"team_member"}','{}',now(),now())
on conflict (id) do nothing;
insert into public.clients(id,company,industry) values ('s1g_client','Sprint G Client','Services'),('s1g_other','Other Client','Services');
update public.clients set lifecycle='member' where id='s1g_other';
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
values ('s1g_comp_done','runtime.commercial.stage_completed','s1g_run','competitor_intelligence','s1g_run','intelligence_run','s1g_client','s1g_scan',1,'{"status":"insufficient_evidence"}');
insert into public.proposal_versions(id,run_id,client_id,scan_id,status,version,checksum,envelope,idempotency_key)
values ('s1g_proposal_v1','s1g_run','s1g_client','s1g_scan','needs_review',1,'s1g-proposal',
 '{"status":"draft_ready","commercialState":"priced","executiveSummary":"Approved summary","observedSituation":"Approved finding",
 "keyIssues":[{"title":"Issue","detail":"Client-safe issue","evidenceIds":["private-evidence"]}],"opportunities":[],
 "recommendedWork":[{"sourceId":"work1","title":"Improve performance","solution":"Optimize client pages","priority":"high","effort":"medium","evidenceIds":["private-evidence"]}],
 "proposedNextStep":"Discuss scope","pricing":{"currency":"USD","items":[{"sourceId":"work1","pricingType":"one_time","amountMinor":5000,"cadence":null,"quantity":2,"optional":false,"adminNotes":"PRIVATE LINE NOTE"}],
 "discountMinor":1000,"subtotalOneTimeMinor":10000,"totalOneTimeMinor":9000,"totalRecurringMonthlyMinor":0,"validUntil":"2099-12-31","commercialNotes":"PRIVATE COMMERCIAL NOTE"}}','s1g_proposal_key');
insert into public.narrative_versions(id,run_id,client_id,scan_id,audience,status,version,checksum,envelope,idempotency_key)
values ('s1g_narrative_v1','s1g_run','s1g_client','s1g_scan','client','needs_review',1,'s1g-narrative',
 '{"status":"ready","sections":[{"key":"overview","heading":"Your opportunity","paragraphs":["Approved narrative for the client."],"supportingArtifacts":["private-report-id"]}]}','s1g_narrative_key');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,client_id,scan_id,sequence,actor,payload)
select 's1g_approved','runtime.review.approved','s1g_run','s1g_run','intelligence_run','s1g_client','s1g_scan',2,
 '00000000-0000-4000-8000-000000000081',jsonb_build_object('by','00000000-0000-4000-8000-000000000081','binding',jsonb_build_object(
  'schemaVersion',1,
  'proposal',jsonb_build_object('id',p.id,'version',p.version,'checksum',p.checksum),
  'narrative',jsonb_build_object('id',n.id,'version',n.version,'checksum',n.checksum),
  'report',jsonb_build_object('id',a.id,'version',a.version,'checksum',a.checksum),
  'competitor',null,'coreProposal',null))
from public.proposal_versions p, public.narrative_versions n, public.intelligence_artifacts a
where p.id='s1g_proposal_v1' and n.id='s1g_narrative_v1' and a.id='s1g_report';
select public.bl_convert_scanner_package('s1g_run','s1g-conversion-idempotency-001');
insert into public.proposals(id,client_id,subtotal,deposit,total,status,currency)
values ('s1g_legacy_eur','s1g_other',10000,0,10000,'draft','EUR');
select throws_ok($$update public.proposals set status='sent' where id='s1g_legacy_eur'$$,
 '22023','Only USD proposals can be published while invoice currency support is unavailable',
 'legacy status routes also reject non-USD publication');
select throws_ok($$update public.proposals set deposit=100 where id='s1g_legacy_eur'$$,
 '22023','Non-USD deposits are unavailable until invoice currency support is added',
 'non-USD legacy deposits remain unavailable');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000087","app_metadata":{"role":"team_member"}}',true);
select throws_ok(format('select public.bl_scanner_sales_delivery_preview(%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run')),
 '42501','Owner or admin authorization required','team member cannot inspect publication preview');
select throws_ok(format('select public.bl_publish_scanner_sales_proposal(%L,%L,%L,%L,%s,%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31'),
 '42501','Owner or admin authorization required','team member cannot publish');
select set_config('request.jwt.claims','{"role":"service_role","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
select throws_ok(format('select public.bl_publish_scanner_sales_proposal(%L,%L,%L,%L,%s,%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31'),
 '42501','Owner or admin authorization required','service role cannot use an authenticated publication claim');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);

select is((public.bl_scanner_sales_delivery_preview((select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'))->>'eligible')::boolean,
 false,'prospect lifecycle alone is not an onboarded client');
select throws_ok(format('select public.bl_publish_scanner_sales_proposal(%L,%L,%L,%L,%s,%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31'),
 '40001','The client account has not completed onboarding.','unonboarded prospect cannot publish');

-- A private converted draft stays invisible even when a client has a portal account.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals),0,'client cannot read converted draft before publication');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);

update public.clients set lifecycle='member' where id='s1g_client';
insert into public.runtime_events(id,event_type,run_id,stage,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload)
values ('s1g_stage_failed','runtime.commercial.stage_failed','s1g_run','proposal_generation','s1g_run','intelligence_run','s1g_client','s1g_scan',3,'{"failure":"test blocker"}');
select is((public.bl_scanner_sales_delivery_preview((select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'))->>'eligible')::boolean,
 false,'unresolved commercial failure disables the publication action');
select throws_ok(format('select public.bl_publish_scanner_sales_proposal(%L,%L,%L,%L,%s,%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31'),
 '40001','An unresolved commercial workflow failure blocks publication.','unresolved commercial failure blocks atomic publication');
insert into public.runtime_events(id,event_type,run_id,stage,aggregate_id,aggregate_type,client_id,scan_id,sequence,payload)
values ('s1g_stage_resolved','runtime.commercial.stage_completed','s1g_run','proposal_generation','s1g_run','intelligence_run','s1g_client','s1g_scan',4,'{"status":"completed"}');
select throws_ok(format('select public.bl_publish_scanner_sales_proposal(%L,%L,%L,%L,%s,%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_invited','USD',9000,'2099-12-31'),
 '40001','The selected recipient is not an active authenticated user for this client.','invited account without auth identity cannot publish');
select throws_ok(format('select public.bl_publish_scanner_sales_proposal(%L,%L,%L,%L,%s,%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_wrong_user','USD',9000,'2099-12-31'),
 '40001','The selected recipient is not an active authenticated user for this client.','wrong-client recipient cannot publish');
select throws_ok(format('update public.proposals set status=''sent'' where id=%L',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run')),
 '42501','Converted proposals require the authorized publication operation','legacy direct status update cannot bypass publication');
select throws_ok(format('update public.proposals set deposit=1 where id=%L',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run')),
 '55000','Converted proposal terms are derived from immutable reviewed versions','unbound deposit changes are blocked');
select ok((public.bl_scanner_sales_delivery_preview((select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'))->>'eligible')::boolean,
 'onboarded USD package is eligible for final confirmation');
select ok((public.bl_publish_scanner_sales_proposal(
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31')->>'published')::boolean,
 'owner publishes the current approved USD proposal');
select is((select count(*)::int from public.scanner_sales_publications where client_id='s1g_client'),1,
 'exactly one immutable publication record exists');
select ok((public.bl_publish_scanner_sales_proposal(
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31')->>'replayed')::boolean,
 'identical retry returns the existing publication');
select throws_ok(format('select public.bl_publish_scanner_sales_proposal(%L,%L,%L,%L,%s,%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_client_user','EUR',9000,'2099-12-31'),
 '40001','The confirmed proposal summary changed; review it again.','changed currency precondition conflicts');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000084","app_metadata":{"role":"admin"}}',true);
select throws_ok(format('select public.bl_publish_scanner_sales_proposal(%L,%L,%L,%L,%s,%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_second_user','USD',9000,'2099-12-31'),
 '40001','Proposal was already published with different recipient or terms.','a second recipient cannot replace the immutable publication target');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
insert into public.proposal_versions(id,run_id,client_id,scan_id,status,supersedes_id,version,checksum,envelope,idempotency_key)
select 's1g_proposal_v2',run_id,client_id,scan_id,'needs_review',id,2,'s1g-proposal-v2',
  jsonb_set(jsonb_set(jsonb_set(jsonb_set(envelope,'{pricing,items,0,amountMinor}','4000'::jsonb),
    '{pricing,discountMinor}','500'::jsonb),'{pricing,subtotalOneTimeMinor}','8000'::jsonb),
    '{pricing,totalOneTimeMinor}','7500'::jsonb),'s1g_proposal_v2_key'
from public.proposal_versions where id='s1g_proposal_v1';
select throws_ok(format('select public.bl_publish_scanner_sales_proposal(%L,%L,%L,%L,%s,%L)',
 (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run'),'s1g_client','s1g_client_user','USD',9000,'2099-12-31'),
 '40001','Reviewed source versions changed; re-review and reconvert this package.','new proposal version invalidates publication eligibility');
select is((select count(*)::int from public.invoices),0,'publication does not create invoices');
select is((select count(*)::int from public.payments),0,'publication does not create payments');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals),1,'published proposal becomes visible to its own client');
select is(public.bl_client_scanner_proposal_contents()->0->'snapshot'->'narrative'->0->'paragraphs'->>0,
 'Approved narrative for the client.','client receives the immutable approved narrative');
select ok(not (public.bl_client_scanner_proposal_contents()::text ~ 'PRIVATE|private-report-id|private-evidence'),
 'published projection excludes private notes, reports, and evidence references');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000083","app_metadata":{"role":"client_admin","client_id":"s1g_other"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals),0,'different client cannot read published proposal');
select is(jsonb_array_length(public.bl_client_scanner_proposal_contents()),0,'different client receives no converted snapshot');
reset role;

-- Request changes is distinct from acceptance and leaves the current offer live.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select is((public.bl_client_scanner_proposal_response(
  public.bl_client_scanner_proposal_contents()->0->>'proposalId','change',
  public.bl_client_scanner_proposal_contents()->0->>'snapshotChecksum','Please clarify the implementation timeline')->>'status'),
  'change_requested','authorized client can request changes without accepting');
select throws_ok(format('select public.bl_client_proposal_action(%L,%L,%L)',
  public.bl_client_scanner_proposal_contents()->0->>'proposalId','accept',''),
  '42501','Use the snapshot-bound scanner proposal response action','legacy status-only RPC cannot accept a converted proposal');
reset role;

-- Admin pricing appends a commercial version; the unchanged scan and narrative
-- sources are reused but the new version receives a fresh explicit approval.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,client_id,scan_id,sequence,actor,payload)
values ('s1g_revision_approved','runtime.review.approved','s1g_run','s1g_run','intelligence_run','s1g_client','s1g_scan',5,
  '00000000-0000-4000-8000-000000000081',jsonb_build_object('by','00000000-0000-4000-8000-000000000081',
  'binding',public.bl_scanner_sales_current_binding('s1g_run')));
select lives_ok(format('select public.bl_create_scanner_sales_revision(%L)',
  (select proposal_id from public.scanner_sales_conversions where run_id='s1g_run')),
  'freshly approved commercial revision reuses the original scanner run');
select is((select count(*)::int from public.scanner_sales_conversions where run_id='s1g_run'),1,
  'commercial revision preserves the one-conversion-per-run invariant');
select is((select count(*)::int from public.scanner_sales_proposal_revisions where conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run')),1,
  'revision creates separate immutable canonical proposal lineage');
select is((select status::text from public.proposals where id=(select proposal_id from public.scanner_sales_proposal_revisions where conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run'))),
  'draft','revision remains private until explicit publication');
select ok(not exists(select 1 from public.scanner_sales_offer_heads h join public.scanner_sales_conversions c on c.id=h.conversion_id where c.run_id='s1g_run'
  and h.proposal_id=(select proposal_id from public.scanner_sales_proposal_revisions where conversion_id=c.id)),
  'preparing a revision does not supersede the current published offer');
select ok(not ((select client_safe_snapshot::text from public.scanner_sales_proposal_revisions where conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run')) ~ 'PRIVATE|private-evidence|private-report-id'),
  'revision snapshot excludes internal notes and evidence references');

-- The portal cannot see the private successor draft.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals),1,'private successor remains hidden before publication');
reset role;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
select ok((public.bl_publish_scanner_sales_proposal(
  (select proposal_id from public.scanner_sales_proposal_revisions where conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run')),
  's1g_client','s1g_client_user','USD',7500,'2099-12-31')->>'published')::boolean,
  'approved successor publishes as a separate canonical offer');
select is((select count(*)::int from public.scanner_sales_publications where conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run')),
  2,'publication history contains original and successor');
select is((select proposal_id from public.scanner_sales_offer_heads where conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run')),
  (select proposal_id from public.scanner_sales_proposal_revisions where conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run')),
  'successor becomes the single current published offer');
select is((select status::text from public.proposals where id=(select proposal_id from public.scanner_sales_conversions where run_id='s1g_run')),
  'revised','old unaccepted proposal becomes superseded only when successor is published');
select is((select response_kind from public.scanner_sales_client_responses where response_kind='superseded' and conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run')),
  'superseded','supersession is recorded in immutable response history');
select ok((public.bl_publish_scanner_sales_proposal(
  (select proposal_id from public.scanner_sales_proposal_revisions where conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run')),
  's1g_client','s1g_client_user','USD',7500,'2099-12-31')->>'replayed')::boolean,
  'successor publication retry is idempotent while it remains current');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000082","app_metadata":{"role":"client_admin","client_id":"s1g_client"}}',true);
set local role authenticated;
select throws_ok(format('select public.bl_client_scanner_proposal_response(%L,%L,%L,%L)',
  public.bl_client_scanner_proposal_contents()->1->>'proposalId','accept',
  public.bl_client_scanner_proposal_contents()->1->>'snapshotChecksum','') ,
  '40001','Only the current published offer can receive a response','superseded offer cannot be accepted');
select ok((public.bl_client_scanner_proposal_contents()->0->>'isCurrent')::boolean,'portal marks the successor as current');
select is((public.bl_client_scanner_proposal_response(
  public.bl_client_scanner_proposal_contents()->0->>'proposalId',
  'accept',public.bl_client_scanner_proposal_contents()->0->>'snapshotChecksum','')->>'status'),
  'accepted','client explicitly accepts exact current published snapshot');
select ok((public.bl_client_scanner_proposal_response(
  public.bl_client_scanner_proposal_contents()->0->>'proposalId',
  'accept',public.bl_client_scanner_proposal_contents()->0->>'snapshotChecksum','')->>'replayed')::boolean,
  'duplicate acceptance returns the immutable accepted result');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000081","app_metadata":{"role":"owner"}}',true);
select throws_ok(format('select public.bl_create_scanner_sales_revision(%L)',
  (select proposal_id from public.scanner_sales_proposal_revisions where conversion_id=(select id from public.scanner_sales_conversions where run_id='s1g_run'))),
  '55000','Accepted offers cannot be revised; amendment workflow requires separate approval',
  'accepted offer requires a separately approved amendment workflow');
select is((select count(*)::int from public.contracts),0,'acceptance does not create contracts');
select is((select count(*)::int from public.invoices),0,'acceptance does not create invoices');
select is((select count(*)::int from public.payments),0,'acceptance does not create payments');
select * from finish();
rollback;
