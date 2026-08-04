-- =============================================================================
-- pgTAP · Phase F · F5 — Billing & Subscription tables.
-- Existence + RLS + enum checks + optimistic concurrency (subscription/invoice) +
-- subscription & invoice transition guards + append-only usage/billing-event
-- ledgers + unique constraints (account/workspace, invoice/idempotency,
-- usage/idempotency) + tenant isolation (other-org sees nothing; same-org client
-- reads its billing but never writes) + finance-only payment-method writes.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_bil', 'Billing Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_bil_other', 'Other Billing Co') on conflict do nothing;

-- structure + RLS
select has_table('public', 'billing_account', 'account table exists');
select has_table('public', 'billing_subscription', 'subscription table exists');
select has_table('public', 'billing_invoice', 'invoice table exists');
select has_table('public', 'billing_payment_method', 'payment method table exists');
select has_table('public', 'billing_usage_event', 'usage event table exists');
select has_table('public', 'billing_event', 'billing event table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_account'::regclass), 'RLS on account');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_subscription'::regclass), 'RLS on subscription');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_invoice'::regclass), 'RLS on invoice');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_payment_method'::regclass), 'RLS on payment method');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_usage_event'::regclass), 'RLS on usage event');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_event'::regclass), 'RLS on billing event');

-- subscription machine seeded into state_transitions
select is((select count(*)::int from public.state_transitions where machine = 'subscription'), 16, 'subscription machine has 16 transitions');

-- seed as internal owner; everything belongs to cli_bil
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.billing_account (id, workspace_id, client_id) values ('ba_1','ws_bil','cli_bil') $$, 'insert account');
select throws_ok($$ insert into public.billing_account (id, workspace_id, client_id, status) values ('ba_bad','ws_bil2','cli_bil','nope') $$, '23514', null, 'invalid account status rejected');
select throws_ok($$ insert into public.billing_account (id, workspace_id, client_id) values ('ba_dup','ws_bil','cli_bil') $$, '23505', null, 'duplicate account (workspace) rejected');

select lives_ok($$ insert into public.billing_subscription (id, workspace_id, client_id, billing_account_id, plan_id, tier, interval) values ('bs_1','ws_bil','cli_bil','ba_1','professional','professional','month') $$, 'insert subscription');
select throws_ok($$ insert into public.billing_subscription (id, workspace_id, client_id, billing_account_id, plan_id, tier, interval, status) values ('bs_bad','ws_bil3','cli_bil','ba_1','professional','professional','month','nope') $$, '23514', null, 'invalid subscription status rejected');
select throws_ok($$ insert into public.billing_subscription (id, workspace_id, client_id, billing_account_id, plan_id, tier, interval) values ('bs_bad2','ws_bil4','cli_bil','ba_1','professional','platinum','month') $$, '23514', null, 'invalid subscription tier rejected');

-- subscription transition guard: legal trialing→active, then illegal active→expired
select lives_ok($$ update public.billing_subscription set status='active', version=2 where id='bs_1' and version=1 $$, 'subscription trialing→active v1→v2');
select throws_ok($$ update public.billing_subscription set status='expired' where id='bs_1' $$, '23514', null, 'illegal subscription transition active→expired rejected');
select lives_ok($$ update public.billing_subscription set status='past_due', version=3 where id='bs_1' and version=2 $$, 'subscription active→past_due v2→v3');

select lives_ok($$ insert into public.billing_invoice (id, workspace_id, client_id, billing_account_id, subscription_id, number, checksum, idempotency_key) values ('bi_1','ws_bil','cli_bil','ba_1','bs_1','INV-1','abc123','invoice:bs_1:2026-08-01') $$, 'insert invoice');
select throws_ok($$ insert into public.billing_invoice (id, workspace_id, client_id, billing_account_id, number, checksum, idempotency_key, status) values ('bi_bad','ws_bil','cli_bil','ba_1','INV-X','x','invoice:bs_1:x','nope') $$, '23514', null, 'invalid invoice status rejected');
select throws_ok($$ insert into public.billing_invoice (id, workspace_id, client_id, billing_account_id, number, checksum, idempotency_key) values ('bi_dup','ws_bil','cli_bil','ba_1','INV-2','y','invoice:bs_1:2026-08-01') $$, '23505', null, 'duplicate invoice idempotency key rejected');

-- invoice transition guard: illegal draft→paid, then legal draft→sent
select throws_ok($$ update public.billing_invoice set status='paid' where id='bi_1' $$, '23514', null, 'illegal invoice transition draft→paid rejected');
select lives_ok($$ update public.billing_invoice set status='sent', version=2 where id='bi_1' and version=1 $$, 'invoice draft→sent v1→v2');

