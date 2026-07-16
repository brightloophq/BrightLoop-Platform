-- =============================================================================
-- 0004 — Row-Level Security (THE authorization boundary)
--
-- Approved constraint: "Design Row-Level Security before exposing any production
-- data. No shortcuts around authorization." (handoff §11.1 — "RLS is the real
-- boundary; UI is convenience.")
--
-- Model:
--   * RLS is enabled on EVERY table. No policy = deny. Default is deny.
--   * Claims come from the JWT: app_metadata.role and app_metadata.client_id,
--     set by the Supabase auth hook (see 0005_auth_claims.sql).
--   * Client roles see ONLY their own org's rows (client_id = bl_client_id()).
--   * Internal roles are capability-scoped, not ownership-scoped.
--   * Writes are internal-only in Sprint 0. Per-feature client write policies
--     (approve deliverable, pay invoice, sign contract) land with their sprints —
--     each one is a deliberate, reviewed grant, never a blanket one.
--   * The service_role key bypasses RLS entirely; it is server-only and must
--     never reach the browser.
-- =============================================================================

-- ---- Claim helpers ----------------------------------------------------------
create or replace function public.bl_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

create or replace function public.bl_client_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'client_id', '');
$$;

create or replace function public.bl_is_internal()
returns boolean
language sql
stable
as $$
  select public.bl_role() in ('owner', 'admin', 'team_member');
$$;

create or replace function public.bl_is_finance()
returns boolean
language sql
stable
as $$
  -- finance.* is owner/admin only — team_member is excluded (handoff §01.3).
  select public.bl_role() in ('owner', 'admin');
$$;

comment on function public.bl_client_id() is
  'The caller''s client org from JWT claims. NULL for internal roles. RLS scopes client data on this.';

-- ---- Enable RLS everywhere --------------------------------------------------
alter table public.clients          enable row level security;
alter table public.users            enable row level security;
alter table public.leads            enable row level security;
alter table public.assessments      enable row level security;
alter table public.configurations   enable row level security;
alter table public.proposals        enable row level security;
alter table public.contracts        enable row level security;
alter table public.projects         enable row level security;
alter table public.invoices         enable row level security;
alter table public.payments         enable row level security;
alter table public.milestones       enable row level security;
alter table public.deliverables     enable row level security;
alter table public.file_uploads     enable row level security;
alter table public.automations      enable row level security;
alter table public.meetings         enable row level security;
alter table public.notifications    enable row level security;
alter table public.messages         enable row level security;
alter table public.consents         enable row level security;
alter table public.transition_log   enable row level security;
alter table public.state_transitions enable row level security;

-- =============================================================================
-- Clients
-- =============================================================================
create policy "clients_select_internal" on public.clients
  for select to authenticated
  using (public.bl_is_internal());

create policy "clients_select_own" on public.clients
  for select to authenticated
  using (id = public.bl_client_id());

create policy "clients_write_internal" on public.clients
  for insert to authenticated
  with check (public.bl_role() in ('owner', 'admin'));

create policy "clients_update_internal" on public.clients
  for update to authenticated
  using (public.bl_role() in ('owner', 'admin'))
  with check (public.bl_role() in ('owner', 'admin'));

-- =============================================================================
-- Users — a client user may see their own org's members; never another org's.
-- =============================================================================
create policy "users_select_internal" on public.users
  for select to authenticated
  using (public.bl_is_internal());

create policy "users_select_own_org" on public.users
  for select to authenticated
  using (client_id is not null and client_id = public.bl_client_id());

create policy "users_update_self" on public.users
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- team.* is owner-scoped (admin limited) — role changes are audited.
create policy "users_manage_internal" on public.users
  for all to authenticated
  using (public.bl_role() = 'owner')
  with check (public.bl_role() = 'owner');

-- =============================================================================
-- Leads — internal only. Clients must never see the pipeline.
-- =============================================================================
create policy "leads_internal_all" on public.leads
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_role() in ('owner', 'admin'));

-- =============================================================================
-- Assessments / Configurations — client reads own; internal reads all.
-- =============================================================================
create policy "assessments_select" on public.assessments
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

create policy "assessments_write_internal" on public.assessments
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

create policy "configurations_select" on public.configurations
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

create policy "configurations_write_internal" on public.configurations
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

-- =============================================================================
-- Proposals / Contracts — client reads own. Signing is a client_admin action
-- delivered in Sprint 6 with its own narrowly-scoped policy.
-- =============================================================================
create policy "proposals_select" on public.proposals
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

