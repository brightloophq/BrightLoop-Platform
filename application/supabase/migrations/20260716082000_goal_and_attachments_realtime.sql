-- =============================================================================
-- 0022 — Persist the prospect's goal + stream chat attachments live (Sprint 5R).
--
-- `goal` is the prospect's stated primary objective from the assessment — part of
-- the discovery context the strategist sees. Stored on configurations (their own
-- input, client-readable).
--
-- message_attachments joins the realtime publication so an uploaded file appears
-- live in the thread for both sides (RLS still gates each row).
-- =============================================================================
alter table public.configurations add column if not exists goal text;

alter publication supabase_realtime add table public.message_attachments;
