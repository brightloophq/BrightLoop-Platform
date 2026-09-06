begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.clients (id, company) values ('cli_edit', 'Quote Editing Client');
insert into public.leads (id, name, company, email) values ('lead_edit', 'Lead', 'Quote Editing Lead', 'quote-edit@example.test');
insert into public.conversations (id, client_id, subject) values ('conv_edit', 'cli_edit', 'Commercial editing');
insert into auth.users (id) values
  ('40000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002'),
  ('40000000-0000-0000-0000-000000000003');
insert into public.users (id, auth_user_id, name, email, role, client_id) values
  ('usr_edit_owner', '40000000-0000-0000-0000-000000000001', 'Owner', 'owner-edit@example.test', 'owner', null),
  ('usr_edit_client', '40000000-0000-0000-0000-000000000002', 'Client', 'client-edit@example.test', 'client_admin', 'cli_edit'),
  ('usr_edit_team', '40000000-0000-0000-0000-000000000003', 'Team', 'team-edit@example.test', 'team_member', null);
insert into public.conversation_participants (conversation_id, user_id) values ('conv_edit', 'usr_edit_client');

insert into public.intelligence_runs (id, lead_id, scan_id, status, idempotency_key, created_by)
values ('run_edit', 'lead_edit', 'scan_edit', 'completed', 'idem_run_edit', 'usr_edit_owner');
insert into public.proposal_versions (id, run_id, scan_id, status, version, checksum, envelope, idempotency_key, created_by)
values ('pv_edit', 'run_edit', 'scan_edit', 'needs_review', 1, 'sum-edit', '{"status":"draft_ready","recommendedWork":[{"sourceId":"work:edit","title":"Original work","solution":"Original scope","evidenceIds":["ev:edit"]}]}'::jsonb, 'idem_pv_edit', 'usr_edit_owner');
insert into public.runtime_events (id,event_type,run_id,aggregate_id,aggregate_type,scan_id,sequence,payload,actor)
values ('evt_edit','runtime.review.approved','run_edit','run_edit','intelligence_run','scan_edit',1,'{"proposalVersionId":"pv_edit","proposalChecksum":"sum-edit"}','usr_edit_owner');

insert into public.quotes (id, lead_id, commercial_mode, title, status, source_run_id, source_proposal_version_id, source_review_event_id, promotion_key, created_by)
values ('qte_edit', 'lead_edit', 'proposal_only', 'Commercial scope', 'draft', 'run_edit', 'pv_edit', 'evt_edit', 'promo:run_edit:pv_edit:evt_edit', 'usr_edit_owner');
insert into public.quote_items (id, quote_id, label, description, quantity, unit_amount, amount, sort, source_work_item_id, source_evidence_refs)
values ('qit_edit_source', 'qte_edit', 'Original work', 'Original scope', 1, null, null, 0, 'work:edit', '["ev:edit"]');

insert into public.quotes (id, conversation_id, client_id, commercial_mode, title, status, created_by)
values ('qte_edit_legacy', 'conv_edit', 'cli_edit', 'legacy_client_quote', 'Legacy quote', 'draft', 'usr_edit_owner');
insert into public.quote_items (id, quote_id, label, quantity, unit_amount, amount)
values ('qit_edit_legacy', 'qte_edit_legacy', 'Legacy item', 1, 100, 100);

select is((select commercial_mode from public.quotes where id='qte_edit_legacy'), 'legacy_client_quote', 'legacy mode remains unchanged');
select is((select unit_amount from public.quote_items where id='qit_edit_source'), null, 'proposal-only scanner item starts unpriced');
select is((select amount from public.quote_items where id='qit_edit_source'), null, 'unpriced amount is null');
select is(
  (select count(*)::int from public.quote_items qi join public.quotes q on q.id=qi.quote_id
   where q.commercial_mode='proposal_only' and qi.source_work_item_id is not null
     and qi.unit_amount=0 and qi.amount=0),
  0,
  'clean migration replay leaves no scanner-sourced proposal item in ambiguous placeholder 0/0 state'
);