select lives_ok($$ insert into public.billing_payment_method (id, workspace_id, client_id, billing_account_id, brand, last4) values ('pm_1','ws_bil','cli_bil','ba_1','visa','4242') $$, 'insert payment method');
select throws_ok($$ insert into public.billing_payment_method (id, workspace_id, client_id, billing_account_id, brand, last4) values ('pm_bad','ws_bil','cli_bil','ba_1','bitcoin','4242') $$, '23514', null, 'invalid payment brand rejected');
select throws_ok($$ insert into public.billing_payment_method (id, workspace_id, client_id, billing_account_id, brand, last4) values ('pm_bad2','ws_bil','cli_bil','ba_1','visa','12') $$, '23514', null, 'invalid last4 length rejected');

select lives_ok($$ insert into public.billing_usage_event (id, workspace_id, client_id, subscription_id, meter, quantity, occurred_at, idempotency_key) values ('bu_1','ws_bil','cli_bil','bs_1','ai_requests',5,now(),'usage:bs_1:ai_requests:1') $$, 'insert usage event');
select throws_ok($$ insert into public.billing_usage_event (id, workspace_id, client_id, subscription_id, meter, occurred_at, idempotency_key) values ('bu_bad','ws_bil','cli_bil','bs_1','dollars',now(),'usage:bs_1:dollars:1') $$, '23514', null, 'invalid usage meter rejected');
select throws_ok($$ insert into public.billing_usage_event (id, workspace_id, client_id, subscription_id, meter, occurred_at, idempotency_key) values ('bu_dup','ws_bil','cli_bil','bs_1','ai_requests',now(),'usage:bs_1:ai_requests:1') $$, '23505', null, 'duplicate usage idempotency key rejected');

select lives_ok($$ insert into public.billing_event (id, workspace_id, client_id, subscription_id, type, summary, correlation_id) values ('be_1','ws_bil','cli_bil','bs_1','subscription.created','Subscription created','corr_1') $$, 'insert billing event');

-- append-only: exercise the triggers as table owner
reset role;
select throws_ok($$ update public.billing_usage_event set quantity=9 where id='bu_1' $$, 'P0001', 'transformation_activity is append-only', 'usage event UPDATE blocked');
select throws_ok($$ delete from public.billing_usage_event where id='bu_1' $$, 'P0001', 'transformation_activity is append-only', 'usage event DELETE blocked');
select throws_ok($$ update public.billing_event set summary='x' where id='be_1' $$, 'P0001', 'transformation_activity is append-only', 'billing event UPDATE blocked');
select throws_ok($$ delete from public.billing_event where id='be_1' $$, 'P0001', 'transformation_activity is append-only', 'billing event DELETE blocked');

-- tenant isolation: another-org client sees nothing
select set_config('request.jwt.claims', '{"sub":"u_o","app_metadata":{"role":"client_admin","client_id":"cli_bil_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.billing_subscription), 0, 'other-org client reads 0 subscriptions');
select is((select count(*)::int from public.billing_invoice), 0, 'other-org client reads 0 invoices');
reset role;

-- same-org client: reads its billing, but NEVER writes
select set_config('request.jwt.claims', '{"sub":"u_c","app_metadata":{"role":"client_admin","client_id":"cli_bil"}}', true);
set local role authenticated;
select is((select count(*)::int from public.billing_account), 1, 'same-org client reads its account');
select is((select count(*)::int from public.billing_subscription), 1, 'same-org client reads its subscription');
select is((select count(*)::int from public.billing_invoice), 1, 'same-org client reads its invoice');
select is((select count(*)::int from public.billing_payment_method), 1, 'same-org client reads its payment method');
select is((select count(*)::int from public.billing_usage_event), 1, 'same-org client reads its usage event');
select is((select count(*)::int from public.billing_event), 1, 'same-org client reads its billing event');
-- a client may not write a subscription (internal-only write)
select throws_ok($$ insert into public.billing_subscription (id, workspace_id, client_id, billing_account_id, plan_id, tier, interval) values ('bs_c','ws_bil','cli_bil','ba_1','free','free','none') $$, '42501', null, 'client cannot write a subscription');
reset role;

-- finance-only payment-method writes: a team_member (internal but not finance) is rejected
select set_config('request.jwt.claims', '{"sub":"u_tm","app_metadata":{"role":"team_member"}}', true);
set local role authenticated;
select throws_ok($$ insert into public.billing_payment_method (id, workspace_id, client_id, billing_account_id, brand, last4) values ('pm_tm','ws_bil','cli_bil','ba_1','visa','1111') $$, '42501', null, 'team_member cannot write a payment method (finance-only)');
reset role;

select * from finish();
rollback;
