-- =============================================================================
-- Phase F · Sprint F5 — Billing & Subscription Platform. ADDITIVE ONLY.
-- Six new tables for the COMMERCIAL layer over the certified platform: a
-- workspace billing account, its subscription to a plan, invoices (lines are
-- embedded JSONB), stored payment-method REFERENCES, an append-only raw usage
-- ledger, and an append-only billing history / audit / notification ledger.
-- AUXION REMAINS THE SYSTEM OF RECORD — the payment provider is a rail, never the
-- record. The plan / add-on / coupon CATALOGUE lives in code (domain PLAN_CATALOG),
-- not in a table. NO card PAN is ever stored — payment rows carry only brand +
-- last4 + an opaque provider reference. No prior table is touched.
-- =============================================================================

-- ---- subscription state machine mirror (packages/schema MACHINES.subscription)
insert into public.state_transitions (machine, from_state, to_state) values
  ('subscription', 'trialing', 'active'),
  ('subscription', 'trialing', 'canceled'),
  ('subscription', 'trialing', 'expired'),
  ('subscription', 'active',   'past_due'),
  ('subscription', 'active',   'paused'),
  ('subscription', 'active',   'canceled'),
  ('subscription', 'past_due', 'active'),
  ('subscription', 'past_due', 'grace'),
  ('subscription', 'past_due', 'canceled'),
  ('subscription', 'grace',    'active'),
  ('subscription', 'grace',    'canceled'),
  ('subscription', 'grace',    'expired'),
  ('subscription', 'paused',   'active'),
  ('subscription', 'paused',   'canceled'),
  ('subscription', 'canceled', 'active'),
  ('subscription', 'canceled', 'expired')
on conflict do nothing;

-- ---- billing account (versioned root) --------------------------------------
create table public.billing_account (
  id                   text primary key,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  currency             text not null default 'usd' check (char_length(currency) = 3),
  status               text not null default 'active' check (status in ('active','delinquent','closed')),
  billing_email        text,
  tax_id               text,
  -- Opaque provider customer reference (e.g. Stripe customer id). INTERNAL.
  provider_customer_ref text,
  metadata             jsonb not null default '{}'::jsonb,
  version              integer not null default 1 check (version > 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id)
);
create index billing_account_workspace_idx on public.billing_account (workspace_id);
create index billing_account_client_idx on public.billing_account (client_id);
comment on table public.billing_account is 'Phase F F5: a workspace''s billing account (versioned; Auxion is the system of record).';

-- ---- subscription (versioned root) -----------------------------------------
create table public.billing_subscription (
  id                      text primary key,
  workspace_id            text not null,
  client_id               text references public.clients (id) on delete cascade,
  billing_account_id      text not null references public.billing_account (id) on delete cascade,
  plan_id                 text not null,
  tier                    text not null check (tier in ('free','starter','professional','business','enterprise')),
  status                  text not null default 'trialing' check (status in ('trialing','active','past_due','grace','paused','canceled','expired')),
  interval                text not null check (interval in ('none','month','year')),
  seats                   integer not null default 1 check (seats > 0),
  quantity                integer not null default 1 check (quantity > 0),
  trial_start_at          timestamptz,
  trial_end_at            timestamptz,
  current_period_start_at timestamptz,
  current_period_end_at   timestamptz,
  grace_period_end_at     timestamptz,
  cancel_at_period_end    boolean not null default false,
  canceled_at             timestamptz,
  discount                jsonb,
  addons                  jsonb not null default '[]'::jsonb,
  -- Opaque provider subscription reference. INTERNAL — never in a DTO.
  provider_subscription_ref text,
  metadata                jsonb not null default '{}'::jsonb,
  version                 integer not null default 1 check (version > 0),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (workspace_id)
);
create index billing_subscription_workspace_idx on public.billing_subscription (workspace_id);
create index billing_subscription_client_idx on public.billing_subscription (client_id);
create index billing_subscription_account_idx on public.billing_subscription (billing_account_id);
create index billing_subscription_status_idx on public.billing_subscription (status);
comment on table public.billing_subscription is 'Phase F F5: a workspace''s subscription to a plan (versioned; status guarded by the subscription machine).';

