-- Retain the original Sprint 1G diagnostic contract while guarding revisions.
begin;
create or replace function public.bl_guard_converted_proposal_terms()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.scanner_sales_conversions c where c.proposal_id=old.id)
    and (new.line_items is distinct from old.line_items or new.subtotal is distinct from old.subtotal
      or new.deposit is distinct from old.deposit or new.total is distinct from old.total or new.currency is distinct from old.currency
      or new.discount_minor is distinct from old.discount_minor or new.valid_until is distinct from old.valid_until) then
    raise exception 'Converted proposal terms are derived from immutable reviewed versions' using errcode='55000';
  end if;
  if exists(select 1 from public.scanner_sales_proposal_revisions r where r.proposal_id=old.id)
    and (new.line_items is distinct from old.line_items or new.subtotal is distinct from old.subtotal
      or new.deposit is distinct from old.deposit or new.total is distinct from old.total or new.currency is distinct from old.currency
      or new.discount_minor is distinct from old.discount_minor or new.valid_until is distinct from old.valid_until) then
    raise exception 'Scanner sales proposal terms are immutable; create a new reviewed proposal revision' using errcode='55000';
  end if;
  if new.status='sent' and new.status is distinct from old.status
    and exists(select 1 from public.scanner_sales_conversions c where c.proposal_id=old.id)
    and not (old.status='draft' and exists(select 1 from public.scanner_sales_publications d where d.proposal_id=old.id and d.client_id=old.client_id)) then
    raise exception 'Converted proposals require the authorized publication operation' using errcode='42501';
  end if;
  if new.status='sent' and new.status is distinct from old.status
    and exists(select 1 from public.scanner_sales_proposal_revisions r where r.proposal_id=old.id)
    and not (old.status='draft' and exists(select 1 from public.scanner_sales_publications d where d.proposal_id=old.id and d.client_id=old.client_id)) then
    raise exception 'Revision proposals require the authorized publication operation' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.bl_guard_converted_proposal_terms() from public,anon,authenticated,service_role;
commit;
