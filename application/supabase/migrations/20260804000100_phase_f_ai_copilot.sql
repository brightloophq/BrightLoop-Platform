-- =============================================================================
-- Phase F · Sprint F2 — AI Copilot: conversational PRESENTATION layer over
-- Phases D & E. ADDITIVE ONLY. Four new tables. The conversation is a versioned
-- root (optimistic concurrency); every message / citation / suggested action is
-- append-only. The Copilot is NOT a new AI system — it orchestrates existing
-- capabilities through the E7 Capability Registry + Tool Gateway and consumes
-- existing application services only. Conversation memory is SESSION-scoped
-- (last_references jsonb) and never replaces the E2 Knowledge Base.
--
-- Unlike the reporting tables (internal-authored), a CLIENT is an active author
-- here: they hold conversations and append turns within their OWN org. RLS keeps
-- every conversation inside its tenant. No prior table is touched.
-- =============================================================================

create table public.copilot_conversation (
  id                    text primary key,
  workspace_id          text not null,
  client_id             text references public.clients (id) on delete cascade,
  title                 text not null,
  panel                 text not null default 'workspace' check (panel in ('workspace','project','mission','report','automation','approval','agent')),
  status                text not null default 'active' check (status in ('active','archived')),
  requested_by_user_id  text not null,
  pinned                boolean not null default false,
  message_count         integer not null default 0 check (message_count >= 0),
  last_intent           text check (last_intent in ('question','command','navigation','summary','explanation','analysis','planning','reporting','approval','automation','search','clarification','escalation')),
  last_references       jsonb not null default '{}'::jsonb,
  correlation_id        text not null,
  token_total           integer not null default 0 check (token_total >= 0),
  cost                  double precision not null default 0 check (cost >= 0),
  version               integer not null default 1 check (version > 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index copilot_conversation_workspace_idx on public.copilot_conversation (workspace_id, updated_at desc);
create index copilot_conversation_client_idx on public.copilot_conversation (client_id);
comment on table public.copilot_conversation is 'Phase F F2: a Copilot conversation (versioned root; session memory in last_references).';

create table public.copilot_message (
  id              text primary key,
  conversation_id text not null references public.copilot_conversation (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null default '',
  intent          text check (intent in ('question','command','navigation','summary','explanation','analysis','planning','reporting','approval','automation','search','clarification','escalation')),
  state           text not null default 'completed' check (state in ('thinking','running_capability','waiting_approval','completed','failed')),
  capability_key  text,
  ok              boolean not null default true,
  token_total     integer not null default 0 check (token_total >= 0),
  cost            double precision not null default 0 check (cost >= 0),
  order_index     integer not null default 0 check (order_index >= 0),
  created_at      timestamptz not null default now()
);
create index copilot_message_conversation_idx on public.copilot_message (conversation_id, order_index);
comment on table public.copilot_message is 'Phase F F2: a single conversation turn (append-only).';

create table public.copilot_citation (
  id              text primary key,
  message_id      text not null references public.copilot_message (id) on delete cascade,
  conversation_id text not null references public.copilot_conversation (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  kind            text not null check (kind in ('report','mission','strategy','artifact','knowledge','approval','automation','plan')),
  ref_id          text not null,
  title           text not null default '',
  href            text not null default '',
  created_at      timestamptz not null default now()
);
create index copilot_citation_conversation_idx on public.copilot_citation (conversation_id);
create index copilot_citation_message_idx on public.copilot_citation (message_id);
comment on table public.copilot_citation is 'Phase F F2: a citation to a real upstream object (no hallucinated facts; append-only).';

create table public.copilot_action (
  id                  text primary key,
  conversation_id     text not null references public.copilot_conversation (id) on delete cascade,
  message_id          text references public.copilot_message (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  kind                text not null check (kind in ('generate_report','review_approvals','continue_mission','resume_checkpoint','analyze_risks','compare_reports','explain_kpi','create_strategy','generate_workflow','view_timeline','open_link')),
  label               text not null,
  capability_key      text,
  required_permission text,
  enabled             boolean not null default true,
  requires_approval   boolean not null default false,
  href                text not null default '',
  created_at          timestamptz not null default now()
);
create index copilot_action_conversation_idx on public.copilot_action (conversation_id);
comment on table public.copilot_action is 'Phase F F2: a permission-aware suggested next action (append-only).';

-- Append-only enforcement (reuse the Phase D trigger fn): messages/citations/actions
-- are immutable once written. The conversation root remains mutable (versioned save).
create trigger copilot_message_no_mutation before update or delete on public.copilot_message for each row execute function public.bl_txexec_append_only();
create trigger copilot_citation_no_mutation before update or delete on public.copilot_citation for each row execute function public.bl_txexec_append_only();
create trigger copilot_action_no_mutation before update or delete on public.copilot_action for each row execute function public.bl_txexec_append_only();

alter table public.copilot_conversation enable row level security;
alter table public.copilot_message enable row level security;
alter table public.copilot_citation enable row level security;
alter table public.copilot_action enable row level security;

-- Tenant boundary: internal sees all; a client sees + authors ONLY its own org's
-- conversations. The conversation root is client-writable (create + versioned save);
-- turns/citations/actions are client-insertable within its own org.
create policy "copilot_conversation_read" on public.copilot_conversation for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "copilot_conversation_write" on public.copilot_conversation for all to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id()) with check (public.bl_is_internal() or client_id = public.bl_client_id());
do $$
declare t text;
begin
  foreach t in array array['copilot_message','copilot_citation','copilot_action'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_insert', t);
  end loop;
end $$;

grant select, insert, update, delete on public.copilot_conversation to authenticated;
grant select, insert on public.copilot_message to authenticated;
grant select, insert on public.copilot_citation to authenticated;
grant select, insert on public.copilot_action to authenticated;