-- ---- invoice (versioned root; lines embedded as JSONB) ---------------------
create table public.billing_invoice (
  id                  text primary key,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  billing_account_id  text not null references public.billing_account (id) on delete cascade,
  subscription_id     text references public.billing_subscription (id) on delete set null,
  number              text not null,
  status              text not null default 'draft' check (status in ('draft','sent','pending','paid','overdue','failed','refunded')),
  currency            text not null default 'usd' check (char_length(currency) = 3),
  lines               jsonb not null default '[]'::jsonb,
  subtotal_cents      integer not null default 0,
  discount_cents      integer not null default 0,
  tax_cents           integer not null default 0,
  total_cents         integer not null default 0,
  amount_paid_cents   integer not null default 0,
  amount_due_cents    integer not null default 0,
  period_start_at     timestamptz,
  period_end_at       timestamptz,
  due_at              timestamptz,
  issued_at           timestamptz,
  paid_at             timestamptz,
  voided_at           timestamptz,
  attempt_count       integer not null default 0 check (attempt_count >= 0),
  -- Opaque provider invoice reference. INTERNAL.
  provider_invoice_ref text,
  checksum            text not null,
  idempotency_key     text not null,
  metadata            jsonb not null default '{}'::jsonb,
  version             integer not null default 1 check (version > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (idempotency_key)
);
create index billing_invoice_workspace_idx on public.billing_invoice (workspace_id, created_at desc);
create index billing_invoice_client_idx on public.billing_invoice (client_id);
create index billing_invoice_subscription_idx on public.billing_invoice (subscription_id, created_at desc);
create index billing_invoice_status_idx on public.billing_invoice (status);
comment on table public.billing_invoice is 'Phase F F5: an invoice (versioned; lines embedded; status guarded by the invoice machine; idempotent per subscription+period).';

-- ---- payment method (versioned root; PAN NEVER stored) ---------------------
create table public.billing_payment_method (
  id                  text primary key,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  billing_account_id  text not null references public.billing_account (id) on delete cascade,
  brand               text not null check (brand in ('visa','mastercard','amex','discover','bank','other')),
  last4               text not null check (char_length(last4) = 4),
  exp_month           integer check (exp_month between 1 and 12),
  exp_year            integer,
  is_default          boolean not null default false,
  status              text not null default 'active' check (status in ('active','expired','removed')),
  -- Opaque provider payment-method reference. INTERNAL — never in a DTO.
  provider_method_ref text,
  version             integer not null default 1 check (version > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index billing_payment_method_account_idx on public.billing_payment_method (billing_account_id);
create index billing_payment_method_workspace_idx on public.billing_payment_method (workspace_id);
comment on table public.billing_payment_method is 'Phase F F5: a stored payment-instrument REFERENCE (brand + last4 + provider ref only; PAN never stored).';

-- ---- usage event (append-only raw ledger) ----------------------------------
create table public.billing_usage_event (
  id               text primary key,
  workspace_id     text not null,
  client_id        text references public.clients (id) on delete cascade,
  subscription_id  text not null references public.billing_subscription (id) on delete cascade,
  meter            text not null check (meter in ('workflow_executions','ai_requests','connector_invocations','storage_bytes','webhook_events','runtime_executions','api_requests','copilot_sessions','marketplace_actions')),
  quantity         numeric not null default 0 check (quantity >= 0),
  occurred_at      timestamptz not null,
  idempotency_key  text not null,
  source           text not null default 'system',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (idempotency_key)
);
create index billing_usage_event_sub_idx on public.billing_usage_event (subscription_id, occurred_at desc);
create index billing_usage_event_meter_idx on public.billing_usage_event (subscription_id, meter, occurred_at);
create index billing_usage_event_workspace_idx on public.billing_usage_event (workspace_id);
comment on table public.billing_usage_event is 'Phase F F5: append-only raw metered usage events; deterministic aggregation reads these.';

-- ---- billing event (append-only history / audit / notification ledger) -----
create table public.billing_event (
  id               text primary key,
  workspace_id     text not null,
  client_id        text references public.clients (id) on delete cascade,
  subscription_id  text references public.billing_subscription (id) on delete cascade,
  invoice_id       text references public.billing_invoice (id) on delete cascade,
  type             text not null,
  summary          text not null,
  detail           jsonb not null default '{}'::jsonb,
  actor_id         text,
  correlation_id   text not null,
  idempotency_key  text,
  created_at       timestamptz not null default now()
);
create index billing_event_sub_idx on public.billing_event (subscription_id, created_at desc);
create index billing_event_workspace_idx on public.billing_event (workspace_id, created_at desc);
create index billing_event_invoice_idx on public.billing_event (invoice_id);
create unique index billing_event_idempotency_key_idx on public.billing_event (idempotency_key) where idempotency_key is not null;
comment on table public.billing_event is 'Phase F F5: append-only billing history / audit / notification ledger.';

-- ---- transition guards (mirror packages/schema MACHINES) -------------------
create trigger billing_subscription_transition_guard
  before update on public.billing_subscription
  for each row execute function public.bl_assert_transition('subscription', 'status');

create trigger billing_invoice_transition_guard
  before update on public.billing_invoice
  for each row execute function public.bl_assert_transition('invoice', 'status');

-- ---- append-only enforcement (reuse the Phase D trigger fn) ----------------
create trigger billing_usage_event_no_mutation
  before update or delete on public.billing_usage_event
  for each row execute function public.bl_txexec_append_only();

create trigger billing_event_no_mutation
  before update or delete on public.billing_event
  for each row execute function public.bl_txexec_append_only();

-- =============================================================================
-- Row-level security. Client roles READ their own org's billing; ALL writes are
-- internal (owner/admin/team_member). Payment-method writes are finance-grade
-- (owner/admin only). Usage + billing-event ledgers are internal-insert only.
-- =============================================================================

alter table public.billing_account        enable row level security;
alter table public.billing_subscription   enable row level security;
alter table public.billing_invoice        enable row level security;
alter table public.billing_payment_method enable row level security;
alter table public.billing_usage_event    enable row level security;
alter table public.billing_event          enable row level security;

-- Account / subscription / invoice: client-read-own, internal-write.
do $$
declare t text;
begin
  foreach t in array array['billing_account','billing_subscription','billing_invoice'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal())', t || '_write', t);
  end loop;
end $$;

-- Payment method: client-read-own, FINANCE-only write (owner/admin).
create policy "billing_payment_method_read" on public.billing_payment_method
  for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "billing_payment_method_write" on public.billing_payment_method
  for all to authenticated using (public.bl_is_finance()) with check (public.bl_is_finance());

-- Append-only ledgers: client reads own org; internal inserts only.
do $$
declare t text;
begin
  foreach t in array array['billing_usage_event','billing_event'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.bl_is_internal())', t || '_insert', t);
  end loop;
end $$;

-- =============================================================================
-- Grants. Versioned roots get full CRUD (RLS filters); append-only ledgers get
-- select/insert only. service_role bypasses RLS for server-side engine work.
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['billing_account','billing_subscription','billing_invoice','billing_payment_method'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['billing_usage_event','billing_event'] loop
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
