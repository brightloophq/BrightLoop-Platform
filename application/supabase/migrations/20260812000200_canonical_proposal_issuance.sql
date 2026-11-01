-- Canonical proposal issuance. Legacy sales proposals remain the default.
create type public.proposal_kind as enum ('legacy_sales', 'canonical_issued');
create sequence public.proposal_number_seq;

alter table public.quotes
  add column commercial_approved_at timestamptz,
  add column commercial_approved_by text references public.users(id) on delete restrict,
  add column commercial_approved_state timestamptz;

alter table public.proposals
  alter column subtotal type bigint,
  alter column deposit type bigint,
  alter column total type bigint,
  add column proposal_kind public.proposal_kind not null default 'legacy_sales',
  add column source_quote_id text references public.quotes(id) on delete restrict,
  add column lead_origin_id text references public.leads(id) on delete restrict,
  add column proposal_number text,
  add column revision_number integer,
  add column supersedes_proposal_id text references public.proposals(id) on delete restrict,
  add column title text,
  add column client_note text not null default '',
  add column currency text,
  add column discount bigint not null default 0,
  add column recurring_total bigint not null default 0,
  add column recurring_cadence text,
  add column optional_one_time_total bigint not null default 0,
  add column optional_recurring_total bigint not null default 0,
  add column valid_until date,
  add column issued_at timestamptz,
  add column issued_by text references public.users(id) on delete restrict,
  add column issuance_key text,
  add column source_run_id text references public.intelligence_runs(id) on delete restrict,
  add column source_proposal_version_id text references public.proposal_versions(id) on delete restrict,
  add column source_review_event_id text references public.runtime_events(id) on delete restrict,
  add constraint proposals_kind_shape check (
    (proposal_kind='legacy_sales' and source_quote_id is null and issuance_key is null)
    or
    (proposal_kind='canonical_issued' and status='issued' and source_quote_id is not null
      and proposal_number is not null and revision_number is not null and currency ~ '^[A-Z]{3}$'
      and issued_at is not null and issued_by is not null and issuance_key is not null)
  ),
  add constraint proposals_commercial_nonnegative check (
    subtotal>=0 and deposit>=0 and total>=0 and discount>=0 and recurring_total>=0
    and optional_one_time_total>=0 and optional_recurring_total>=0
  );

create unique index proposals_number_unique on public.proposals(proposal_number) where proposal_number is not null;
create unique index proposals_issuance_key_unique on public.proposals(issuance_key) where issuance_key is not null;
create index proposals_source_quote_idx on public.proposals(source_quote_id) where source_quote_id is not null;

alter table public.quotes
  add constraint quotes_proposal_fk foreign key (proposal_id) references public.proposals(id) on delete restrict;

create table public.proposal_items (
  id text primary key,
  proposal_id text not null references public.proposals(id) on delete restrict,
  label text not null,
  description text not null default '',
  quantity integer not null check (quantity between 1 and 9999),
  unit_amount bigint not null check (unit_amount >= 0),
  amount bigint not null check (amount >= 0 and amount = quantity * unit_amount),
  sort integer not null default 0,
  pricing_type text not null check (pricing_type in ('one_time','recurring')),
  recurrence_cadence text,
  optional boolean not null default false,
  source_work_item_id text,
  source_evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_evidence_refs)='array'),
  constraint proposal_items_cadence_valid check (
    (pricing_type='one_time' and recurrence_cadence is null)
    or (pricing_type='recurring' and recurrence_cadence in ('weekly','monthly','quarterly','annual'))
  )
);
create index proposal_items_proposal_idx on public.proposal_items(proposal_id, sort);
alter table public.proposal_items enable row level security;
create policy proposal_items_read on public.proposal_items for select to authenticated using (
  public.bl_role() in ('owner','admin') or exists (
    select 1 from public.proposals p where p.id=proposal_items.proposal_id
      and p.proposal_kind='canonical_issued' and p.status='issued' and p.client_id=public.bl_client_id()
  )
);
create policy proposal_items_issue on public.proposal_items for insert to authenticated
  with check (public.bl_role() in ('owner','admin'));

drop policy if exists "proposals_select" on public.proposals;
create policy "proposals_select" on public.proposals for select to authenticated using (
  public.bl_is_internal() or (
    client_id=public.bl_client_id() and (
      (proposal_kind='legacy_sales' and status <> 'draft')
      or (proposal_kind='canonical_issued' and status='issued')
    )
  )
);

insert into public.state_transitions(machine,from_state,to_state) values
 ('quote','internal_review','approved'),
 ('quote','approved','internal_review'),
 ('quote','approved','issued')
on conflict do nothing;