select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select results_eq(
  $$ select subtotal, discount, total, recurring_total, recurring_cadence, optional_one_time_total, optional_recurring_total, pricing_complete, item_count
     from public.bl_save_quote_commercial(
       'qte_edit', (select updated_at from public.quotes where id='qte_edit'), 'Priced scope', 'Commercial note', 'USD', 3000, '2026-12-31',
       '[{"id":"qit_edit_source","label":"Edited work","description":"Edited scope","quantity":2,"unitAmount":1000,"pricingType":"one_time","recurrenceCadence":null,"optional":false},{"label":"Managed service","description":"Operate it","quantity":3,"unitAmount":500,"pricingType":"recurring","recurrenceCadence":"monthly","optional":false},{"label":"Optional workshop","description":"Workshop","quantity":1,"unitAmount":250,"pricingType":"one_time","recurrenceCadence":null,"optional":true},{"label":"Optional support","description":"Support","quantity":2,"unitAmount":300,"pricingType":"recurring","recurrenceCadence":"monthly","optional":true},{"label":"Optional discovery","description":"Later","quantity":1,"unitAmount":null,"pricingType":"one_time","recurrenceCadence":null,"optional":true}]'::jsonb
     ) $$,
  $$ values (2000::bigint,2000::bigint,0::bigint,1500::bigint,'monthly'::text,250::bigint,600::bigint,true,5) $$,
  'RPC derives separated totals, clamps discount, and ignores optional unpriced completeness'
);
select is((select title from public.quotes where id='qte_edit'), 'Priced scope', 'quote metadata is saved atomically');
select is((select currency from public.quotes where id='qte_edit'), 'USD', 'quote owns uppercase currency');
select is((select valid_until::text from public.quotes where id='qte_edit'), '2026-12-31', 'validity is stored on quote');
select is((select amount from public.quote_items where id='qit_edit_source'), 2000::bigint, 'amount is server-derived from quantity and unit amount');
select is((select source_work_item_id from public.quote_items where id='qit_edit_source'), 'work:edit', 'existing scanner item updates in place with work lineage');
select is((select source_evidence_refs from public.quote_items where id='qit_edit_source'), '["ev:edit"]'::jsonb, 'existing scanner evidence lineage remains intact');
select is((select count(*)::int from public.quote_items where quote_id='qte_edit' and source_work_item_id is null), 4, 'operator-created items have no scanner work lineage');
select is(
  (select persisted_items->0->>'id' from public.bl_save_quote_commercial(
    'qte_edit', (select updated_at from public.quotes where id='qte_edit'), 'Priced scope', 'Commercial note', 'USD', 2000, '2026-12-31',
    (select jsonb_agg(jsonb_build_object(
      'id',id,'label',label,'description',description,'quantity',quantity,'unitAmount',unit_amount,
      'pricingType',pricing_type,'recurrenceCadence',recurrence_cadence,'optional',optional
    ) order by sort) from public.quote_items where quote_id='qte_edit')
  )),
  (select id from public.quote_items where quote_id='qte_edit' order by sort limit 1),
  'RPC returns authoritative persisted item identities'
);

select throws_ok(
  $$ select * from public.bl_save_quote_commercial('qte_edit','2026-01-01T00:00:00Z','Stale','', 'USD',0,null,'[]'::jsonb) $$,
  '40001', 'Quote was updated by another editor', 'stale expected updated_at is rejected'
);
select throws_ok(
  $$ select * from public.bl_save_quote_commercial('qte_edit',(select updated_at from public.quotes where id='qte_edit'),'Mixed','', 'USD',0,null,'[{"id":"qit_edit_source","label":"A","description":"","quantity":1,"unitAmount":1,"pricingType":"recurring","recurrenceCadence":"monthly","optional":false},{"label":"B","description":"","quantity":1,"unitAmount":1,"pricingType":"recurring","recurrenceCadence":"annual","optional":false}]'::jsonb) $$,
  '23514', 'A quote may use only one recurring cadence', 'mixed recurrence is rejected'
);
select throws_ok(
  $$ select * from public.bl_save_quote_commercial('qte_edit',(select updated_at from public.quotes where id='qte_edit'),'Bad','', 'USD',0,null,'[{"id":"unknown","label":"A","description":"","quantity":1,"unitAmount":1,"pricingType":"one_time","recurrenceCadence":null,"optional":false}]'::jsonb) $$,
  '22023', 'Unknown quote item id', 'unknown item id is rejected'
);
select throws_ok(
  $$ select * from public.bl_save_quote_commercial('qte_edit',(select updated_at from public.quotes where id='qte_edit'),'Bad','', 'USD',0,null,'[{"id":"qit_edit_source","label":"A","description":"","quantity":1,"unitAmount":1,"pricingType":"one_time","recurrenceCadence":null,"optional":false},{"id":"qit_edit_source","label":"B","description":"","quantity":1,"unitAmount":1,"pricingType":"one_time","recurrenceCadence":null,"optional":false}]'::jsonb) $$,
  '22023', 'Duplicate quote item id', 'duplicate item id is rejected'
);
select throws_ok(
  $$ select * from public.bl_save_quote_commercial('qte_edit',(select updated_at from public.quotes where id='qte_edit'),'Currency','', 'EUR',0,null,'[]'::jsonb) $$,
  '23514', 'Quote currency cannot change after pricing begins', 'currency is immutable after any item is priced'
);
select throws_ok(
  $$ update public.quotes set currency='EUR' where id='qte_edit' $$,
  '23514', 'Quote currency cannot change after pricing begins', 'direct owner update cannot bypass priced currency immutability'
);
select is((select currency from public.quotes where id='qte_edit'), 'USD', 'failed direct currency update leaves currency unchanged');

