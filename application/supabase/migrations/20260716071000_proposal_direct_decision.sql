-- =============================================================================
-- 0019 — Allow a client to accept / request-changes on a proposal straight from
-- `sent`, without first tripping `viewed`.
--
-- The portal marks a proposal `viewed` on open, but that's a UI nicety, not a
-- precondition — a client accepting immediately shouldn't hit an illegal-move
-- error over a view/accept race. This mirrors the quote machine (sent → accepted)
-- and keeps packages/schema and state_transitions in lockstep.
-- =============================================================================
insert into public.state_transitions (machine, from_state, to_state) values
  ('proposal', 'sent', 'accepted'),
  ('proposal', 'sent', 'change_requested')
on conflict (machine, from_state, to_state) do nothing;
