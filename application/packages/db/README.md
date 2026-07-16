# @brightloop/db

Supabase schema for the BrightLoop platform: enums, tables, the state-transition
guard, RLS policies, the auth claims hook, and storage buckets.

> **The SQL now lives in `application/supabase/migrations/`**, not here — that is
> the layout the Supabase CLI requires. This package keeps the scripts and this
> documentation. Contents were moved unchanged.

> **Status: authored, NOT applied.** A hosted project exists but these migrations
> have never executed against it. Nothing here has touched production data.

## Migrations (applied in filename order)

| File | Purpose |
|---|---|
| `20260716000100_enums.sql` | Postgres enums generated from `packages/schema` MACHINES + ROLES. An illegal status **value** cannot be stored. |
| `20260716000200_tables.sql` | The 18 canonical entities. Client is the aggregate root; every client-scoped table carries `client_id`. |
| `20260716000300_transition_guard.sql` | `state_transitions` (DB mirror of MACHINES), the generic `BEFORE UPDATE` trigger, and the append-only `transition_log`. An illegal status **move** is rejected by the database. |
| `20260716000400_rls.sql` | RLS on every table. Claim helpers (`bl_role`, `bl_client_id`, `bl_is_internal`, `bl_is_finance`) + policies. **This is the authorization boundary.** |
| `20260716000500_auth_claims.sql` | The custom access token hook that stamps `role` + `client_id` into the JWT. RLS depends on it. |
| `20260716000600_storage.sql` | Buckets (`deliverables`, `media`, `avatars`, `contracts`) + path-scoped access. Only `media` is public-read. |
| `20260716000700_reputation.sql` | `portfolio_projects` + `testimonials`, and the anon publish gate (`public`/`featured` only). |

Order is load-bearing: `0400` defines `bl_is_internal()` / `bl_client_id()`, which
`0600` and `0700` depend on.

## Applying

```bash
export SUPABASE_ACCESS_TOKEN=<personal access token>   # or: supabase login
supabase link --project-ref <ref>                      # prompts for the DB password
supabase db push
```

Then register the auth hook: **Authentication → Hooks → Custom Access Token →
`public.custom_access_token_hook`**.

⚠️ **Without that dashboard step, no JWT carries `role`/`client_id`, so every RLS
policy denies and the app looks entirely broken.** That is the hook not being
registered — not a bug. `config.toml` registers hooks for LOCAL dev only; hosted
must be done in the dashboard.

Regenerate TypeScript DB types after any migration:

```bash
pnpm --filter @brightloop/db gen:types
```

## Design notes

- **`schema.js` wins.** If a machine changes in `packages/schema`, add a migration
  that updates `state_transitions` to match. The two must not drift.
- **`users.id` keeps the prefixed ULID** (`usr_…`) from the handoff convention and
  links to Supabase Auth via `auth_user_id uuid → auth.users(id)`.
- **`Project.milestoneIds`** is modeled as the `milestones.project_id` foreign key
  rather than a stored array — it is derived, per handoff §02.4.
- **`Project.progress`** is a column for read performance but is **derived** from
  milestone completion; it is not the source of truth.
- **Writes are internal-only in Sprint 0.** Client write paths (approve a
  deliverable, pay an invoice, sign a contract) each get a narrow, reviewed policy
  in the sprint that delivers them. There is deliberately no blanket client-write grant.
- **`transition_log` and `consents` are append-only** (enforced by trigger/policy).
- **Never store PAN.** `payments` holds only `last4` + `method`; Stripe holds the token.

## Verification (before any production data)

These are the checks the Sprint 6/9 gates must pass:

1. A `client_admin` for org A gets **zero rows** for every org-B record, via direct
   PostgREST calls with a crafted `client_id`.
2. Every illegal transition in `packages/schema` is rejected by the DB trigger,
   not just by the service layer.
3. `transition_log` rejects UPDATE and DELETE.
4. A JWT with no `role` claim can read nothing.