select throws_ok($$ insert into public.quote_items(id,quote_id,label,quantity,unit_amount,amount) values ('bad_qty','qte_edit','Bad',0,0,0) $$, '23514', null, 'quantity lower bound is enforced');
select throws_ok($$ insert into public.quote_items(id,quote_id,label,quantity,unit_amount,amount) values ('bad_qty_hi','qte_edit','Bad',10000,0,0) $$, '23514', null, 'quantity upper bound is enforced');
select throws_ok($$ insert into public.quote_items(id,quote_id,label,quantity,unit_amount,amount) values ('bad_pair','qte_edit','Bad',1,null,0) $$, '23514', null, 'nullable price pair is enforced');
select throws_ok($$ insert into public.quote_items(id,quote_id,label,quantity,unit_amount,amount) values ('bad_amount','qte_edit','Bad',2,10,19) $$, '23514', null, 'amount must equal quantity times unit amount');
select throws_ok($$ update public.quotes set currency='usd' where id='qte_edit' $$, '23514', null, 'currency format is enforced');
select throws_ok($$ update public.quotes set recurring_total=-1 where id='qte_edit' $$, '23514', null, 'nonnegative quote totals are enforced');

select lives_ok(
  $$ select * from public.bl_save_quote_commercial('qte_edit_legacy',(select updated_at from public.quotes where id='qte_edit_legacy'),'Legacy edited','', 'USD',0,null,'[{"id":"qit_edit_legacy","label":"Legacy item","description":"","quantity":2,"unitAmount":100,"pricingType":"one_time","recurrenceCadence":null,"optional":false}]'::jsonb) $$,
  'legacy quote uses the same authoritative pricing RPC'
);
select is((select total from public.quotes where id='qte_edit_legacy'), 200::bigint, 'legacy totals remain compatible');

create temp table legacy_free_response as
select * from public.bl_save_quote_commercial(
  'qte_edit_legacy', (select updated_at from public.quotes where id='qte_edit_legacy'),
  'Free scope', '', 'USD', 0, null,
  '[{"label":"Free required work","description":"","quantity":1,"unitAmount":0,"pricingType":"one_time","recurrenceCadence":null,"optional":false}]'::jsonb
);
select ok((select pricing_complete from legacy_free_response), 'a deliberately free required item is pricing-complete');
select is((select subtotal from legacy_free_response), 0::bigint, 'free required item keeps subtotal zero');
select is((select total from legacy_free_response), 0::bigint, 'free required item keeps total zero');
select is((select unit_amount from public.quote_items where quote_id='qte_edit_legacy'), 0::bigint, 'free item persists zero unit amount');
select is((select amount from public.quote_items where quote_id='qte_edit_legacy'), 0::bigint, 'free item persists zero amount');
select is((select persisted_items->0->>'id' from legacy_free_response), (select id from public.quote_items where quote_id='qte_edit_legacy'), 'new item response contains its persisted id');

create temp table legacy_unpriced_response as
select * from public.bl_save_quote_commercial(
  'qte_edit_legacy', (select updated_at from public.quotes where id='qte_edit_legacy'),
  'Unpriced scope', '', 'USD', 0, null,
  jsonb_build_array(jsonb_build_object(
    'id',(select persisted_items->0->>'id' from legacy_free_response),
    'label','Free required work','description','','quantity',1,'unitAmount',null,
    'pricingType','one_time','recurrenceCadence',null,'optional',false
  ))
);
select isnt((select persisted_items->0->>'id' from legacy_unpriced_response), null, 'second save returns the persisted item id');
select is((select persisted_items->0->>'id' from legacy_unpriced_response), (select persisted_items->0->>'id' from legacy_free_response), 'second save updates the same persisted item identity');
select is((select count(*)::int from public.quote_items where quote_id='qte_edit_legacy'), 1, 'second save does not insert or replace the item');
select isnt((select pricing_complete from legacy_unpriced_response), true, 'required NULL price is incomplete');
select is((select unit_amount from public.quote_items where quote_id='qte_edit_legacy'), null, 'unpriced item persists NULL unit amount');
select is((select amount from public.quote_items where quote_id='qte_edit_legacy'), null, 'unpriced item persists NULL amount');