create policy "proposals_write_internal" on public.proposals
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

create policy "contracts_select" on public.contracts
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

create policy "contracts_write_internal" on public.contracts
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

-- =============================================================================
-- Projects / Milestones / Deliverables — the delivery spine.
-- Milestones and deliverables inherit client scope through their project.
-- =============================================================================
create policy "projects_select" on public.projects
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

create policy "projects_write_internal" on public.projects
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

create policy "milestones_select" on public.milestones
  for select to authenticated
  using (
    public.bl_is_internal()
    or exists (
      select 1 from public.projects p
      where p.id = milestones.project_id
        and p.client_id = public.bl_client_id()
    )
  );

create policy "milestones_write_internal" on public.milestones
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

create policy "deliverables_select" on public.deliverables
  for select to authenticated
  using (
    public.bl_is_internal()
    or exists (
      select 1 from public.projects p
      where p.id = deliverables.project_id
        and p.client_id = public.bl_client_id()
    )
  );

create policy "deliverables_write_internal" on public.deliverables
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

-- =============================================================================
-- Invoices / Payments — finance is owner/admin only on the internal side.
-- Clients may READ their own; paying is a client_admin action wired in Sprint 6.
-- =============================================================================
create policy "invoices_select" on public.invoices
  for select to authenticated
  using (public.bl_is_finance() or client_id = public.bl_client_id());

create policy "invoices_write_finance" on public.invoices
  for all to authenticated
  using (public.bl_is_finance())
  with check (public.bl_is_finance());

create policy "payments_select" on public.payments
  for select to authenticated
  using (
    public.bl_is_finance()
    or exists (
      select 1 from public.invoices i
      where i.id = payments.invoice_id
        and i.client_id = public.bl_client_id()
    )
  );

-- Payment rows are written by the server on webhook truth, never by a client.
create policy "payments_write_finance" on public.payments
  for all to authenticated
  using (public.bl_is_finance())
  with check (public.bl_is_finance());

-- =============================================================================
-- File uploads — scoped through the parent deliverable's project.
-- =============================================================================
create policy "file_uploads_select" on public.file_uploads
  for select to authenticated
  using (
    public.bl_is_internal()
    or exists (
      select 1
      from public.deliverables d
      join public.projects p on p.id = d.project_id
      where d.id = file_uploads.deliverable_id
        and p.client_id = public.bl_client_id()
    )
  );

create policy "file_uploads_write_internal" on public.file_uploads
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

-- =============================================================================
-- Automations — internal ops. Clients see "attention needed" via a curated
-- surface, not this table.
-- =============================================================================
create policy "automations_internal_all" on public.automations
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_role() in ('owner', 'admin'));

-- =============================================================================
-- Meetings / Messages — client reads own org.
-- =============================================================================
create policy "meetings_select" on public.meetings
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

create policy "meetings_write_internal" on public.meetings
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

create policy "messages_select" on public.messages
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

-- A user may post only as themselves, only into their own org's thread.
create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (
    (public.bl_is_internal() or client_id = public.bl_client_id())
    and exists (
      select 1 from public.users u
      where u.id = messages.author_id
        and u.auth_user_id = auth.uid()
    )
  );

-- =============================================================================
-- Notifications — strictly the recipient's own.
-- =============================================================================
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = notifications.user_id
        and u.auth_user_id = auth.uid()
    )
  );

-- Recipients may only mark their own notifications read.
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = notifications.user_id
        and u.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = notifications.user_id
        and u.auth_user_id = auth.uid()
    )
  );

-- =============================================================================
-- Consents — append-only privacy audit trail; a user sees only their own.
-- =============================================================================
create policy "consents_select_own" on public.consents
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = consents.user_id
        and u.auth_user_id = auth.uid()
    )
  );

create policy "consents_insert_own" on public.consents
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users u
      where u.id = consents.user_id
        and u.auth_user_id = auth.uid()
    )
  );

-- =============================================================================
-- Audit + reference tables
-- =============================================================================
-- The transition log is readable by internal roles only, and never mutable.
create policy "transition_log_select_internal" on public.transition_log
  for select to authenticated
  using (public.bl_is_internal());

-- Anyone authenticated may read the legal transition graph (the UI uses it to
-- avoid offering illegal moves). It is reference data, not customer data.
create policy "state_transitions_select" on public.state_transitions
  for select to authenticated
  using (true);
