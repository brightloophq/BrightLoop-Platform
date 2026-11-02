-- Canonical invoices still do not persist currency; do not publish or set
-- non-USD deposits through any legacy proposal transition path.
begin;
create function public.bl_guard_proposal_publication_currency()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if new.status = 'sent' and new.status is distinct from old.status and new.currency <> 'USD' then
    raise exception 'Only USD proposals can be published while invoice currency support is unavailable' using errcode = '22023';
  end if;
  if new.deposit <> old.deposit and new.deposit <> 0 and new.currency <> 'USD' then
    raise exception 'Non-USD deposits are unavailable until invoice currency support is added' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger proposals_currency_publication_guard
  before update on public.proposals
  for each row execute function public.bl_guard_proposal_publication_currency();
revoke all on function public.bl_guard_proposal_publication_currency() from public, anon, authenticated, service_role;
commit;