create temp table legacy_empty_response as
select * from public.bl_save_quote_commercial(
  'qte_edit_legacy', (select updated_at from public.quotes where id='qte_edit_legacy'),
  'Empty scope', '', 'USD', 999, null, '[]'::jsonb
);
select is((select count(*)::int from public.quote_items where quote_id='qte_edit_legacy'), 0, 'empty save removes all quote items atomically');
select is((select item_count from legacy_empty_response), 0, 'empty quote returns zero item count');
select isnt((select pricing_complete from legacy_empty_response), true, 'empty quote is incomplete');
select results_eq(
  $$ select subtotal,discount,total,recurring_total,optional_one_time_total,optional_recurring_total,recurring_cadence from legacy_empty_response $$,
  $$ values (0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,null::text) $$,
  'empty quote resets all aggregates, clamps discount, and clears cadence'
);

-- Required scope may remain unpriced while review proceeds; completeness is derived.
select lives_ok(
  $$ select * from public.bl_save_quote_commercial('qte_edit',(select updated_at from public.quotes where id='qte_edit'),'Incomplete','', 'USD',0,null,'[{"id":"qit_edit_source","label":"Required","description":"","quantity":1,"unitAmount":null,"pricingType":"one_time","recurrenceCadence":null,"optional":false}]'::jsonb) $$,
  'required scope may be saved unpriced while still draft'
);
select lives_ok($$ update public.quotes set status='internal_review' where id='qte_edit' $$, 'proposal-only internal review is not blocked by incomplete pricing');

insert into public.quote_items (
  id, quote_id, label, description, quantity, unit_amount, amount, sort,
  source_work_item_id, source_evidence_refs
) values (
  'qit_edit_source_keep', 'qte_edit', 'Retained scanner scope', '', 1, null, null, 1,
  'work:keep', '["ev:keep"]'::jsonb
);
select lives_ok(
  $$ select * from public.bl_save_quote_commercial(
    'qte_edit',(select updated_at from public.quotes where id='qte_edit'),'Reduced scope','', 'USD',0,null,
    '[{"id":"qit_edit_source_keep","label":"Retained scanner scope","description":"","quantity":1,"unitAmount":100,"pricingType":"one_time","recurrenceCadence":null,"optional":false}]'::jsonb
  ) $$,
  'explicit sourced-item removal succeeds without a lineage mutation error'
);
select is((select count(*)::int from public.quote_items where id='qit_edit_source'), 0, 'omitted sourced item is deleted');
select is((select source_work_item_id from public.quote_items where id='qit_edit_source_keep'), 'work:keep', 'remaining sourced item retains work-item lineage');
select is((select source_evidence_refs from public.quote_items where id='qit_edit_source_keep'), '["ev:keep"]'::jsonb, 'remaining sourced item retains evidence lineage');
select results_eq(
  $$ select subtotal,total from public.quotes where id='qte_edit' $$,
  $$ values (100::bigint,100::bigint) $$,
  'totals are recalculated after explicit sourced-item removal'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000003","app_metadata":{"role":"team_member"}}', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.bl_save_quote_commercial('qte_edit',(select updated_at from public.quotes where id='qte_edit'),'Nope','', 'USD',0,null,'[]'::jsonb) $$,
  '42501', 'Commercial quote editing requires clients.update', 'team member is rejected by RPC'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000002","app_metadata":{"role":"client_admin","client_id":"cli_edit"}}', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.bl_save_quote_commercial('qte_edit_legacy',(select updated_at from public.quotes where id='qte_edit_legacy'),'Nope','', 'USD',0,null,'[]'::jsonb) $$,
  '42501', 'Commercial quote editing requires clients.update', 'client caller is rejected by RPC'
);
select is((select count(*)::int from public.quotes where id='qte_edit'), 0, 'client still cannot read proposal-only quote');
select is((select count(*)::int from public.quote_items where quote_id='qte_edit'), 0, 'client still cannot read proposal-only items');

reset role;
select * from finish();
rollback;
