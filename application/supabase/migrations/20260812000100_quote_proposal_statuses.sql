-- Enum values must commit before dependent functions/tables reference them.
alter type public.quote_status add value if not exists 'approved';
alter type public.quote_status add value if not exists 'issued';
alter type public.proposal_status add value if not exists 'issued';
