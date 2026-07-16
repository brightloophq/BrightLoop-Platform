-- =============================================================================
-- 0003 — State transition guard (integrity layer 3 of 3) + audit log
--
-- Layer 1 = UI (hide/disable). Layer 2 = service layer (packages/domain `can()`).
-- Layer 3 = THIS FILE: the database itself refuses illegal status moves, so a
-- crafted request that bypasses the service layer still cannot corrupt state.
--
-- `state_transitions` is the DB mirror of packages/schema MACHINES. Keep them in
-- sync: schema.js is the source of truth; this table is generated from it.
-- =============================================================================

-- ---- The legal transition graph --------------------------------------------
create table public.state_transitions (
  machine    text not null,
  from_state text not null,
  to_state   text not null,
  primary key (machine, from_state, to_state)
);

comment on table public.state_transitions is
  'Mirror of packages/schema MACHINES. A status change is legal only if a row exists here.';

insert into public.state_transitions (machine, from_state, to_state) values
  -- onboarding (resumable; in_progress→in_progress = save-and-exit)
  ('onboarding', 'not_started', 'in_progress'),
  ('onboarding', 'in_progress', 'in_progress'),
  ('onboarding', 'in_progress', 'abandoned'),
  ('onboarding', 'in_progress', 'completed'),
  ('onboarding', 'abandoned', 'in_progress'),

  -- lead
  ('lead', 'new', 'qualified'),
  ('lead', 'new', 'lost'),
  ('lead', 'qualified', 'proposal_sent'),
  ('lead', 'qualified', 'lost'),
  ('lead', 'proposal_sent', 'won'),
  ('lead', 'proposal_sent', 'lost'),
  ('lead', 'lost', 'qualified'),

  -- clientLifecycle (member→client_active additionally gated in the service layer
  -- on contract.active AND payment.succeeded)
  ('clientLifecycle', 'prospect', 'member'),
  ('clientLifecycle', 'member', 'client_active'),
  ('clientLifecycle', 'member', 'churned'),
  ('clientLifecycle', 'client_active', 'post_launch'),
  ('clientLifecycle', 'client_active', 'churned'),
  ('clientLifecycle', 'post_launch', 'renewed'),
  ('clientLifecycle', 'post_launch', 'churned'),
  ('clientLifecycle', 'renewed', 'client_active'),
  ('clientLifecycle', 'renewed', 'post_launch'),
  ('clientLifecycle', 'renewed', 'churned'),
  ('clientLifecycle', 'churned', 'member'),

  -- proposal (accepted is terminal — edits clone to a new revised v2)
  ('proposal', 'draft', 'sent'),
  ('proposal', 'sent', 'viewed'),
  ('proposal', 'sent', 'expired'),
  ('proposal', 'viewed', 'accepted'),
  ('proposal', 'viewed', 'change_requested'),
  ('proposal', 'viewed', 'expired'),
  ('proposal', 'change_requested', 'revised'),
  ('proposal', 'revised', 'sent'),
  ('proposal', 'expired', 'revised'),

  -- contract (active requires both signatures)
  ('contract', 'pending', 'sent'),
  ('contract', 'sent', 'signed_client'),
  ('contract', 'sent', 'voided'),
  ('contract', 'signed_client', 'countersigned'),
  ('contract', 'signed_client', 'voided'),
  ('contract', 'countersigned', 'active'),
  ('contract', 'voided', 'sent'),

  -- invoice
  ('invoice', 'draft', 'sent'),
  ('invoice', 'sent', 'pending'),
  ('invoice', 'sent', 'paid'),
  ('invoice', 'pending', 'paid'),
  ('invoice', 'pending', 'overdue'),
  ('invoice', 'pending', 'failed'),
  ('invoice', 'overdue', 'paid'),
  ('invoice', 'overdue', 'failed'),
  ('invoice', 'failed', 'pending'),
  ('invoice', 'failed', 'paid'),
  ('invoice', 'paid', 'refunded'),

  -- payment (succeeded is terminal)
  ('payment', 'initiated', 'processing'),
  ('payment', 'processing', 'succeeded'),
  ('payment', 'processing', 'failed'),
  ('payment', 'processing', 'pending_3ds'),
  ('payment', 'pending_3ds', 'succeeded'),
  ('payment', 'pending_3ds', 'failed'),
  ('payment', 'failed', 'processing'),

  -- project
  ('project', 'created', 'active'),
  ('project', 'active', 'paused'),
  ('project', 'active', 'delayed'),
  ('project', 'active', 'in_review'),
  ('project', 'paused', 'active'),
  ('project', 'delayed', 'active'),
  ('project', 'delayed', 'in_review'),
  ('project', 'in_review', 'active'),
  ('project', 'in_review', 'completed'),
  ('project', 'completed', 'post_launch'),

  -- milestone (no completing without client approval)
  ('milestone', 'pending', 'in_progress'),
  ('milestone', 'in_progress', 'waiting_client_approval'),
  ('milestone', 'waiting_client_approval', 'approved'),
  ('milestone', 'waiting_client_approval', 'revision_requested'),
  ('milestone', 'revision_requested', 'in_progress'),
  ('milestone', 'approved', 'completed'),

  -- deliverable (final only via approved)
  ('deliverable', 'draft', 'submitted'),
  ('deliverable', 'submitted', 'in_review'),
  ('deliverable', 'in_review', 'approved'),
  ('deliverable', 'in_review', 'revision_requested'),
  ('deliverable', 'in_review', 'rejected'),
  ('deliverable', 'revision_requested', 'submitted'),
  ('deliverable', 'rejected', 'submitted'),
  ('deliverable', 'approved', 'final'),

  -- fileUpload
  ('fileUpload', 'queued', 'uploading'),
  ('fileUpload', 'uploading', 'success'),
  ('fileUpload', 'uploading', 'failed'),
  ('fileUpload', 'failed', 'queued'),

  -- automation
  ('automation', 'active', 'running'),
  ('automation', 'active', 'paused'),
  ('automation', 'running', 'success'),
  ('automation', 'running', 'failed'),
  ('automation', 'success', 'active'),
  ('automation', 'failed', 'active'),
  ('automation', 'failed', 'paused'),
  ('automation', 'paused', 'active');

