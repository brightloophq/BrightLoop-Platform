begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.clients(id,company) values ('cli_issue','Issued Client'),('cli_issue_other','Other Client');
insert into public.leads(id,name,company,email) values ('lead_issue','Lead','Lead Origin','issue@example.test');
insert into auth.users(id) values ('50000000-0000-0000-0000-000000000001'),('50000000-0000-0000-0000-000000000002'),('50000000-0000-0000-0000-000000000003'),('50000000-0000-0000-0000-000000000004');
insert into public.users(id,auth_user_id,name,email,role,client_id) values
 ('usr_issue_owner','50000000-0000-0000-0000-000000000001','Owner','issue-owner@example.test','owner',null),
 ('usr_issue_client','50000000-0000-0000-0000-000000000002','Client','issue-client@example.test','client_admin','cli_issue'),
 ('usr_issue_team','50000000-0000-0000-0000-000000000003','Team','issue-team@example.test','team_member',null),
 ('usr_issue_other','50000000-0000-0000-0000-000000000004','Other','issue-other@example.test','client_admin','cli_issue_other');
insert into public.intelligence_runs(id,lead_id,scan_id,status,idempotency_key,created_by) values ('run_issue','lead_issue','scan_issue','completed','idem_issue','usr_issue_owner');
insert into public.proposal_versions(id,run_id,scan_id,status,version,checksum,envelope,idempotency_key,created_by) values ('pv_issue','run_issue','scan_issue','needs_review',1,'sum-issue','{"status":"draft_ready","recommendedWork":[{"sourceId":"work:issue","title":"Work","solution":"Scope","evidenceIds":["ev:issue"]}]}','idem_pv_issue','usr_issue_owner');
insert into public.runtime_events(id,event_type,run_id,aggregate_id,aggregate_type,scan_id,sequence,payload,actor) values ('evt_issue','runtime.review.approved','run_issue','run_issue','intelligence_run','scan_issue',1,'{"proposalVersionId":"pv_issue","proposalChecksum":"sum-issue"}','usr_issue_owner');
insert into public.quotes(id,lead_id,commercial_mode,title,status,currency,subtotal,discount,total,recurring_total,recurring_cadence,optional_one_time_total,optional_recurring_total,source_run_id,source_proposal_version_id,source_review_event_id,promotion_key,created_by)
 values ('qte_issue','lead_issue','proposal_only','Canonical scope','internal_review','USD',2000,200,1800,500,'monthly',0,300,'run_issue','pv_issue','evt_issue','promo:run_issue:pv_issue:evt_issue','usr_issue_owner');
insert into public.quote_items(id,quote_id,label,description,quantity,unit_amount,amount,sort,pricing_type,recurrence_cadence,optional,source_work_item_id,source_evidence_refs) values
 ('qit_issue_1','qte_issue','Work','Scope',2,1000,2000,0,'one_time',null,false,'work:issue','["ev:issue"]'),
 ('qit_issue_2','qte_issue','Support','Monthly',1,500,500,1,'recurring','monthly',false,null,'[]'),
 ('qit_issue_3','qte_issue','Optional','Optional monthly',1,300,300,2,'recurring','monthly',true,null,'[]');

select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
select lives_ok($$select * from public.bl_review_proposal_quote('qte_issue',(select updated_at from public.quotes where id='qte_issue'),'approve')$$,'internal review can be approved');
select is((select status::text from public.quotes where id='qte_issue'),'approved','approval changes status');
select isnt((select commercial_approved_at from public.quotes where id='qte_issue'),null,'approval time recorded');
select is((select commercial_approved_by from public.quotes where id='qte_issue'),'usr_issue_owner','approver recorded');
select is((select commercial_approved_state from public.quotes where id='qte_issue'),(select updated_at from public.quotes where id='qte_issue'),'approval pins exact state');
select throws_ok($$select * from public.bl_save_quote_commercial('qte_issue',(select updated_at from public.quotes where id='qte_issue'),'No','', 'USD',0,null,'[]')$$,'23514',null,'approved quote cannot be commercially edited');
select throws_ok($$select * from public.bl_issue_canonical_proposal('qte_issue',(select updated_at from public.quotes where id='qte_issue'))$$,'23514','Bind an existing client before issuance','issuance requires explicit client binding');
select lives_ok($$select * from public.bl_bind_proposal_quote_client('qte_issue','cli_issue',(select updated_at from public.quotes where id='qte_issue'))$$,'existing client binding succeeds');
select is((select lead_id from public.quotes where id='qte_issue'),'lead_issue','lead provenance survives binding');
select is((select client_id from public.quotes where id='qte_issue'),'cli_issue','existing client is bound');
select throws_ok($$select * from public.bl_bind_proposal_quote_client('qte_issue','cli_issue_other',(select updated_at from public.quotes where id='qte_issue'))$$,'23514','Quote is not eligible for client binding','second client binding is rejected');

