-- =============================================================================
-- Phase D · Sprint D7 — Collaboration & operational awareness: subscriptions,
-- mentions, internal-only notifications, a per-user inbox, and read receipts.
-- ADDITIVE ONLY. Adds one nullable column to the existing activity log (for the
-- feed's actor filter) + five new tables on the D1–D6 foundation; internal-only
-- RLS; mentions + notifications are append-only. No Phase A–C touch.
-- =============================================================================

-- ---- activity: record the acting user (feed actor filter) -------------------
alter table public.transformation_activity add column if not exists actor_id text;
comment on column public.transformation_activity.actor_id is 'Phase D D7: the user who caused the activity. Null for pre-D7 rows.';

-- ---- subscription (D7) ------------------------------------------------------
create table public.collaboration_subscription (
  id           text primary key,
  user_id      text not null,
  workspace_id text not null references public.transformation_workspace (id) on delete cascade,
  client_id    text references public.clients (id) on delete cascade,
  target_type  text not null check (target_type in ('workspace', 'initiative', 'task', 'review', 'timeline', 'kpi')),
  target_id    text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
create index collaboration_subscription_user_idx on public.collaboration_subscription (user_id);
create index collaboration_subscription_workspace_idx on public.collaboration_subscription (workspace_id);
comment on table public.collaboration_subscription is 'Phase D D7: an internal user watching a workspace/initiative/task/review/timeline/kpi.';

-- ---- mention (D7, append-only) ----------------------------------------------
create table public.collaboration_mention (
  id                     text primary key,
  workspace_id           text not null references public.transformation_workspace (id) on delete cascade,
  client_id              text references public.clients (id) on delete cascade,
  subject_type           text not null,
  subject_id             text not null,
  mentioned_user_id      text not null,
  mentioned_by_user_id   text not null,
  note                   text,
  created_at             timestamptz not null default now()
);
create index collaboration_mention_subject_idx on public.collaboration_mention (subject_id);
create index collaboration_mention_user_idx on public.collaboration_mention (mentioned_user_id);
comment on table public.collaboration_mention is 'Phase D D7: an immutable @user mention on a subject. Never edited or deleted.';

-- ---- notification (D7, append-only, internal only) --------------------------
create table public.collaboration_notification (
  id                text primary key,
  workspace_id      text not null references public.transformation_workspace (id) on delete cascade,
  client_id         text references public.clients (id) on delete cascade,
  recipient_user_id text not null,
  type              text not null check (type in ('mention', 'assignment', 'review', 'task', 'dependency', 'timeline', 'kpi', 'health')),
  subject_type      text not null,
  subject_id        text not null,
  summary           text not null,
  source_activity_id text references public.transformation_activity (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index collaboration_notification_recipient_idx on public.collaboration_notification (recipient_user_id);
create index collaboration_notification_workspace_idx on public.collaboration_notification (workspace_id);
comment on table public.collaboration_notification is 'Phase D D7: an internal-only notification generated from an event. Never delivered externally.';

-- ---- inbox item (D7, mutable status under optimistic concurrency) -----------
create table public.collaboration_inbox_item (
  id              text primary key,
  user_id         text not null,
  workspace_id    text not null references public.transformation_workspace (id) on delete cascade,
  client_id       text references public.clients (id) on delete cascade,
  notification_id text not null references public.collaboration_notification (id) on delete cascade,
  status          text not null default 'unread' check (status in ('unread', 'read', 'archived', 'dismissed')),
  version         integer not null default 1 check (version > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, notification_id)
);
create index collaboration_inbox_item_user_idx on public.collaboration_inbox_item (user_id);
create index collaboration_inbox_item_status_idx on public.collaboration_inbox_item (user_id, status);
comment on table public.collaboration_inbox_item is 'Phase D D7: a per-user inbox entry wrapping a notification with mutable read/archive/dismiss state.';

-- ---- read receipt (D7) ------------------------------------------------------
create table public.collaboration_read_receipt (
  id          text primary key,
  user_id     text not null,
  entity_type text not null check (entity_type in ('activity', 'mention', 'notification')),
  entity_id   text not null,
  read_at     timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);
create index collaboration_read_receipt_user_idx on public.collaboration_read_receipt (user_id);
comment on table public.collaboration_read_receipt is 'Phase D D7: a per-user, per-entity read marker. markUnread deletes the row.';

-- ---- append-only enforcement for mentions + notifications -------------------
create trigger collaboration_mention_no_mutation
  before update or delete on public.collaboration_mention
  for each row execute function public.bl_txexec_append_only();
create trigger collaboration_notification_no_mutation
  before update or delete on public.collaboration_notification
  for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants (internal-only) -------------------------------------------
alter table public.collaboration_subscription enable row level security;
alter table public.collaboration_mention enable row level security;
alter table public.collaboration_notification enable row level security;
alter table public.collaboration_inbox_item enable row level security;
alter table public.collaboration_read_receipt enable row level security;

create policy "collaboration_subscription_internal_all" on public.collaboration_subscription
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "collaboration_inbox_item_internal_all" on public.collaboration_inbox_item
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "collaboration_read_receipt_internal_all" on public.collaboration_read_receipt
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- mention + notification: append-only — SELECT + INSERT only.
create policy "collaboration_mention_internal_read" on public.collaboration_mention
  for select to authenticated using (public.bl_is_internal());
create policy "collaboration_mention_internal_insert" on public.collaboration_mention
  for insert to authenticated with check (public.bl_is_internal());
create policy "collaboration_notification_internal_read" on public.collaboration_notification
  for select to authenticated using (public.bl_is_internal());
create policy "collaboration_notification_internal_insert" on public.collaboration_notification
  for insert to authenticated with check (public.bl_is_internal());

grant select, insert, delete on public.collaboration_subscription to authenticated; -- no update
grant select, insert on public.collaboration_mention to authenticated;             -- append-only
grant select, insert on public.collaboration_notification to authenticated;         -- append-only
grant select, insert, update on public.collaboration_inbox_item to authenticated;   -- no delete
grant select, insert, delete on public.collaboration_read_receipt to authenticated;
grant select, insert, delete on public.collaboration_subscription to service_role;
grant select, insert on public.collaboration_mention to service_role;
grant select, insert on public.collaboration_notification to service_role;
grant select, insert, update on public.collaboration_inbox_item to service_role;
grant select, insert, delete on public.collaboration_read_receipt to service_role;