create or replace function public.bl_canonical_proposal_immutable() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.proposal_kind='canonical_issued' and current_setting('app.canonical_issuance',true)<>'on' then
      raise exception 'Canonical proposals may only be created by issuance' using errcode='42501';
    end if;
    return new;
  end if;
  if old.proposal_kind='canonical_issued' and (
    new.proposal_kind is distinct from old.proposal_kind or new.source_quote_id is distinct from old.source_quote_id
    or new.lead_origin_id is distinct from old.lead_origin_id or new.client_id is distinct from old.client_id
    or new.proposal_number is distinct from old.proposal_number or new.revision_number is distinct from old.revision_number
    or new.supersedes_proposal_id is distinct from old.supersedes_proposal_id or new.currency is distinct from old.currency
    or new.title is distinct from old.title or new.client_note is distinct from old.client_note
    or new.line_items is distinct from old.line_items or new.subtotal is distinct from old.subtotal
    or new.discount is distinct from old.discount or new.total is distinct from old.total or new.deposit is distinct from old.deposit
    or new.recurring_total is distinct from old.recurring_total or new.recurring_cadence is distinct from old.recurring_cadence
    or new.optional_one_time_total is distinct from old.optional_one_time_total
    or new.optional_recurring_total is distinct from old.optional_recurring_total or new.valid_until is distinct from old.valid_until
    or new.issued_at is distinct from old.issued_at or new.issued_by is distinct from old.issued_by
    or new.issuance_key is distinct from old.issuance_key or new.source_run_id is distinct from old.source_run_id
    or new.source_proposal_version_id is distinct from old.source_proposal_version_id
    or new.source_review_event_id is distinct from old.source_review_event_id
  ) then raise exception 'Canonical proposal commercial snapshot is immutable' using errcode='23514'; end if;
  return new;
end $$;
create trigger canonical_proposal_immutable before insert or update on public.proposals for each row execute function public.bl_canonical_proposal_immutable();

create or replace function public.bl_canonical_proposal_items_immutable() returns trigger language plpgsql set search_path=public as $$
declare v_kind public.proposal_kind; v_quote_status public.quote_status;
begin
  select p.proposal_kind,q.status into v_kind,v_quote_status from public.proposals p left join public.quotes q on q.id=p.source_quote_id
   where p.id=coalesce(new.proposal_id,old.proposal_id);
  if v_kind='canonical_issued' and not (tg_op='INSERT' and v_quote_status='approved' and current_setting('app.canonical_issuance',true)='on') then
    raise exception 'Canonical proposal items are immutable' using errcode='23514';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger canonical_proposal_items_immutable before insert or update or delete on public.proposal_items for each row execute function public.bl_canonical_proposal_items_immutable();

create or replace function public.bl_review_proposal_quote(p_quote_id text,p_expected_updated_at timestamptz,p_action text)
returns table(quote_id text,status public.quote_status,updated_at timestamptz)
language plpgsql security invoker set search_path=public as $$
declare q public.quotes%rowtype; uid text; target public.quote_status; stamp timestamptz:=clock_timestamp();
begin
 if public.bl_role() not in ('owner','admin') then raise exception 'Quote approval requires owner/admin' using errcode='42501'; end if;
 select id into uid from public.users where auth_user_id=auth.uid();
 select * into q from public.quotes where id=p_quote_id for update;
 if not found then raise exception 'Quote not found' using errcode='P0002'; end if;
 if q.commercial_mode<>'proposal_only' then raise exception 'Only proposal-only quotes use canonical approval' using errcode='23514'; end if;
 if q.updated_at is distinct from p_expected_updated_at then raise exception 'Quote was updated by another editor' using errcode='40001'; end if;
 if p_action='approve' and q.status='internal_review' then target:='approved';
 elsif p_action='revoke' and q.status='approved' then target:='internal_review';
 else raise exception 'Illegal canonical quote review action' using errcode='23514'; end if;
 if target='approved' and (not exists(select 1 from public.quote_items qi where qi.quote_id=q.id)
   or exists(select 1 from public.quote_items qi where qi.quote_id=q.id and not qi.optional and qi.unit_amount is null)) then
   raise exception 'Required commercial scope must be fully priced before approval' using errcode='23514';
 end if;
 insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at)
 values('quote','quotes',q.id,q.status::text,target::text,uid,'commercial '||p_action,stamp);
 update public.quotes set status=target,
  commercial_approved_at=case when target='approved' then stamp else null end,
  commercial_approved_by=case when target='approved' then uid else null end,
  commercial_approved_state=case when target='approved' then stamp else null end,
  updated_at=stamp where id=q.id;
 return query select q.id,target,stamp;
end $$;

