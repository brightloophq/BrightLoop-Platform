-- =============================================================================
-- pgTAP · Phase D · D7 — Collaboration tables.
-- Existence + RLS + FKs + checks + unique constraints + optimistic concurrency
-- (inbox) + append-only mentions/notifications + tenant isolation + the added
-- activity.actor_id column.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_c', 'Collab Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_c_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'collaboration_subscription', 'subscription table exists');
select has_table('public', 'collaboration_mention', 'mention table exists');
select has_table('public', 'collaboration_notification', 'notification table exists');
select has_table('public', 'collaboration_inbox_item', 'inbox item table exists');
select has_table('public', 'collaboration_read_receipt', 'read receipt table exists');
select has_column('public', 'transformation_activity', 'actor_id', 'activity.actor_id column added');
select ok((select relrowsecurity from pg_class where oid = 'public.collaboration_inbox_item'::regclass), 'RLS on inbox item');
select ok((select relrowsecurity from pg_class where oid = 'public.collaboration_notification'::regclass), 'RLS on notification');

-- seed a workspace + initiative as internal owner
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

insert into public.transformation_workspace (id, client_id, scan_run_id, title, seed_checksum) values ('txw_c', 'cli_c', 'run_c', 'WS', 'chk_c');
insert into public.transformation_initiative (id, workspace_id, client_id, source_proposal_item_id, title, priority, effort, business_impact) values ('init_c', 'txw_c', 'cli_c', 'p:a', 'A', 'high', 'small', 'high');

-- subscription: insert + unique + target-type check
select lives_ok($$ insert into public.collaboration_subscription (id, user_id, workspace_id, client_id, target_type, target_id) values ('sub_1', 'u_a', 'txw_c', 'cli_c', 'initiative', 'init_c') $$, 'insert subscription');
select throws_ok($$ insert into public.collaboration_subscription (id, user_id, workspace_id, client_id, target_type, target_id) values ('sub_dup', 'u_a', 'txw_c', 'cli_c', 'initiative', 'init_c') $$, '23505', null, 'duplicate subscription rejected');
select throws_ok($$ insert into public.collaboration_subscription (id, user_id, workspace_id, client_id, target_type, target_id) values ('sub_bad', 'u_a', 'txw_c', 'cli_c', 'nope', 'init_c') $$, '23514', null, 'invalid target type rejected');

-- mention: insert
select lives_ok($$ insert into public.collaboration_mention (id, workspace_id, client_id, subject_type, subject_id, mentioned_user_id, mentioned_by_user_id, note) values ('men_1', 'txw_c', 'cli_c', 'initiative', 'init_c', 'u_b', 'u_a', 'ping') $$, 'insert mention');

-- notification: insert + type check
select lives_ok($$ insert into public.collaboration_notification (id, workspace_id, client_id, recipient_user_id, type, subject_type, subject_id, summary) values ('ntf_1', 'txw_c', 'cli_c', 'u_b', 'mention', 'initiative', 'init_c', 'You were mentioned') $$, 'insert notification');
select throws_ok($$ insert into public.collaboration_notification (id, workspace_id, client_id, recipient_user_id, type, subject_type, subject_id, summary) values ('ntf_bad', 'txw_c', 'cli_c', 'u_b', 'nope', 'initiative', 'init_c', 'x') $$, '23514', null, 'invalid notification type rejected');

-- inbox: insert + unique + optimistic status write + status check
select lives_ok($$ insert into public.collaboration_inbox_item (id, user_id, workspace_id, client_id, notification_id, status) values ('inb_1', 'u_b', 'txw_c', 'cli_c', 'ntf_1', 'unread') $$, 'insert inbox item');
select throws_ok($$ insert into public.collaboration_inbox_item (id, user_id, workspace_id, client_id, notification_id, status) values ('inb_dup', 'u_b', 'txw_c', 'cli_c', 'ntf_1', 'unread') $$, '23505', null, 'duplicate inbox item per (user, notification) rejected');
select lives_ok($$ update public.collaboration_inbox_item set status = 'read', version = 2 where id = 'inb_1' and version = 1 $$, 'mark read v1→v2');
select throws_ok($$ update public.collaboration_inbox_item set status = 'bogus' where id = 'inb_1' $$, '23514', null, 'invalid inbox status rejected');

-- read receipt: insert + unique
select lives_ok($$ insert into public.collaboration_read_receipt (id, user_id, entity_type, entity_id) values ('rr_1', 'u_b', 'mention', 'men_1') $$, 'insert read receipt');
select throws_ok($$ insert into public.collaboration_read_receipt (id, user_id, entity_type, entity_id) values ('rr_dup', 'u_b', 'mention', 'men_1') $$, '23505', null, 'duplicate read receipt rejected');

-- append-only: mentions + notifications (exercise the trigger as table owner)
reset role;
select throws_ok($$ update public.collaboration_mention set note = 'x' where id = 'men_1' $$, 'P0001', 'transformation_activity is append-only', 'mention UPDATE blocked by trigger');
select throws_ok($$ delete from public.collaboration_notification where id = 'ntf_1' $$, 'P0001', 'transformation_activity is append-only', 'notification DELETE blocked by trigger');

-- tenant isolation: a client role sees none of the internal-only rows
select set_config('request.jwt.claims', '{"sub":"u_cli","app_metadata":{"role":"client_admin","client_id":"cli_c_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.collaboration_subscription), 0, 'client reads 0 subscriptions');
select is((select count(*)::int from public.collaboration_notification), 0, 'client reads 0 notifications');
select is((select count(*)::int from public.collaboration_inbox_item), 0, 'client reads 0 inbox items');
reset role;

select * from finish();
rollback;
