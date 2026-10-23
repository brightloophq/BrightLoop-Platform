-- Sprint 1F: atomic scanner-to-sales conversion and private proposal visibility.
begin;
create extension if not exists pgtap;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000071', 'authenticated', 'authenticated', 's1f-owner@example.invalid', '', now(), '{"role":"owner"}', '{}', now(), now()),
  ('00000000-0000-4000-8000-000000000072', 'authenticated', 'authenticated', 's1f-client@example.invalid', '', now(), '{"role":"client_admin","client_id":"s1f_client"}', '{}', now(), now()),
  ('00000000-0000-4000-8000-000000000074', 'authenticated', 'authenticated', 's1f-admin@example.invalid', '', now(), '{"role":"admin"}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.clients (id, company, industry) values ('s1f_client', 'S1F Example Co', 'Services');
insert into public.users (id, auth_user_id, name, email, role, client_id, status) values
  ('s1f_owner', '00000000-0000-4000-8000-000000000071', 'S1F Owner', 's1f-owner@example.invalid', 'owner', null, 'active'),
  ('s1f_admin', '00000000-0000-4000-8000-000000000074', 'S1F Admin', 's1f-admin@example.invalid', 'admin', null, 'active'),
  ('s1f_client_user', '00000000-0000-4000-8000-000000000072', 'S1F Client', 's1f-client@example.invalid', 'client_admin', 's1f_client', 'active');
insert into public.intelligence_runs (id, client_id, scan_id, status, idempotency_key, metadata)
values ('s1f_run', 's1f_client', 's1f_scan', 'completed', 's1f_run_key',
  '{"businessName":"S1F Example Co","rootUrl":"https://example.invalid","contactName":"Client Contact","email":"client@example.invalid","industry":"Services","notes":"PRIVATE SCANNER NOTE"}');
insert into public.intelligence_artifacts (id, run_id, client_id, scan_id, kind, version, checksum,
  validation_status, envelope, idempotency_key)
values ('s1f_report', 's1f_run', 's1f_client', 's1f_scan', 'internal_intelligence_report', 1,
  'report-sum', 'valid', '{"privateReportArtifact":"DO NOT COPY"}', 's1f_report_key');
insert into public.runtime_events (id, event_type, run_id, stage, aggregate_id, aggregate_type, client_id,
  scan_id, sequence, payload)
values ('s1f_comp_done', 'runtime.commercial.stage_completed', 's1f_run', 'competitor_intelligence',
  's1f_run', 'intelligence_run', 's1f_client', 's1f_scan', 1, '{"status":"insufficient_evidence"}');
insert into public.proposal_versions (id, run_id, client_id, scan_id, status, version, checksum,
  envelope, idempotency_key)
values ('s1f_proposal_v1', 's1f_run', 's1f_client', 's1f_scan', 'needs_review', 1, 'proposal-sum',
  '{
    "status":"draft_ready","commercialState":"priced",
    "executiveSummary":"Client-safe summary","observedSituation":"Observed situation",
    "keyIssues":[{"title":"Issue","detail":"Client-safe issue","evidenceIds":["internal-evidence-id"]}],
    "opportunities":[{"title":"Opportunity","detail":"Client-safe opportunity","evidenceIds":["internal-evidence-id"]}],
    "recommendedWork":[
      {"sourceId":"work_once","title":"One-time work","solution":"Improve the site","priority":"high","effort":"medium","evidenceIds":["internal-evidence-id"]},
      {"sourceId":"work_monthly","title":"Monthly work","solution":"Maintain improvements","priority":"medium","effort":"small","evidenceIds":["internal-evidence-id"]}
    ],
    "proposedNextStep":"Discuss the plan",
    "pricing":{"currency":"EUR","items":[
      {"sourceId":"work_once","pricingType":"one_time","amountMinor":5000,"cadence":null,"quantity":2,"optional":false,"adminNotes":"PRIVATE ADMIN NOTE"},
      {"sourceId":"work_monthly","pricingType":"recurring","amountMinor":1000,"cadence":"monthly","quantity":2,"optional":false,"adminNotes":"PRIVATE LINE NOTE"}
    ],"discountMinor":1000,"subtotalOneTimeMinor":10000,"totalOneTimeMinor":9000,
      "totalRecurringMonthlyMinor":2000,"validUntil":"2099-12-31","commercialNotes":"PRIVATE COMMERCIAL NOTE"}
  }'::jsonb, 's1f_proposal_key');
insert into public.narrative_versions (id, run_id, client_id, scan_id, audience, status, version,
  checksum, envelope, idempotency_key)
values ('s1f_narrative_v1', 's1f_run', 's1f_client', 's1f_scan', 'client', 'needs_review', 1,
  'narrative-sum', '{"status":"ready","sections":[{"key":"observed","heading":"What we observed","paragraphs":["Approved client narrative."],"supportingArtifacts":["internal-report-id"]}]}', 's1f_narrative_key');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000071","app_metadata":{"role":"owner"}}', true);
insert into public.runtime_events (id, event_type, run_id, stage, aggregate_id, aggregate_type, client_id,
  scan_id, sequence, actor, payload)
values ('s1f_approved', 'runtime.review.approved', 's1f_run', null, 's1f_run', 'intelligence_run',
  's1f_client', 's1f_scan', 2, '00000000-0000-4000-8000-000000000071',
  '{"by":"00000000-0000-4000-8000-000000000071","binding":{"schemaVersion":1,"proposal":{"id":"s1f_proposal_v1","version":1,"checksum":"proposal-sum"},"narrative":{"id":"s1f_narrative_v1","version":1,"checksum":"narrative-sum"},"report":{"id":"s1f_report","version":1,"checksum":"report-sum"},"competitor":null,"coreProposal":null}}');

select lives_ok($$select public.bl_convert_scanner_package('s1f_run','s1f-idempotency-key-0001')$$,
  'owner converts a current approved ready package');
select is((select count(*)::int from public.scanner_sales_conversions where run_id='s1f_run'), 1,
  'one conversion mapping is created');
select is((select count(*)::int from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id
  where c.run_id='s1f_run' and p.status='draft' and p.client_id='s1f_client'), 1,
  'one canonical private draft proposal is created for the source client');
select is((select p.currency from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  'EUR', 'currency is preserved');
select is((select p.discount_minor from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  1000::bigint, 'discount is preserved');
select is((select p.subtotal from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  10000::bigint, 'legacy subtotal derives from one-time lines');
select is((select p.total from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  9000::bigint, 'legacy total derives from discounted one-time amount');
select is((select p.valid_until from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  '2099-12-31'::date, 'expiry is preserved');
select is((select c.converted_by from public.scanner_sales_conversions c where c.run_id='s1f_run'),
  's1f_owner', 'conversion records verified actor identity');
select is((select c.source_binding -> 'narrative' ->> 'checksum' from public.scanner_sales_conversions c where c.run_id='s1f_run'),
  'narrative-sum', 'conversion binds the approved narrative checksum');
select is((select c.source_binding -> 'report' ->> 'id' from public.scanner_sales_conversions c where c.run_id='s1f_run'),
  's1f_report', 'conversion binds the current report identity');
select is((select c.client_safe_snapshot -> 'narrative' -> 0 -> 'paragraphs' ->> 0 from public.scanner_sales_conversions c where c.run_id='s1f_run'),
  'Approved client narrative.', 'approved client narrative is preserved');
select is((select c.client_safe_snapshot -> 'pricing' ->> 'totalRecurringMonthlyMinor' from public.scanner_sales_conversions c where c.run_id='s1f_run'),
  '2000', 'recurring totals are preserved in the canonical snapshot');
select ok(not ((select client_safe_snapshot::text from public.scanner_sales_conversions where run_id='s1f_run')
  ~ 'PRIVATE|internal-report-id|internal-evidence-id'), 'client-safe snapshot excludes private notes and internal artifact references');
select is((select line_items -> 0 ->> 'quantity' from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  '2', 'proposal preserves line quantity');
select is((select line_items -> 0 ->> 'unitAmountMinor' from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  '5000', 'proposal preserves per-unit minor-unit amount');
select is((select line_items -> 0 ->> 'amount' from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  '10000', 'proposal stores the line total consistently with canonical proposal rows');
select is((select line_items -> 1 ->> 'cadence' from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  'monthly', 'proposal preserves recurring cadence');
select is((select line_items -> 1 ->> 'amount' from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  '2000', 'proposal preserves recurring line total');
select is((select line_items -> 1 ->> 'optional' from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  'false', 'proposal preserves required/optional status');
select is((public.bl_convert_scanner_package('s1f_run','s1f-retry-key-00002')->>'replayed'), 'true',
  'a retry returns the existing conversion');
select is((select count(*)::int from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  1, 'retry creates no duplicate proposal for this scanner run');
select is((public.bl_get_scanner_sales_conversion('s1f_run')->>'proposalId'),
  (select proposal_id from public.scanner_sales_conversions where run_id='s1f_run'),
  'authorized internal lookup returns the canonical proposal link');
select throws_ok($$update public.scanner_sales_conversions set client_safe_snapshot='{}' where run_id='s1f_run'$$,
  '55000', 'scanner_sales_conversions is append-only', 'conversion snapshot cannot be updated');
select throws_ok($$delete from public.scanner_sales_conversions where run_id='s1f_run'$$,
  '55000', 'scanner_sales_conversions is append-only', 'conversion provenance cannot be deleted');
select throws_ok($$delete from public.proposals where id=(select proposal_id from public.scanner_sales_conversions where run_id='s1f_run')$$,
  '23503', null, 'canonical proposal cannot be deleted while immutable conversion provenance references it');
select throws_ok($$delete from public.intelligence_runs where id='s1f_run'$$,
  '55000', 'Reviewed source artifacts are append-only', 'source run deletion remains blocked by historical artifact immutability');
select is((select confdeltype::text from pg_constraint where conrelid='public.scanner_sales_conversions'::regclass
  and contype='f' and conkey=array[(select attnum from pg_attribute where attrelid='public.scanner_sales_conversions'::regclass and attname='client_id')]),
  'r', 'conversion mapping restricts deletion of its client');

-- Client visibility is status-gated in RLS, independently of portal filtering.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000072","app_metadata":{"role":"client_admin","client_id":"s1f_client"}}', true);
set local role authenticated;
select is((select count(*)::int from public.proposals), 0, 'client cannot read a converted draft');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000071","app_metadata":{"role":"owner"}}', true);
select throws_ok(format('update public.proposals set status=''sent'' where id=%L',
  (select proposal_id from public.scanner_sales_conversions where run_id='s1f_run')),
  '42501','Converted proposals require the authorized publication operation',
  'a direct status update cannot publish a converted proposal');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000072","app_metadata":{"role":"client_admin","client_id":"s1f_client"}}', true);
set local role authenticated;
select is((select count(*)::int from public.proposals), 0, 'client continues to see no proposal until authorized publication');
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000073","app_metadata":{"role":"team_member"}}', true);
select throws_ok($$select public.bl_convert_scanner_package('s1f_run','s1f-team-key-00003')$$,
  '42501', 'Owner or admin authorization required', 'team member cannot convert');
select set_config('request.jwt.claims', '{"role":"service_role","sub":"00000000-0000-4000-8000-000000000071","app_metadata":{"role":"owner"}}', true);
select throws_ok($$select public.bl_convert_scanner_package('s1f_run','s1f-service-key-00004')$$,
  '42501', 'Owner or admin authorization required', 'service role cannot forge an owner conversion');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000074","app_metadata":{"role":"admin"}}', true);
select throws_ok($$select public.bl_convert_scanner_package('missing_admin_run','s1f-admin-key-00004')$$,
  '40001', 'Scanner run is incomplete or unavailable', 'active admin identity passes authorization and reaches package validation');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000071","app_metadata":{"role":"owner"}}', true);
insert into public.proposal_versions (id, run_id, client_id, scan_id, status, supersedes_id, version, checksum, envelope, idempotency_key)
values ('s1f_proposal_v2', 's1f_run', 's1f_client', 's1f_scan', 'needs_review', 's1f_proposal_v1', 2, 'proposal-sum-v2',
  (select envelope from public.proposal_versions where id='s1f_proposal_v1'), 's1f_proposal_v2_key');
select throws_ok($$select public.bl_convert_scanner_package('s1f_run','s1f-stale-key-00005')$$,
  '40001', 'No current approval is bound to this package', 'revised proposal invalidates the previous approval and conversion retry');
select is((select count(*)::int from public.proposals p join public.scanner_sales_conversions c on c.proposal_id=p.id where c.run_id='s1f_run'),
  1, 'stale retry creates no second proposal for this scanner run');
insert into public.intelligence_runs (id, client_id, scan_id, status, idempotency_key, metadata)
values ('s1f_incomplete_run', 's1f_client', 's1f_incomplete_scan', 'pending', 's1f_incomplete_key', '{}');
select throws_ok($$select public.bl_convert_scanner_package('s1f_incomplete_run','s1f-incomplete-key-00006')$$,
  '40001', 'Scanner run is incomplete or unavailable', 'incomplete scans cannot be converted');

select * from finish();
rollback;
