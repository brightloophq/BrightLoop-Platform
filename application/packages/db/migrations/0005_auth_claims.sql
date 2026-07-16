-- =============================================================================
-- 0005 — Custom access token hook: put `role` and `client_id` into the JWT.
--
-- This is what makes RLS work. Every policy in 0004 reads these claims, so they
-- must be stamped by the auth server at token-issue time — never supplied by the
-- client. Register this hook in Supabase:
--   Dashboard → Authentication → Hooks → Custom Access Token → public.custom_access_token_hook
--   (or `[auth.hook.custom_access_token] uri = "pg-functions://postgres/public/custom_access_token_hook"`)
--
-- Approved Decision C: email/password + magic link at V1. Google/Microsoft/SSO
-- are V2 — no provider wiring here.
-- =============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_claims    jsonb;
  v_meta      jsonb;
  v_role      text;
  v_client_id text;
begin
  select u.role::text, u.client_id
    into v_role, v_client_id
  from public.users u
  where u.auth_user_id = (event ->> 'user_id')::uuid;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_meta := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);

  -- A user row with no role gets NO role claim: RLS then denies everything,
  -- which is the correct default. Never invent a fallback role here.
  if v_role is not null then
    v_meta := jsonb_set(v_meta, '{role}', to_jsonb(v_role));
    v_meta := jsonb_set(
      v_meta,
      '{client_id}',
      case when v_client_id is null then 'null'::jsonb else to_jsonb(v_client_id) end
    );
  end if;

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_meta);
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Stamps app_metadata.role and app_metadata.client_id into the access token. RLS depends on these claims.';

-- The auth server needs to execute the hook and read the users table.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on table public.users to supabase_auth_admin;

-- Nobody else may execute the hook — it must not be callable by clients.
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

create policy "users_select_auth_admin" on public.users
  as permissive for select
  to supabase_auth_admin
  using (true);