-- ---- Audit log (append-only) ------------------------------------------------
create table public.transition_log (
  id          bigint generated always as identity primary key,
  machine     text not null,
  entity_type text not null,
  entity_id   text not null,
  from_state  text not null,
  to_state    text not null,
  actor_id    text,
  reason      text,
  ip          inet,
  at          timestamptz not null default now()
);

comment on table public.transition_log is
  'Append-only audit of every status change. Required for contracts, invoices, payments, deliverable approvals (handoff §03.13).';

create index transition_log_entity_idx on public.transition_log (entity_type, entity_id, at desc);
create index transition_log_machine_idx on public.transition_log (machine, at desc);

-- Append-only: block UPDATE/DELETE for everyone, including table owners' clients.
create or replace function public.bl_transition_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'transition_log is append-only';
end;
$$;

create trigger transition_log_no_update
  before update or delete on public.transition_log
  for each row execute function public.bl_transition_log_immutable();

-- ---- The generic transition guard trigger ----------------------------------
-- Usage: attach per stateful table, passing (machine_name, status_column_name).
-- Reads the column generically via to_jsonb() so it works for `status`,
-- `stage` (leads) and `lifecycle` (clients) alike.
create or replace function public.bl_assert_transition()
returns trigger
language plpgsql
as $$
declare
  v_machine text := tg_argv[0];
  v_column  text := tg_argv[1];
  v_from    text := to_jsonb(old) ->> v_column;
  v_to      text := to_jsonb(new) ->> v_column;
begin
  -- No status change → nothing to guard (covers save-and-exit style updates).
  if v_from is not distinct from v_to then
    return new;
  end if;

  if not exists (
    select 1
    from public.state_transitions st
    where st.machine = v_machine
      and st.from_state = v_from
      and st.to_state = v_to
  ) then
    raise exception 'Illegal transition on %: % -> %', v_machine, v_from, v_to
      using errcode = '23514',
            hint = 'This move is not in state_transitions. See packages/schema MACHINES.';
  end if;

  return new;
end;
$$;

-- ---- Attach the guard to every stateful table ------------------------------
create trigger clients_transition_guard
  before update on public.clients
  for each row execute function public.bl_assert_transition('clientLifecycle', 'lifecycle');

create trigger leads_transition_guard
  before update on public.leads
  for each row execute function public.bl_assert_transition('lead', 'stage');

create trigger assessments_transition_guard
  before update on public.assessments
  for each row execute function public.bl_assert_transition('onboarding', 'status');

create trigger configurations_transition_guard
  before update on public.configurations
  for each row execute function public.bl_assert_transition('onboarding', 'status');

create trigger proposals_transition_guard
  before update on public.proposals
  for each row execute function public.bl_assert_transition('proposal', 'status');

create trigger contracts_transition_guard
  before update on public.contracts
  for each row execute function public.bl_assert_transition('contract', 'status');

create trigger invoices_transition_guard
  before update on public.invoices
  for each row execute function public.bl_assert_transition('invoice', 'status');

create trigger payments_transition_guard
  before update on public.payments
  for each row execute function public.bl_assert_transition('payment', 'status');

create trigger projects_transition_guard
  before update on public.projects
  for each row execute function public.bl_assert_transition('project', 'status');

create trigger milestones_transition_guard
  before update on public.milestones
  for each row execute function public.bl_assert_transition('milestone', 'status');

create trigger deliverables_transition_guard
  before update on public.deliverables
  for each row execute function public.bl_assert_transition('deliverable', 'status');

create trigger file_uploads_transition_guard
  before update on public.file_uploads
  for each row execute function public.bl_assert_transition('fileUpload', 'status');

create trigger automations_transition_guard
  before update on public.automations
  for each row execute function public.bl_assert_transition('automation', 'status');
