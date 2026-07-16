-- =============================================================================
-- 0020 — Internal pricing engine (Sprint 5R). Pricing must NEVER reach a prospect.
--
-- Until now `configurations` carried estimate_low/high, and the client read
-- policy on configurations let a signed-in prospect read their own row — so the
-- internal estimate was one API call away. This moves all pricing into a
-- dedicated `pricing_estimates` table with an INTERNAL-ONLY policy (no client
-- policy at all, like quote_revisions / internal_notes / quote drafts).
--
-- After this, a prospect cannot read a price from ANY table, by policy — not just
-- because the UI stopped showing it.
-- =============================================================================

create table public.pricing_estimates (
  configuration_id text primary key references public.configurations (id) on delete cascade,
  client_id        text not null references public.clients (id) on delete cascade,
  effort_points    integer not null default 0,   -- internal effort model (~weeks)
  estimate_low     bigint not null default 0,     -- indicative dollars, INTERNAL ONLY
  estimate_high    bigint not null default 0,
  computed_at      timestamptz not null default now()
);
create index pricing_estimates_client_idx on public.pricing_estimates (client_id);

-- Preserve any estimates already captured on configurations before dropping them.
insert into public.pricing_estimates (configuration_id, client_id, estimate_low, estimate_high)
select c.id, c.client_id, coalesce(c.estimate_low, 0), coalesce(c.estimate_high, 0)
from public.configurations c
where c.client_id is not null
on conflict (configuration_id) do nothing;

alter table public.configurations drop column if exists estimate_low;
alter table public.configurations drop column if exists estimate_high;

-- INTERNAL-ONLY RLS. There is deliberately NO client policy: a prospect gets zero
-- rows, the same way they get zero internal notes or draft quotes.
alter table public.pricing_estimates enable row level security;

create policy "pricing_estimates_internal_all" on public.pricing_estimates
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

comment on table public.pricing_estimates is
  'Internal pricing engine output. INTERNAL-ONLY RLS — never readable by a prospect/client. Pricing must not be exposed (Sprint 5R spec §4).';