create or replace function public.bl_bind_proposal_quote_client(p_quote_id text,p_client_id text,p_expected_updated_at timestamptz)
returns table(quote_id text,client_id text,updated_at timestamptz)
language plpgsql security invoker set search_path=public as $$
declare q public.quotes%rowtype; stamp timestamptz:=clock_timestamp(); uid text;
begin
 if public.bl_role() not in ('owner','admin') then raise exception 'Client binding requires owner/admin' using errcode='42501'; end if;
 select id into uid from public.users where auth_user_id=auth.uid();
 select * into q from public.quotes where id=p_quote_id for update;
 if not found then raise exception 'Quote not found' using errcode='P0002'; end if;
 if q.commercial_mode<>'proposal_only' or q.lead_id is null or q.client_id is not null then raise exception 'Quote is not eligible for client binding' using errcode='23514'; end if;
 if q.updated_at is distinct from p_expected_updated_at then raise exception 'Quote was updated by another editor' using errcode='40001'; end if;
 if not exists(select 1 from public.clients where id=p_client_id) then raise exception 'Client not found' using errcode='P0002'; end if;
 update public.quotes set client_id=p_client_id,updated_at=stamp where id=q.id;
 insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at)
 values('quote','quotes',q.id,q.status::text,q.status::text,uid,'bound existing client '||p_client_id,stamp);
 return query select q.id,p_client_id,stamp;
end $$;

create or replace function public.bl_issue_canonical_proposal(p_quote_id text,p_expected_updated_at timestamptz)
returns table(proposal_id text,proposal_number text,outcome text,item_count integer)
language plpgsql security invoker set search_path=public as $$
declare q public.quotes%rowtype; uid text; ikey text; existing public.proposals%rowtype; pid text; pnum text; cnt integer;
declare s bigint; d bigint; t bigint; rt bigint; oot bigint; ort bigint; cad text; cads integer; projection jsonb;
begin
 if public.bl_role() not in ('owner','admin') then raise exception 'Proposal issuance requires owner/admin' using errcode='42501'; end if;
 select id into uid from public.users where auth_user_id=auth.uid();
 select * into q from public.quotes where id=p_quote_id for update;
 if not found then raise exception 'Quote not found' using errcode='P0002'; end if;
 ikey:='issue:'||q.id||':'||q.commercial_approved_state::text;
 select * into existing from public.proposals where issuance_key=ikey;
 if found then return query select existing.id,existing.proposal_number,'already_issued',
   (select count(*)::integer from public.proposal_items pi where pi.proposal_id=existing.id); return; end if;
 if q.commercial_mode<>'proposal_only' or q.status<>'approved' then raise exception 'Quote is not approved for canonical issuance' using errcode='23514'; end if;
 if q.updated_at is distinct from p_expected_updated_at then raise exception 'Quote was updated by another editor' using errcode='40001'; end if;
 if q.commercial_approved_state is distinct from q.updated_at then raise exception 'Approved commercial state is stale' using errcode='23514'; end if;
 if q.client_id is null then raise exception 'Bind an existing client before issuance' using errcode='23514'; end if;
 select count(*)::integer,
   coalesce(sum(amount) filter(where pricing_type='one_time' and not optional),0),
   coalesce(sum(amount) filter(where pricing_type='recurring' and not optional),0),
   coalesce(sum(amount) filter(where pricing_type='one_time' and optional),0),
   coalesce(sum(amount) filter(where pricing_type='recurring' and optional),0),
   count(distinct recurrence_cadence) filter(where pricing_type='recurring'),max(recurrence_cadence) filter(where pricing_type='recurring'),
   jsonb_agg(jsonb_build_object('label',label,'description',description,'quantity',quantity,'unit_amount',unit_amount,'amount',amount,'sort',sort,'pricing_type',pricing_type,'recurrence_cadence',recurrence_cadence,'optional',optional) order by sort)
 into cnt,s,rt,oot,ort,cads,cad,projection from public.quote_items where quote_id=q.id;
 if cnt=0 then raise exception 'Proposal requires at least one item' using errcode='23514'; end if;
 if exists(select 1 from public.quote_items where quote_id=q.id and unit_amount is null) then raise exception 'Every issued item must be priced' using errcode='23514'; end if;
 if cads>1 or cad is distinct from q.recurring_cadence then raise exception 'Recurring cadence is inconsistent' using errcode='23514'; end if;
 d:=least(greatest(q.discount,0),s); t:=s-d;
 if (s,d,t,rt,oot,ort) is distinct from (q.subtotal,q.discount,q.total,q.recurring_total,q.optional_one_time_total,q.optional_recurring_total) then raise exception 'Stored quote totals do not match items' using errcode='23514'; end if;
 if q.currency !~ '^[A-Z]{3}$' then raise exception 'Invalid quote currency' using errcode='23514'; end if;
 pid:='prp_'||md5(q.id||':'||q.commercial_approved_state::text); pnum:='AUX-P-'||lpad(nextval('public.proposal_number_seq')::text,6,'0');
 perform set_config('app.canonical_issuance','on',true);
 begin
  insert into public.proposals(id,client_id,status,proposal_kind,source_quote_id,lead_origin_id,proposal_number,revision_number,title,client_note,line_items,subtotal,deposit,total,currency,discount,recurring_total,recurring_cadence,optional_one_time_total,optional_recurring_total,valid_until,issued_at,issued_by,issuance_key,source_run_id,source_proposal_version_id,source_review_event_id)
  values(pid,q.client_id,'issued','canonical_issued',q.id,q.lead_id,pnum,1,q.title,q.client_note,projection,s,0,t,q.currency,d,rt,cad,oot,ort,q.valid_until,clock_timestamp(),uid,ikey,q.source_run_id,q.source_proposal_version_id,q.source_review_event_id);
 exception when unique_violation then
  select * into existing from public.proposals where issuance_key=ikey;
  if not found then raise; end if;
  return query select existing.id,existing.proposal_number,'already_issued',(select count(*)::integer from public.proposal_items where proposal_id=existing.id); return;
 end;
 insert into public.proposal_items(id,proposal_id,label,description,quantity,unit_amount,amount,sort,pricing_type,recurrence_cadence,optional,source_work_item_id,source_evidence_refs)
 select 'pit_'||md5(pid||':'||id),pid,label,description,quantity,unit_amount,amount,sort,pricing_type,recurrence_cadence,optional,source_work_item_id,source_evidence_refs from public.quote_items where quote_id=q.id order by sort;
 perform set_config('app.canonical_issuance','off',true);
 insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at) values('quote','quotes',q.id,'approved','issued',uid,'canonical proposal '||pid,clock_timestamp());
 update public.quotes set status='issued',proposal_id=pid,updated_at=clock_timestamp() where id=q.id;
 return query select pid,pnum,'created',cnt;
