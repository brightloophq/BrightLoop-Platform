-- =============================================================================
-- Public contact enquiries — the one anon write path into public.leads.
--
--     supabase test db
--
-- What has to be true:
--   1  an anonymous caller can file an enquiry and gets an id back
--   2  ...and still cannot READ the pipeline it just wrote to
--   3  the function fixes stage / source / value / owner, not the caller
--   4  every field is validated in the database, not only in the application
--   5  a repeated submit returns the row already recorded instead of a second
--   6  one address cannot file without limit
-- =============================================================================

begin;
create extension if not exists pgtap;
select no_plan();

-- ---------------------------------------------------------------------------
-- 1 · an anonymous caller can file an enquiry
-- ---------------------------------------------------------------------------
set local role anon;

select isnt(
  public.bl_submit_contact_enquiry('Ada Lovelace', 'Ada@Example.Test', 'Analytical Engines', 'We need a website that takes bookings.'),
  null,
  'anon can file a contact enquiry and receives the new lead id'
);

-- ---------------------------------------------------------------------------
-- 2 · ...and cannot read the pipeline
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from public.leads),
  0,
  'anon cannot read a single lead row, including the one it just created'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3 · the function owns the fields the caller must not choose
-- ---------------------------------------------------------------------------
select is( (select stage::text from public.leads where email = 'ada@example.test'),
           'new', 'the enquiry lands at the new stage' );
select is( (select source from public.leads where email = 'ada@example.test'),
           'contact_form', 'the source records where it came from' );
select is( (select value from public.leads where email = 'ada@example.test'),
           0, 'no value is attributed to an unqualified enquiry' );
select is( (select owner_id from public.leads where email = 'ada@example.test'),
           null, 'nobody owns it until someone picks it up' );
select is( (select email from public.leads where email = 'ada@example.test'),
           'ada@example.test', 'the address is normalised to lower case' );
select is( (select message from public.leads where email = 'ada@example.test'),
           'We need a website that takes bookings.', 'what they wrote is kept verbatim' );
select is( (select company from public.leads where email = 'ada@example.test'),
           'Analytical Engines', 'the company is kept' );

-- ---------------------------------------------------------------------------
-- 4 · validation lives in the database too
-- ---------------------------------------------------------------------------
set local role anon;

select throws_ok(
  $$ select public.bl_submit_contact_enquiry('', 'someone@example.test', '', 'A long enough message here.') $$,
  '23514', null, 'a missing name is refused'
);
select throws_ok(
  $$ select public.bl_submit_contact_enquiry('Name', 'not-an-email', '', 'A long enough message here.') $$,
  '23514', null, 'a malformed address is refused'
);
select throws_ok(
  $$ select public.bl_submit_contact_enquiry('Name', 'someone@example.test', '', 'short') $$,
  '23514', null, 'a message under ten characters is refused'
);
select throws_ok(
  $$ select public.bl_submit_contact_enquiry('Name', 'someone@example.test', '', repeat('x', 2001)) $$,
  '23514', null, 'a message over two thousand characters is refused'
);
select throws_ok(
  $$ select public.bl_submit_contact_enquiry(repeat('x', 81), 'someone@example.test', '', 'A long enough message here.') $$,
  '23514', null, 'an over-long name is refused'
);
select throws_ok(
  $$ select public.bl_submit_contact_enquiry('Name', 'someone@example.test', repeat('x', 121), 'A long enough message here.') $$,
  '23514', null, 'an over-long company is refused'
);

-- An empty company is legitimate — a sole trader has none.
select isnt(
  public.bl_submit_contact_enquiry('Sole Trader', 'sole@example.test', '  ', 'I work for myself and need a site.'),
  null,
  'an enquiry without a company is accepted'
);

reset role;
select is( (select company from public.leads where email = 'sole@example.test'),
           null, 'a blank company is stored as null, not an empty string' );

-- ---------------------------------------------------------------------------
-- 5 · a double submit is one enquiry
--
-- Run as the seeding role, not anon: the assertion has to READ the row it is
-- asserting about, and anon deliberately cannot (test 2). The dedupe is in the
-- function, so the caller's role does not change it.
-- ---------------------------------------------------------------------------
select is(
  public.bl_submit_contact_enquiry('Ada Lovelace', 'ada@example.test', 'Analytical Engines', 'We need a website that takes bookings.'),
  (select id from public.leads where email = 'ada@example.test'),
  'submitting the same enquiry again returns the row already recorded'
);
select is( (select count(*)::integer from public.leads where email = 'ada@example.test'),
           1, 'and files nothing new' );

-- ---------------------------------------------------------------------------
-- 6 · one address cannot file without limit
-- ---------------------------------------------------------------------------
select public.bl_submit_contact_enquiry('Flooder', 'flood@example.test', '', 'Distinct enquiry number one.');
select public.bl_submit_contact_enquiry('Flooder', 'flood@example.test', '', 'Distinct enquiry number two.');
select public.bl_submit_contact_enquiry('Flooder', 'flood@example.test', '', 'Distinct enquiry number three.');
select public.bl_submit_contact_enquiry('Flooder', 'flood@example.test', '', 'Distinct enquiry number four.');
select public.bl_submit_contact_enquiry('Flooder', 'flood@example.test', '', 'Distinct enquiry number five.');

select throws_ok(
  $$ select public.bl_submit_contact_enquiry('Flooder', 'flood@example.test', '', 'Distinct enquiry number six.') $$,
  '53400', null, 'a sixth enquiry from one address within the hour is refused'
);
select is( (select count(*)::integer from public.leads where email = 'flood@example.test'),
           5, 'the refused enquiry left no row behind' );

select * from finish();
rollback;
