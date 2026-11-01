-- =============================================================================
-- 20260813000100 — The public contact form writes into the leads pipeline.
--
-- The contact form validated every field and then told the visitor the channel
-- was not live, offering a mailto instead. It had nowhere to put an enquiry:
-- `leads` is internal-only under RLS, and there was no column for what somebody
-- actually wrote.
--
-- WHY A FUNCTION RATHER THAN AN INSERT POLICY
--   The alternative is an `anon` INSERT policy on `public.leads`. That widens
--   the table's ACL permanently and lets an anonymous caller choose every
--   column: stage, owner, value, industry. A `with check` can pin those, but it
--   cannot bound a length or reject a malformed address, and the grant outlives
--   any reason for it.
--   This function is the whole boundary instead. Its signature is four text
--   arguments, it validates each one, and it writes exactly one row with the
--   stage, source, value and owner fixed by the function rather than the
--   caller. It returns the new id and nothing else — `anon` gains no way to
--   read the pipeline it just wrote to.
--
-- WHY SECURITY DEFINER
--   Because the caller has no identity at all. It is the narrowest possible
--   escalation: one INSERT, into one table, with four validated values.
--
-- ABUSE, IN LAYERS
--   Cloudflare Turnstile gates the endpoint in the application (it fails CLOSED
--   in production, see lib/turnstile.ts). Below it, this function collapses a
--   repeated submit into the row already recorded, and caps how many enquiries
--   one address can file in an hour. Neither layer trusts the other.
-- =============================================================================

-- What the visitor wrote. Nullable because every lead created by hand in the
-- admin has no message, and a lead is not less real for lacking one.
alter table public.leads add column message text;

alter table public.leads
  add constraint leads_message_length
  check (message is null or char_length(message) <= 4000);

-- Both guards below filter on (source, email, created_at).
create index leads_source_created_at_idx on public.leads (source, created_at desc);

create function public.bl_submit_contact_enquiry(
  p_name text,
  p_email text,
  p_company text,
  p_message text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := btrim(coalesce(p_name, ''));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_company text := btrim(coalesce(p_company, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_recent  integer;
  v_id      text;
begin
  -- The application validates the same rules and reports them per field. These
  -- are here because this function is reachable without the application.
  if char_length(v_name) = 0 or char_length(v_name) > 80 then
    raise exception 'A name of 1-80 characters is required' using errcode = '23514';
  end if;
  if char_length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email address is required' using errcode = '23514';
  end if;
  if char_length(v_company) > 120 then
    raise exception 'A company name of 120 characters or fewer is required' using errcode = '23514';
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 2000 then
    raise exception 'A message of 10-2000 characters is required' using errcode = '23514';
  end if;

  -- Same address, same words, within ten minutes: a double submit, not a second
  -- enquiry. Return the row already recorded rather than filing it twice — the
  -- caller supplied both values, so this tells them nothing they did not send.
  select l.id into v_id
  from public.leads l
  where l.source = 'contact_form'
    and lower(l.email) = v_email
    and l.message = v_message
    and l.created_at > now() - interval '10 minutes'
  order by l.created_at desc
  limit 1;
  if found then
    return v_id;
  end if;

  select count(*)::integer into v_recent
  from public.leads l
  where l.source = 'contact_form'
    and lower(l.email) = v_email
    and l.created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'Too many enquiries from this address in the last hour'
      using errcode = '53400';
  end if;

  v_id := 'lead_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);

  -- stage, value, owner and source are the FUNCTION's, never the caller's.
  insert into public.leads (id, name, company, email, industry, value, stage, owner_id, source, message)
  values (v_id, v_name, nullif(v_company, ''), v_email, null, 0, 'new', null, 'contact_form', v_message);

  -- Recorded HERE, in the same transaction, rather than by the caller: the
  -- application's emitEvent() writes as the caller, and `analytics_events`
  -- admits inserts only from `authenticated`. A visitor filing an enquiry is
  -- anonymous, so that call would have been swallowed every single time.
  -- The event carries neither the address nor the message — only that one came.
  insert into public.analytics_events (name, props, source)
  values ('contact.enquiry', jsonb_build_object('leadId', v_id, 'source', 'contact_form'), 'server');

  return v_id;
end;
$$;

revoke execute on function public.bl_submit_contact_enquiry(text, text, text, text) from public;
grant execute on function public.bl_submit_contact_enquiry(text, text, text, text) to anon, authenticated;

comment on function public.bl_submit_contact_enquiry(text, text, text, text) is
  'Records one public contact enquiry as a new lead. The only write path into public.leads available to an unauthenticated caller; validates every field, fixes stage/source/value/owner itself, and returns the new id without exposing any existing row.';

comment on column public.leads.message is
  'What a contact-form enquiry said. Null for leads entered by hand in the admin.';