end $$;

revoke execute on function public.bl_review_proposal_quote(text,timestamptz,text) from public,anon;
revoke execute on function public.bl_bind_proposal_quote_client(text,text,timestamptz) from public,anon;
revoke execute on function public.bl_issue_canonical_proposal(text,timestamptz) from public,anon;
grant execute on function public.bl_review_proposal_quote(text,timestamptz,text) to authenticated;
grant execute on function public.bl_bind_proposal_quote_client(text,text,timestamptz) to authenticated;
grant execute on function public.bl_issue_canonical_proposal(text,timestamptz) to authenticated;

-- Canonical proposals cannot enter the legacy client mutation RPC.
create or replace function public.bl_client_proposal_action(p_proposal_id text,p_action text,p_note text default '') returns public.proposal_status
language plpgsql security definer set search_path=public as $$
declare uid text; cid text; old_status public.proposal_status; pcid text; kind public.proposal_kind; target public.proposal_status;
begin
 select id,client_id into uid,cid from public.users where auth_user_id=auth.uid();
 if uid is null or public.bl_role()<>'client_admin' then raise exception 'Only a client admin may act on a proposal' using errcode='42501'; end if;
 select status,client_id,proposal_kind into old_status,pcid,kind from public.proposals where id=p_proposal_id;
 if old_status is null then raise exception 'Proposal not found' using errcode='P0002'; end if;
 if kind<>'legacy_sales' then raise exception 'Canonical issued proposals are read-only' using errcode='42501'; end if;
 if pcid<>cid then raise exception 'Not your proposal' using errcode='42501'; end if;
 target:=case p_action when 'view' then 'viewed' when 'accept' then 'accepted' when 'change' then 'change_requested' else null end;
 if target is null then raise exception 'Unknown action' using errcode='22023'; end if;
 if p_action='view' and old_status<>'sent' then return old_status; end if;
 if not exists(select 1 from public.state_transitions where machine='proposal' and from_state=old_status::text and to_state=target::text) then raise exception 'Illegal proposal move' using errcode='23514'; end if;
 insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at) values('proposal','proposals',p_proposal_id,old_status::text,target::text,uid,'client '||p_action,now());
 update public.proposals set status=target,viewed_at=case when p_action='view' then now() else viewed_at end,decided_at=case when p_action in ('accept','change') then now() else decided_at end,change_note=case when p_action='change' then nullif(p_note,'') else change_note end where id=p_proposal_id;
 return target;
end $$;

create or replace function public.bl_legacy_contract_proposal_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.proposals p where p.id=new.proposal_id and p.proposal_kind<>'legacy_sales') then
   raise exception 'Canonical issued proposals cannot enter the legacy contract flow' using errcode='23514';
 end if;
 return new;
end $$;
create trigger contracts_legacy_proposal_only before insert or update of proposal_id on public.contracts for each row execute function public.bl_legacy_contract_proposal_guard();