-- Binding changes updated_at after approval, so approval must be refreshed explicitly.
select lives_ok($$select * from public.bl_review_proposal_quote('qte_issue',(select updated_at from public.quotes where id='qte_issue'),'revoke')$$,'approved quote can return to review');
select is((select commercial_approved_state from public.quotes where id='qte_issue'),null,'revoke clears approval pin');
select lives_ok($$select * from public.bl_review_proposal_quote('qte_issue',(select updated_at from public.quotes where id='qte_issue'),'approve')$$,'bound quote can be reapproved');
create temp table issued_result as select * from public.bl_issue_canonical_proposal('qte_issue',(select updated_at from public.quotes where id='qte_issue'));
select is((select outcome from issued_result),'created','issuance creates canonical proposal');
select is((select item_count from issued_result),3,'issuance snapshots every item including optional');
select is((select status::text from public.quotes where id='qte_issue'),'issued','source quote becomes issued');
select is((select proposal_id from public.quotes where id='qte_issue'),(select proposal_id from issued_result),'quote links issued proposal');
select is((select proposal_kind::text from public.proposals where id=(select proposal_id from issued_result)),'canonical_issued','canonical discriminator persisted');
select is((select status::text from public.proposals where id=(select proposal_id from issued_result)),'issued','issued is distinct from sent');
select is((select subtotal from public.proposals where id=(select proposal_id from issued_result)),2000::bigint,'one-time subtotal snapshotted');
select is((select total from public.proposals where id=(select proposal_id from issued_result)),1800::bigint,'discounted total snapshotted');
select is((select recurring_total from public.proposals where id=(select proposal_id from issued_result)),500::bigint,'recurring total snapshotted');
select is((select optional_recurring_total from public.proposals where id=(select proposal_id from issued_result)),300::bigint,'optional recurring total snapshotted');
select is((select count(*)::int from public.proposal_items where proposal_id=(select proposal_id from issued_result)),3,'authoritative proposal items created');
select is((select source_work_item_id from public.proposal_items where proposal_id=(select proposal_id from issued_result) and sort=0),'work:issue','scanner work coordinate copied');
select is((select source_evidence_refs from public.proposal_items where proposal_id=(select proposal_id from issued_result) and sort=0),'["ev:issue"]'::jsonb,'evidence coordinate copied');
select matches((select proposal_number::text from issued_result),'^AUX-P-[0-9]{6}$','human-readable number generated');
select is((select revision_number from public.proposals where id=(select proposal_id from issued_result)),1,'initial revision is one');
select is((select count(*)::int from public.transition_log where entity_id='qte_issue' and to_state='issued'),1,'issuance transition audited once');
select is((select outcome from public.bl_issue_canonical_proposal('qte_issue','2000-01-01'::timestamptz)),'already_issued','retry returns the existing proposal despite stale request state');
select is((select count(*)::int from public.proposals where source_quote_id='qte_issue'),1,'retry does not duplicate proposal');
select is((select count(*)::int from public.proposal_items where proposal_id=(select proposal_id from issued_result)),3,'retry does not duplicate items');
select is((select count(*)::int from public.transition_log where entity_id='qte_issue' and to_state='issued'),1,'retry does not duplicate transition audit');
select throws_ok(format('update public.proposals set total=9 where id=%L',(select proposal_id from issued_result)),'23514','Canonical proposal commercial snapshot is immutable','canonical snapshot cannot mutate');
delete from public.proposal_items where proposal_id=(select proposal_id from issued_result);
select is((select count(*)::int from public.proposal_items where proposal_id=(select proposal_id from issued_result)),3,'RLS prevents canonical item deletion');
select throws_ok(format($q$insert into public.contracts(id,proposal_id,client_id,status) values('con_bad_canonical',%L,'cli_issue','pending')$q$,(select proposal_id from issued_result)),'23514','Canonical issued proposals cannot enter the legacy contract flow','canonical contract creation is firewalled in DB');
select throws_ok($$insert into public.proposals(id,client_id,status,proposal_kind,source_quote_id,proposal_number,revision_number,currency,issued_at,issued_by,issuance_key) values('prp_forged','cli_issue','issued','canonical_issued','qte_issue','AUX-P-999999',1,'USD',now(),'usr_issue_owner','forged')$$,'42501','Canonical proposals may only be created by issuance','direct canonical proposal creation is rejected');

-- Client can read its issued snapshot but cannot use the legacy action RPC.
reset role;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000002","app_metadata":{"role":"client_admin","client_id":"cli_issue"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals where proposal_kind='canonical_issued'),1,'owning client reads canonical proposal');
select is((select count(*)::int from public.proposal_items),3,'owning client reads canonical items');
select throws_ok($$select public.bl_client_proposal_action((select id from public.proposals where proposal_kind='canonical_issued'),'accept','')$$,'42501','Canonical issued proposals are read-only','canonical client acceptance is firewalled');

reset role;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000003","app_metadata":{"role":"team_member"}}',true);
set local role authenticated;
select throws_ok($$select * from public.bl_review_proposal_quote('qte_issue',(select updated_at from public.quotes where id='qte_issue'),'approve')$$,'42501','Quote approval requires owner/admin','team member cannot approve');

reset role;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000004","app_metadata":{"role":"client_admin","client_id":"cli_issue_other"}}',true);
set local role authenticated;
select is((select count(*)::int from public.proposals where proposal_kind='canonical_issued'),0,'other client cannot enumerate canonical proposal');
select is((select count(*)::int from public.proposal_items),0,'other client cannot enumerate canonical items');

-- Legacy defaults and actions remain intact.
reset role;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
insert into public.proposals(id,client_id,status,line_items,subtotal,deposit,total) values ('prp_legacy_issue','cli_issue','sent','[]',0,0,0);
select is((select proposal_kind::text from public.proposals where id='prp_legacy_issue'),'legacy_sales','legacy proposal kind remains default');

reset role;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000002","app_metadata":{"role":"client_admin","client_id":"cli_issue"}}',true);
set local role authenticated;
select is(public.bl_client_proposal_action('prp_legacy_issue','view','')::text,'viewed','legacy client view still works');
select is(public.bl_client_proposal_action('prp_legacy_issue','accept','')::text,'accepted','legacy client acceptance still works');

select * from finish();
rollback;
